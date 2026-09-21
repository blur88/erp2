import { Test, TestingModule } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { BalanceSheetGroupService } from '../src/modules/accounting/services/balance-sheet-group.service';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ChartOfAccount } from '../src/modules/accounting/entities/chart-of-account.entity';
import { AccountingSettings } from '../src/modules/accounting/entities/accounting-settings.entity';
import { configureTestAppValidation } from './utils/configure-test-app-validation';
import {
  E2E_ADMIN_PASSWORD,
  SHARED_E2E_NS,
  removeSuiteAdmin,
  seedSuiteAdmin,
} from './utils/shared-e2e-fixture';
import { removeSuiteTraces } from './utils/shared-e2e-traces-fixture';

/**
 * Explicit Balance Sheet line grouping (issue #1239), end to end.
 *
 * What only a real database can establish, and why each case is here rather
 * than in the unit suites:
 *
 *  - the PRIMARY KEY on accountId actually rejects a duplicate,
 *  - the RESTRICT foreign key actually blocks deleting a grouped account,
 *  - the two write paths SERIALIZE under the settings-row lock (a
 *    single-connection fake cannot demonstrate this at all),
 *  - and the report reads the groups through the real HTTP route.
 *
 * Shared-DB discipline (#1197): every assertion is scoped to accounts this
 * suite creates. Nothing reads a global total or a "everything except mine"
 * query.
 */
