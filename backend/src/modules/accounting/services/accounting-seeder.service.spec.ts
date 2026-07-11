import { AccountingSeederService, CoaRow } from './accounting-seeder.service';
import { STANDARD_COA_GROUPS, STANDARD_COA_CHILDREN, SETTINGS_CODE_MAP } from '../data/standard-coa';

// Fake with transactional semantics: transaction() snapshots state, runs the body,
// and restores the snapshot if the body throws (models Postgres ROLLBACK).
function makeFakeDb(opts: {
  coa: CoaRow[];
  settings: Record<string, any> | null;
  failInsertCoaOn?: string; // code whose insert throws (to trigger rollback path)
}) {
  let coa = opts.coa.map((r) => ({ ...r }));
  let settings = opts.settings ? { ...opts.settings } : null;
  const advisoryLocks: number[] = [];

  const managerApi = {
    async advisoryLock(key: number) {
      advisoryLocks.push(key);
    },
    async coaCount() {
      return coa.length;
    },
    async findCoaRowsByCode(code: string): Promise<CoaRow[]> {
      return coa.filter((r) => r.code === code).map((r) => ({ ...r }));
    },
    async insertCoa(row: { code: string; name: string; type: string; parentId: string | null }) {
      if (opts.failInsertCoaOn && row.code === opts.failInsertCoaOn) {
        throw new Error(`simulated DB failure inserting ${row.code}`);
      }
      if (coa.some((r) => r.code === row.code)) return; // ON CONFLICT DO NOTHING
      coa.push({
        id: `id-${row.code}`,
        code: row.code,
        name: row.name,
        type: row.type,
        parentId: row.parentId,
        isSystem: true,
        isPostable: row.parentId !== null,
      });
    },
    async getSettings() {
      return settings ? { ...settings } : null;
    },
    async insertSettings(row: Record<string, any>) {
      if (settings) return; // singleton conflict
      settings = { ...row };
    },
  };

  return {
    advisoryLocks,
    // transaction() gives the seeder a manager and rolls back on throw.
    async transaction(body: (m: typeof managerApi) => Promise<void>) {
      const snapCoa = coa.map((r) => ({ ...r }));
      const snapSettings = settings ? { ...settings } : null;
      try {
        await body(managerApi);
      } catch (e) {
        coa = snapCoa;
        settings = snapSettings;
        throw e;
      }
    },
    snapshotSettings: () => settings,
    snapshotCoa: () => coa,
  };
}

function fullCoa(): CoaRow[] {
  const groups = STANDARD_COA_GROUPS.map((g) => ({
    id: `id-${g.code}`, code: g.code, name: g.name, type: g.type as string,
    parentId: null, isSystem: true, isPostable: false,
  }));
  const children = STANDARD_COA_CHILDREN.map((c) => ({
    id: `id-${c.code}`, code: c.code, name: c.name, type: c.type as string,
    parentId: `id-${c.parentCode}`, isSystem: true, isPostable: true,
  }));
  return [...groups, ...children];
}

function healthySettings(): Record<string, any> {
  const s: Record<string, any> = { id: true };
  for (const [col, code] of Object.entries(SETTINGS_CODE_MAP)) s[col] = `id-${code}`;
  return s;
}

// The seeder is constructed with a fake exposing transaction(); the production
// path (real DataSource) is exercised by the e2e in Task 5.
function svcWith(db: any) {
  return new AccountingSeederService(db as any);
}

