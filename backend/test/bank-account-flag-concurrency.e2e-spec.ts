import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureTestAppValidation } from './utils/configure-test-app-validation';
import { ChartOfAccountService } from '../src/modules/accounting/services/chart-of-account.service';
import { AccountingSettingsService } from '../src/modules/accounting/services/accounting-settings.service';

/**
 * #1298 D8: COA updates and Settings updates serialise on the accounting_settings
 * row lock. Each case holds that lock in transaction T, writes the COMPETING
 * change inside T, starts the call under test, and PROVES T blocks it (its
 * backend waits on a Lock, lists T's pid in pg_blocking_pids(), and is running
 * the settings-row FOR UPDATE) before committing T. Without the lock the call
 * settles early against stale state, so the "blocked" assertion is the one that
 * goes red.
 */
const runId = randomUUID().slice(0, 6);
let app: INestApplication;
let ds: DataSource;
let coa: ChartOfAccountService;
let settingsSvc: AccountingSettingsService;
let settingsSnapshot: Record<string, string>;
const ownedAccountIds: string[] = [];

async function ownedAsset(tag: string, isBankAccount: boolean): Promise<string> {
  const [parent] = await ds.query(`SELECT id FROM chart_of_account WHERE code = '1000'`);
  const [row] = await ds.query(
    `INSERT INTO chart_of_account (code, name, type, "parentId", "isSystem", "isPostable", "isActive", "isBankAccount")
     VALUES ($1, $2, 'Asset', $3, false, true, true, $4) RETURNING id`,
    [`CC-${tag}-${runId}`.slice(0, 20), `CC ${tag} ${runId}`, parent.id, isBankAccount],
  );
  ownedAccountIds.push(row.id);
  return row.id;
}

/**
 * Wait until the call under test is blocked BY THE HOLDER, on the config lock.
 * Accepts only a backend that (a) is waiting on a Lock, (b) has the holder's pid
 * in pg_blocking_pids(), and (c) is executing the settings-row FOR UPDATE that
 * withBalanceSheetConfigLock issues. Any other lock wait in the database is
 * ignored, so an unrelated waiter can never satisfy this.
 */
async function waitForBlockedByHolder(holderPid: number): Promise<number> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const rows = await ds.query(
      `SELECT pid FROM pg_stat_activity
        WHERE datname = current_database()
          AND wait_event_type = 'Lock'
          AND $1 = ANY(pg_blocking_pids(pid))
          AND query ILIKE '%accounting_settings%'
          AND query ILIKE '%FOR UPDATE%'`,
      [holderPid],
    );
    if (rows.length > 1) throw new Error(`expected one waiter blocked by ${holderPid}, found ${rows.length}`);
    if (rows.length === 1) return rows[0].pid;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('the call under test was never blocked by the lock holder on the accounting_settings lock');
}

type Outcome = { ok: true } | { ok: false; error: any };

async function holdLockThen(
  competing: (q: (sql: string, params?: unknown[]) => Promise<any>) => Promise<void>,
  call: () => Promise<unknown>,
): Promise<Outcome> {
  const qr = ds.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  let pending: Promise<Outcome> | undefined;
  try {
    await qr.query(`SELECT id FROM accounting_settings WHERE id = true FOR UPDATE`);
    await competing((sql, params) => qr.query(sql, params as any[]));
    const [{ pid: holderPid }] = await qr.query(`SELECT pg_backend_pid() AS pid`);
    let settled = false;
    pending = call().then(
      () => ({ ok: true as const }),
      (error) => ({ ok: false as const, error }),
    );
    void pending.then(() => { settled = true; });
    const waiterPid = await waitForBlockedByHolder(holderPid);
    expect(waiterPid).not.toBe(holderPid);
    expect(settled).toBe(false);
    await qr.commitTransaction();
    return await pending;
  } finally {
    // On ANY failure path: release the lock first (rollback), THEN drain the
    // call, so it never outlives the test and hits a closed app or pool.
    if (qr.isTransactionActive) await qr.rollbackTransaction();
    await qr.release();
    if (pending) await pending;
  }
}

beforeAll(async () => {
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleFixture.createNestApplication();
  configureTestAppValidation(app);
  await app.init();
  ds = app.get(DataSource);
  coa = app.get(ChartOfAccountService);
  settingsSvc = app.get(AccountingSettingsService);
});

beforeEach(async () => {
  [settingsSnapshot] = await ds.query(
    `SELECT "bankAccountId", "cashAccountId" FROM accounting_settings WHERE id = true`,
  );
});

afterEach(async () => {
  await ds.query(
    `UPDATE accounting_settings SET "bankAccountId" = $1, "cashAccountId" = $2 WHERE id = true`,
    [settingsSnapshot.bankAccountId, settingsSnapshot.cashAccountId],
  );
});

afterAll(async () => {
  if (ownedAccountIds.length) {
    await ds.query(`DELETE FROM chart_of_account WHERE id = ANY($1)`, [ownedAccountIds]);
  }
  await app.close();
});

const flagOf = async (id: string) =>
  (await ds.query(`SELECT "isBankAccount" FROM chart_of_account WHERE id = $1`, [id]))[0].isBankAccount;

describe('bank flag vs Accounting Settings — serialisation (#1298)', () => {
  it('Settings selects X as the bank while COA unflags X: the unflag is rejected', async () => {
    const x = await ownedAsset('X', true);
    const result = await holdLockThen(
      (q) => q(`UPDATE accounting_settings SET "bankAccountId" = $1 WHERE id = true`, [x]),
      () => coa.update(x, { isBankAccount: false } as any, 'e2e'),
    );
    expect(result.ok).toBe(false);
    expect((result as any).error.message).toBe(
      'Account is the Accounting Settings Bank account and must remain a bank account',
    );
    expect(await flagOf(x)).toBe(true);
  });

  it('COA flags Y while Settings selects Y as Cash: the flag is rejected', async () => {
    const y = await ownedAsset('Y', false);
    const result = await holdLockThen(
      (q) => q(`UPDATE accounting_settings SET "cashAccountId" = $1 WHERE id = true`, [y]),
      () => coa.update(y, { isBankAccount: true } as any, 'e2e'),
    );
    expect(result.ok).toBe(false);
    expect((result as any).error.message).toBe(
      'This account is the Accounting Settings Cash account and cannot be a bank account',
    );
    expect(await flagOf(y)).toBe(false);
  });

  it('mirror: COA flags Y while a Settings update selects Y as Cash — the Settings update is rejected', async () => {
    const y = await ownedAsset('YM', false);
    const result = await holdLockThen(
      (q) => q(`UPDATE chart_of_account SET "isBankAccount" = true WHERE id = $1`, [y]),
      () => settingsSvc.update({ cashAccountId: y } as any, 'e2e'),
    );
    expect(result.ok).toBe(false);
    expect((result as any).error.message).toBe('cashAccountId: a bank account cannot be used here');
    const [s] = await ds.query(`SELECT "cashAccountId" FROM accounting_settings WHERE id = true`);
    expect(s.cashAccountId).toBe(settingsSnapshot.cashAccountId);
  });
});