describe('Balance Sheet account groups (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  const runId = Date.now().toString(36);

  let adminUserId = '';
  let adminUsername = '';
  let token = '';
  let put: (path: string, body?: any) => request.Test;
  let get: (path: string) => request.Test;

  // Suite-owned accounts.
  let cimbId = '';
  let maybankId = '';
  let atomeId = '';
  let inactiveId = '';
  let liabilityId = '';

  // The real settings values, restored in afterAll.
  let originalBankAccountId = '';
  let originalSupplierDepositAccountId = '';

  const ownedAccountIds: string[] = [];
  const ownedEntityIds: string[] = [];

  /** The complete-set PUT this feature uses. */
  const setGroups = (groups: { accountId: string; group: string }[]) =>
    put('/accounting/settings/balance-sheet-groups', { groups });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();
    ds = moduleFixture.get(DataSource);

    // Inside the shared namespace so no other suite's cleanup owns this row,
    // and run-unique so an interrupted rerun cannot collide.
    const admin = await seedSuiteAdmin(ds, `${SHARED_E2E_NS}_bsg_admin_${runId}`);
    adminUserId = admin.id;
    adminUsername = admin.username;

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: adminUsername, password: E2E_ADMIN_PASSWORD });
    token = login.body?.data?.accessToken ?? login.body?.accessToken;
    expect(typeof token).toBe('string');

    put = (path, body) =>
      request(app.getHttpServer())
        .put(path)
        .set('Authorization', `Bearer ${token}`)
        .send(body);
    get = (path) =>
      request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);

    const coa = ds.getRepository(ChartOfAccount);
    const parent = await coa.findOneByOrFail({ code: '1000' });

    // Unique codes: the leak check counts rows, and the unique index on code
    // means a crashed rerun would otherwise collide.
    const seedAccount = async (
      code: string,
      name: string,
      over: Record<string, unknown> = {},
    ) => {
      const account = (await coa.save(
        coa.create({
          code: `BSG-${code}-${runId}`.slice(0, 20),
          name,
          type: 'Asset',
          parentId: parent.id,
          isSystem: false,
          isPostable: true,
          isActive: true,
          ...over,
        } as any),
      )) as unknown as ChartOfAccount;
      ownedAccountIds.push(account.id);
      ownedEntityIds.push(account.id);
      return account.id;
    };

    cimbId = await seedAccount('CIMB', `CIMB ${runId}`);
    maybankId = await seedAccount('MAY', `Maybank ${runId}`);
    atomeId = await seedAccount('ATOME', `Atome ${runId}`);
    inactiveId = await seedAccount('INACT', `Inactive ${runId}`, { isActive: false });
    liabilityId = await seedAccount('LIAB', `Liability ${runId}`, {
      type: 'Liability',
      parentId: (await coa.findOneByOrFail({ code: '2000' })).id,
    });

    const settings = await ds
      .getRepository(AccountingSettings)
      .findOneByOrFail({ id: true } as any);
    originalBankAccountId = settings.bankAccountId;
    originalSupplierDepositAccountId = settings.supplierDepositAccountId;
  });

  afterEach(async () => {
    // Each test owns the whole table (replacement semantics), so reset between
    // them rather than letting order matter.
    if (ds?.isInitialized) {
      await ds.query('DELETE FROM balance_sheet_account_groups');
      await ds.query(
        `UPDATE accounting_settings SET "bankAccountId" = $1, "supplierDepositAccountId" = $2 WHERE id = true`,
        [originalBankAccountId, originalSupplierDepositAccountId],
      );
    }
  });

  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        await ds.query('DELETE FROM balance_sheet_account_groups');
        await ds.query(
          `UPDATE accounting_settings SET "bankAccountId" = $1, "supplierDepositAccountId" = $2 WHERE id = true`,
          [originalBankAccountId, originalSupplierDepositAccountId],
        );
        if (ownedAccountIds.length) {
          await ds.query(`DELETE FROM chart_of_account WHERE id = ANY($1)`, [
            ownedAccountIds,
          ]);
        }
        // Audit-log and search-query exhaust, scoped to ids this suite owns
        // (#1204) — every HTTP request above leaves rows behind.
        await removeSuiteTraces(ds, {
          userIds: [adminUserId],
          usernames: [adminUsername],
          entityIds: ownedEntityIds,
        });
        // Takes the USERNAME, not the id.
        await removeSuiteAdmin(ds, adminUsername);
      }
    } finally {
      await app?.close();
    }
  });

  describe('round trip', () => {
    it('stores and reads back both groups', async () => {
      const res = await setGroups([
        { accountId: cimbId, group: 'BANK_BALANCE' },
        { accountId: maybankId, group: 'BANK_BALANCE' },
        { accountId: atomeId, group: 'OTHER_CURRENT_ASSETS' },
      ]);
      expect(res.status).toBe(200);

      const list = await get('/accounting/settings/balance-sheet-groups');
      expect(list.status).toBe(200);
      const byId = new Map(
        (list.body as any[]).map((r) => [r.accountId, r]),
      );
      expect(byId.get(cimbId)).toMatchObject({ group: 'BANK_BALANCE', status: 'ok' });
      expect(byId.get(maybankId)).toMatchObject({ group: 'BANK_BALANCE' });
      expect(byId.get(atomeId)).toMatchObject({ group: 'OTHER_CURRENT_ASSETS' });
    });

    it('REPLACES rather than patches: an omitted account is removed', async () => {
      await setGroups([
        { accountId: cimbId, group: 'BANK_BALANCE' },
        { accountId: maybankId, group: 'BANK_BALANCE' },
      ]);
      await setGroups([{ accountId: cimbId, group: 'BANK_BALANCE' }]);

      const list = await get('/accounting/settings/balance-sheet-groups');
      expect((list.body as any[]).map((r) => r.accountId)).toEqual([cimbId]);
    });

    it('MOVES an account between groups without a primary-key collision', async () => {
      await setGroups([{ accountId: atomeId, group: 'BANK_BALANCE' }]);
      const res = await setGroups([
        { accountId: atomeId, group: 'OTHER_CURRENT_ASSETS' },
      ]);
      expect(res.status).toBe(200);

      const list = await get('/accounting/settings/balance-sheet-groups');
      expect(list.body).toEqual([
        expect.objectContaining({
          accountId: atomeId,
          group: 'OTHER_CURRENT_ASSETS',
        }),
      ]);
    });

    it('clears every grouping on an empty array', async () => {
      await setGroups([{ accountId: cimbId, group: 'BANK_BALANCE' }]);
      expect((await setGroups([])).status).toBe(200);
      const list = await get('/accounting/settings/balance-sheet-groups');
      expect(list.body).toEqual([]);
    });
  });

  describe('eligibility', () => {
    it('rejects an inactive account', async () => {
      const res = await setGroups([{ accountId: inactiveId, group: 'BANK_BALANCE' }]);
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/inactive/);
    });

    it('rejects a non-Asset account', async () => {
      const res = await setGroups([{ accountId: liabilityId, group: 'BANK_BALANCE' }]);
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/wrong type/);
    });

    it('rejects the same account listed twice (DTO guard, before any write)', async () => {
      const res = await setGroups([
        { accountId: cimbId, group: 'BANK_BALANCE' },
        { accountId: cimbId, group: 'OTHER_CURRENT_ASSETS' },
      ]);
      expect(res.status).toBe(400);
      const rows = await ds.query('SELECT 1 FROM balance_sheet_account_groups');
      expect(rows).toHaveLength(0);
    });
  });

  describe('database invariants', () => {
    it('the PRIMARY KEY makes membership of both groups unrepresentable', async () => {
      await setGroups([{ accountId: cimbId, group: 'BANK_BALANCE' }]);
      // Bypass the service entirely: the constraint must stand on its own.
      await expect(
        ds.query(
          `INSERT INTO balance_sheet_account_groups ("accountId", "groupLine") VALUES ($1, 'OTHER_CURRENT_ASSETS')`,
          [cimbId],
        ),
      ).rejects.toThrow(/duplicate key|unique/i);
    });

    it('RESTRICT blocks deleting an account out from under a grouping', async () => {
      await setGroups([{ accountId: maybankId, group: 'BANK_BALANCE' }]);
      // Postgres words a RESTRICT violation as "violates RESTRICT setting of
      // foreign key constraint", NOT the generic "violates foreign key
      // constraint" that a NO ACTION / cascade check produces. Matching the
      // specific wording is what distinguishes RESTRICT from a weaker rule.
      await expect(
        ds.query(`DELETE FROM chart_of_account WHERE id = $1`, [maybankId]),
      ).rejects.toThrow(/violates RESTRICT setting of foreign key constraint/i);
    });
  });

  describe('conflict rule across both write paths', () => {
    it('rejects the bank default in N39 while the N38 group is EMPTY', async () => {
      await ds.query(
        `UPDATE accounting_settings SET "bankAccountId" = $1 WHERE id = true`,
        [cimbId],
      );
      const res = await setGroups([
        { accountId: cimbId, group: 'OTHER_CURRENT_ASSETS' },
      ]);
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/N38 and N39/);
    });

    it('ACCEPTS the bank default in N39 when a non-empty N38 group excludes it', async () => {
      await ds.query(
        `UPDATE accounting_settings SET "bankAccountId" = $1 WHERE id = true`,
        [cimbId],
      );
      const res = await setGroups([
        { accountId: maybankId, group: 'BANK_BALANCE' },
        { accountId: cimbId, group: 'OTHER_CURRENT_ASSETS' },
      ]);
      expect(res.status).toBe(200);
    });

    it('rejects emptying the N38 group while the bank default sits in N39', async () => {
      await ds.query(
        `UPDATE accounting_settings SET "bankAccountId" = $1 WHERE id = true`,
        [cimbId],
      );
      await setGroups([
        { accountId: maybankId, group: 'BANK_BALANCE' },
        { accountId: cimbId, group: 'OTHER_CURRENT_ASSETS' },
      ]);
      // Emptying N38 re-arms the bank fallback onto N38; CIMB is now on both.
      const res = await setGroups([
        { accountId: cimbId, group: 'OTHER_CURRENT_ASSETS' },
      ]);
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/N38 and N39/);
    });

    it('the SETTINGS path enforces the same rule', async () => {
      await setGroups([{ accountId: atomeId, group: 'OTHER_CURRENT_ASSETS' }]);
      const current = await get('/accounting/settings');
      const res = await put('/accounting/settings', {
        ...current.body,
        bankAccountId: atomeId,
      });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/N38 and N39/);
    });
  });

  describe('concurrency', () => {
    /*
     * The claim the unit suites CANNOT support: two writers that would each
     * pass against pre-change state must not both commit.
     *
     * Fired simultaneously against real Postgres. One write points
     * bankAccountId at Atome (legal while the N38 group is non-empty); the
     * other empties the N38 group (legal while bankAccountId is elsewhere).
     * Together they produce Atome on N38 and N39 at once. Serialized by the
     * settings-row lock, whichever runs second sees the other's committed
     * state and is rejected.
     */
    it('BLOCKS a second writer while the settings row is locked', async () => {
      /*
       * Forces the interleaving rather than hoping for it.
       *
       * A first attempt fired both requests with Promise.all and asserted one
       * failed. That passed with the lock REMOVED — the two requests simply
       * did not overlap inside the critical window, so it proved nothing. The
       * lesson generalizes: a concurrency test that cannot be shown to fail
       * without the mechanism is measuring scheduling luck.
       *
       * Here a raw transaction takes the same pessimistic lock the service
       * takes and HOLDS it. Any writer that honours the lock must block; one
       * that does not will sail through. The lock is then released and the
       * blocked request is allowed to finish.
       */
      await setGroups([
        { accountId: maybankId, group: 'BANK_BALANCE' },
        { accountId: atomeId, group: 'OTHER_CURRENT_ASSETS' },
      ]);

      const runner = ds.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      let settled = false;
      let pending: Promise<request.Response>;
      try {
        await runner.query(
          `SELECT id FROM accounting_settings WHERE id = true FOR UPDATE`,
        );

        // Start a writer while the row is held. It must NOT complete.
        pending = setGroups([{ accountId: cimbId, group: 'BANK_BALANCE' }]).then(
          (r) => {
            settled = true;
            return r;
          },
        );

        // Give it far longer than the ~25ms an unblocked request takes.
        await new Promise((resolve) => setTimeout(resolve, 750));
        expect(settled).toBe(false);
      } finally {
        await runner.rollbackTransaction();
        await runner.release();
      }

      // Released — the writer now proceeds and commits.
      const res = await pending!;
      expect(res.status).toBe(200);
    });

    it('never commits two writes that are each legal alone but conflict together', async () => {
      /*
       * The outcome assertion, independent of whether the two requests
       * actually overlapped: one write points bankAccountId at Atome (legal
       * while the N38 group is non-empty), the other empties the N38 group
       * (legal while bankAccountId is elsewhere). Together they would put
       * Atome on N38 and N39 at once.
       *
       * This does NOT prove serialization on its own — it passes when the
       * requests happen not to interleave. It is the safety-property half;
       * the blocking test above is the mechanism half.
       */
      await setGroups([
        { accountId: maybankId, group: 'BANK_BALANCE' },
        { accountId: atomeId, group: 'OTHER_CURRENT_ASSETS' },
      ]);
      const current = await get('/accounting/settings');

      await Promise.all([
        put('/accounting/settings', { ...current.body, bankAccountId: atomeId }),
        setGroups([{ accountId: atomeId, group: 'OTHER_CURRENT_ASSETS' }]),
      ]);

      // Whatever survived, the committed state must be self-consistent.
      const settings = await ds
        .getRepository(AccountingSettings)
        .findOneByOrFail({ id: true } as any);
      const groups = await ds.query(
        `SELECT "accountId", "groupLine" FROM balance_sheet_account_groups`,
      );
      const bankGroupEmpty = !groups.some((g: any) => g.groupLine === 'BANK_BALANCE');
      const atomeInOther = groups.some(
        (g: any) => g.accountId === atomeId && g.groupLine === 'OTHER_CURRENT_ASSETS',
      );
      const atomeIsBankDefault = settings.bankAccountId === atomeId;
      expect(atomeIsBankDefault && bankGroupEmpty && atomeInOther).toBe(false);
    });
  });


  describe('read consistency', () => {
    it('keeps the real configuration reader on one snapshot across committed writes', async () => {
      await ds.query(
        `UPDATE accounting_settings SET "bankAccountId" = $1 WHERE id = true`,
        [cimbId],
      );
      expect((await setGroups([
        { accountId: maybankId, group: 'BANK_BALANCE' },
        { accountId: atomeId, group: 'OTHER_CURRENT_ASSETS' },
      ])).status).toBe(200);

      // Intercept only the reader's next query runner. All SQL, repositories,
      // isolation selection and transaction handling remain production code.
      // Writers receive their own untouched runners and commit while we pause
      // delivery of the reader's first SELECT result.
      let firstRead!: () => void;
      let resume!: () => void;
      const paused = new Promise<void>((resolve) => { firstRead = resolve; });
      const released = new Promise<void>((resolve) => { resume = resolve; });
      const createRunner = ds.createQueryRunner.bind(ds);
      let observedIsolation: string | undefined;
      const runnerSpy = jest.spyOn(ds, 'createQueryRunner').mockImplementationOnce(() => {
        const runner = createRunner();
        const query = runner.query.bind(runner);
        runner.query = async (...args: Parameters<typeof runner.query>) => {
          const result = await query(...args);
          // An assertion, not a narrowing: `Parameters<typeof runner.query>`
          // widens the first element to `unknown` under this config. It is
          // sound because this wrapper only ever wraps QueryRunner.query,
          // whose first argument is the SQL string (#1262).
          const sql = args[0] as string;
          if (/^SELECT/.test(sql) && sql.includes('"accounting_settings"')) {
            const isolation = await query('SHOW transaction_isolation');
            observedIsolation = isolation[0].transaction_isolation;
            firstRead();
            await released;
          }
          return result;
        };
        return runner;
      });
      const reading = app.get(BalanceSheetGroupService).getConfiguration();
      try {
        // Fail promptly if the read throws or stops using the intercepted path.
        await Promise.race([
          paused,
          reading.then(() => { throw new Error('Reader finished without pausing'); }),
        ]);

        // Both transitions are valid. The final bank fallback is Atome and
        // N39 is CIMB. Mixing the old settings with the new groups would instead
        // put CIMB on both lines, even though no committed state does that.
        const current = await get('/accounting/settings');
        expect((await put('/accounting/settings', {
          ...current.body, bankAccountId: atomeId,
        })).status).toBe(200);
        expect((await setGroups([
          { accountId: cimbId, group: 'OTHER_CURRENT_ASSETS' },
        ])).status).toBe(200);

        resume();
        const snapshot = await reading;
        expect(snapshot.settings.bankAccountId).toBe(cimbId);
        expect({
          isolation: observedIsolation,
          groups: snapshot.groupedAccountIds,
        }).toEqual({
          isolation: 'repeatable read',
          groups: {
            BANK_BALANCE: [maybankId],
            OTHER_CURRENT_ASSETS: [atomeId],
          },
        });

        // A subsequent real read sees the committed configuration, proving
        // the writer changes landed and the first result was a pinned snapshot.
        const latest = await app.get(BalanceSheetGroupService).getConfiguration();
        expect(latest.settings.bankAccountId).toBe(atomeId);
        expect(latest.groupedAccountIds).toEqual({
          BANK_BALANCE: [],
          OTHER_CURRENT_ASSETS: [cimbId],
        });
      } finally {
        resume();
        await reading.catch(() => undefined);
        runnerSpy.mockRestore();
      }
    });

    it('renders the expected contributors in each committed configuration', async () => {
      // Sequential report coverage complements the interleaved service test
      // above; this test alone does not prove snapshot isolation.
      const year = new Date().getUTCFullYear();

      const renderAndAssert = async (label: string) => {
        const report = await get(`/accounting/balance-sheet?year=${year}`);
        expect(report.status).toBe(200);
        const rows = (report.body.data ?? report.body).rows as any[];
        const n38 = rows.find((r) => r.line === 'N38').accounts.map((a: any) => a.accountId);
        const n39 = rows.find((r) => r.line === 'N39').accounts.map((a: any) => a.accountId);
        const overlap = n38.filter((id: string) => n39.includes(id));
        // Named so a failure says WHICH configuration produced the overlap.
        expect({ state: label, overlap }).toEqual({ state: label, overlap: [] });
        return { n38, n39 };
      };

      // State A — the starting point: bank default CIMB, N38 empty (so the
      // fallback is armed), N39 = [Atome].
      await ds.query(
        `UPDATE accounting_settings SET "bankAccountId" = $1 WHERE id = true`,
        [cimbId],
      );
      await setGroups([{ accountId: atomeId, group: 'OTHER_CURRENT_ASSETS' }]);
      const a = await renderAndAssert('A: fallback armed, Atome in N39');
      expect(a.n38).toEqual([cimbId]); // the fallback contributes
      expect(a.n39).toEqual([atomeId]);

      // State B — after write 1: N38 non-empty, so the fallback is displaced.
      expect(
        (
          await setGroups([
            { accountId: maybankId, group: 'BANK_BALANCE' },
            { accountId: atomeId, group: 'OTHER_CURRENT_ASSETS' },
          ])
        ).status,
      ).toBe(200);
      const b = await renderAndAssert('B: N38 grouped, fallback displaced');
      expect(b.n38).toEqual([maybankId]);
      expect(b.n39).toEqual([atomeId]);

      // State C — after write 2: the bank default now points at Atome, which
      // is legal ONLY because N38 is non-empty. This is the state that, paired
      // with state A's groups, would put Atome on both lines.
      const current = await get('/accounting/settings');
      expect(
        (await put('/accounting/settings', { ...current.body, bankAccountId: atomeId }))
          .status,
      ).toBe(200);
      const c = await renderAndAssert('C: bank default = Atome, N38 grouped');
      // Atome belongs to N39 only; the displaced fallback must NOT add it to N38.
      expect(c.n38).toEqual([maybankId]);
      expect(c.n39).toEqual([atomeId]);
    });
  });

  describe('the Balance Sheet reads the groups', () => {
    it('reports every configured Bank Balance account under N38', async () => {
      await setGroups([
        { accountId: cimbId, group: 'BANK_BALANCE' },
        { accountId: maybankId, group: 'BANK_BALANCE' },
      ]);

      const year = new Date().getUTCFullYear();
      const res = await get(`/accounting/balance-sheet?year=${year}`);
      expect(res.status).toBe(200);

      const n38 = (res.body.data ?? res.body).rows.find((r: any) => r.line === 'N38');
      const ids = n38.accounts.map((a: any) => a.accountId).sort();
      expect(ids).toEqual([cimbId, maybankId].sort());
    });

    it('falls back to the single Bank Account when the group is empty', async () => {
      await setGroups([]);
      const year = new Date().getUTCFullYear();
      const res = await get(`/accounting/balance-sheet?year=${year}`);

      const n38 = (res.body.data ?? res.body).rows.find((r: any) => r.line === 'N38');
      expect(n38.accounts.map((a: any) => a.accountId)).toEqual([
        originalBankAccountId,
      ]);
    });
  });
});