describe('AccountingSeederService', () => {
  it('branch 1: empty COA + no settings -> seeds full COA and settings', async () => {
    const db = makeFakeDb({ coa: [], settings: null });
    await svcWith(db).seed();
    expect(db.snapshotCoa().length).toBe(STANDARD_COA_GROUPS.length + STANDARD_COA_CHILDREN.length);
    expect(db.snapshotSettings()).not.toBeNull();
    expect(db.snapshotSettings()!.cashAccountId).toBe('id-1100');
  });

  it('branch 2a: partial COA (missing required code) -> throws, no writes', async () => {
    const partial = fullCoa().filter((r) => r.code !== '5100');
    const db = makeFakeDb({ coa: partial, settings: null });
    await expect(svcWith(db).seed()).rejects.toThrow(/5100/);
    expect(db.snapshotSettings()).toBeNull();
    expect(db.snapshotCoa().length).toBe(partial.length);
  });

  it('branch 2b: duplicate required code -> throws citing the duplicate, no writes', async () => {
    const dup = fullCoa();
    dup.push({ id: 'id-1100-dup', code: '1100', name: 'Cash', type: 'Asset', parentId: 'id-1000', isSystem: true, isPostable: true });
    const db = makeFakeDb({ coa: dup, settings: null });
    await expect(svcWith(db).seed()).rejects.toThrow(/duplicate.*1100|1100.*duplicate/i);
    expect(db.snapshotSettings()).toBeNull();
  });

  it('branch 2c: healthy codes but wrong hierarchy (child parentId mismatch) -> throws, no writes', async () => {
    const bad = fullCoa().map((r) => (r.code === '1100' ? { ...r, parentId: 'id-2000' } : r));
    const db = makeFakeDb({ coa: bad, settings: null });
    await expect(svcWith(db).seed()).rejects.toThrow(/1100.*parent|hierarchy|parent.*1100/i);
    expect(db.snapshotSettings()).toBeNull();
  });

  it('branch 2d: healthy codes but wrong flag (group isPostable=true) -> throws, no writes', async () => {
    const bad = fullCoa().map((r) => (r.code === '1000' ? { ...r, isPostable: true } : r));
    const db = makeFakeDb({ coa: bad, settings: null });
    await expect(svcWith(db).seed()).rejects.toThrow(/1000/);
    expect(db.snapshotSettings()).toBeNull();
  });

  it('branch 3: empty COA + settings present -> throws, no writes', async () => {
    const db = makeFakeDb({ coa: [], settings: healthySettings() });
    await expect(svcWith(db).seed()).rejects.toThrow(/singleton|inconsistent|anomal/i);
    expect(db.snapshotCoa().length).toBe(0);
  });

  it('branch 4: healthy COA + no settings -> inserts settings only (self-heal)', async () => {
    const coa = fullCoa();
    const db = makeFakeDb({ coa, settings: null });
    await svcWith(db).seed();
    expect(db.snapshotCoa().length).toBe(coa.length); // no COA added
    expect(db.snapshotSettings()!.cashAccountId).toBe('id-1100');
  });

  it('branch 5: healthy COA + correct settings -> no-op', async () => {
    const db = makeFakeDb({ coa: fullCoa(), settings: healthySettings() });
    await expect(svcWith(db).seed()).resolves.toBeUndefined();
  });

  it('branch 5 variant: healthy COA + wrong settings wiring -> throws, no modification', async () => {
    const wrong = healthySettings();
    wrong.cashAccountId = 'id-WRONG';
    const db = makeFakeDb({ coa: fullCoa(), settings: wrong });
    await expect(svcWith(db).seed()).rejects.toThrow(/cashAccountId|wiring|inconsistent/i);
    expect(db.snapshotSettings()!.cashAccountId).toBe('id-WRONG'); // unchanged
  });

  it('idempotent: running twice on empty DB does not duplicate', async () => {
    const db = makeFakeDb({ coa: [], settings: null });
    const svc = svcWith(db);
    await svc.seed();
    await svc.seed();
    expect(db.snapshotCoa().length).toBe(STANDARD_COA_GROUPS.length + STANDARD_COA_CHILDREN.length);
  });

  it('rollback: a DB failure mid-seed restores pre-transaction state and rethrows', async () => {
    // Insert fails on 5100 (a child) -> transaction body throws -> fake rolls back.
    const db = makeFakeDb({ coa: [], settings: null, failInsertCoaOn: '5100' });
    await expect(svcWith(db).seed()).rejects.toThrow(/5100/);
    expect(db.snapshotCoa().length).toBe(0); // fully rolled back, no partial COA
    expect(db.snapshotSettings()).toBeNull();
  });

  it('acquires the advisory lock before touching data', async () => {
    const db = makeFakeDb({ coa: [], settings: null });
    await svcWith(db).seed();
    expect(db.advisoryLocks.length).toBeGreaterThan(0);
  });

  it('concurrent invocation remains idempotent: two seeds on one empty DB yield exactly one COA set', async () => {
    // Two seeds against one shared fake state. insertCoa is ON CONFLICT DO NOTHING,
    // so the final row set is unique and complete regardless of interleaving.
    const db = makeFakeDb({ coa: [], settings: null });
    await Promise.all([svcWith(db).seed(), svcWith(db).seed()]);
    const codes = db.snapshotCoa().map((r) => r.code);
    const unique = new Set(codes);
    expect(codes.length).toBe(unique.size); // no duplicate rows
    expect(codes.length).toBe(STANDARD_COA_GROUPS.length + STANDARD_COA_CHILDREN.length);
  });
});