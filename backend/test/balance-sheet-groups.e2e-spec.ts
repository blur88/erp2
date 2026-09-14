import { Test, TestingModule } from '@nestjs/testing';
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
    /*
     * Settings and groups must come from ONE snapshot.
     *
     * Writer locking does NOT cover this. It serializes writers and leaves
     * every committed state self-consistent; the inconsistency here is
     * assembled by the READER, pairing two snapshots that are each individually
     * valid.
     *
     * The interleaving is forced deterministically rather than raced: a
     * REPEATABLE READ transaction is opened and its FIRST read taken, then both
     * writes are committed from outside it, then the second read is taken. If
     * the two reads share a snapshot the writes are invisible to both; if they
     * do not, the reader sees pre-write groups and post-write settings.
     */
    it('never pairs pre-write groups with post-write settings', async () => {
      // Initial state: bank default CIMB, N38 empty, N39 = [Atome].
      await ds.query(
        `UPDATE accounting_settings SET "bankAccountId" = $1 WHERE id = true`,
        [cimbId],
      );
      await setGroups([{ accountId: atomeId, group: 'OTHER_CURRENT_ASSETS' }]);

      const runner = ds.createQueryRunner();
      await runner.connect();
      await runner.startTransaction('REPEATABLE READ');
      try {
        // Read #1 — groups, before either write.
        const groupsBefore = await runner.query(
          `SELECT "accountId", "groupLine" FROM balance_sheet_account_groups`,
        );
        expect(groupsBefore).toHaveLength(1);

        // Both writes commit from OUTSIDE the open snapshot. Each is legal on
        // its own: N38 becomes non-empty, which then frees the bank default to
        // point at an N39 member.
        expect(
          (
            await setGroups([
              { accountId: maybankId, group: 'BANK_BALANCE' },
              { accountId: atomeId, group: 'OTHER_CURRENT_ASSETS' },
            ])
          ).status,
        ).toBe(200);
        const current = await get('/accounting/settings');
        expect(
          (await put('/accounting/settings', { ...current.body, bankAccountId: atomeId }))
            .status,
        ).toBe(200);

        // Read #2 — settings, from the SAME snapshot.
        const settingsAfter = await runner.query(
          `SELECT "bankAccountId" FROM accounting_settings WHERE id = true`,
        );

        /*
         * The snapshot must still show the PRE-write bank default. Seeing
         * `atomeId` here would be the defect: paired with the pre-write groups
         * (N38 empty) read above, the bank fallback re-arms onto Atome while
         * Atome is also in N39, so it lands on both lines and is
         * double-counted into N40/N41.
         */
        expect(settingsAfter[0].bankAccountId).toBe(cimbId);
      } finally {
        await runner.rollbackTransaction();
        await runner.release();
      }
    });

    it('getConfiguration returns a self-consistent pair under interleaved writes', async () => {
      /*
       * The same scenario through the REAL read path, asserting the OUTCOME
       * rather than the snapshot mechanics: whatever pair comes back, no
       * account may resolve to two lines.
       *
       * Runs the report repeatedly while writes flip the configuration
       * underneath it. Without one snapshot this is the window the defect lives
       * in; with it, every response must be internally coherent.
       */
      await ds.query(
        `UPDATE accounting_settings SET "bankAccountId" = $1 WHERE id = true`,
        [cimbId],
      );
      await setGroups([{ accountId: atomeId, group: 'OTHER_CURRENT_ASSETS' }]);

      const year = new Date().getUTCFullYear();
      const flip = async () => {
        await setGroups([
          { accountId: maybankId, group: 'BANK_BALANCE' },
          { accountId: atomeId, group: 'OTHER_CURRENT_ASSETS' },
        ]);
        const c = await get('/accounting/settings');
        await put('/accounting/settings', { ...c.body, bankAccountId: atomeId });
      };
      const reset = async () => {
        const c = await get('/accounting/settings');
        await put('/accounting/settings', { ...c.body, bankAccountId: cimbId });
        await setGroups([{ accountId: atomeId, group: 'OTHER_CURRENT_ASSETS' }]);
      };

      for (let i = 0; i < 6; i++) {
        const [report] = await Promise.all([
          get(`/accounting/balance-sheet?year=${year}`),
          i % 2 === 0 ? flip() : reset(),
        ]);
        expect(report.status).toBe(200);

        const rows = (report.body.data ?? report.body).rows as any[];
        const n38 = rows.find((r) => r.line === 'N38').accounts.map((a: any) => a.accountId);
        const n39 = rows.find((r) => r.line === 'N39').accounts.map((a: any) => a.accountId);

        // No account may contribute to both lines in one rendered report.
        const overlap = n38.filter((id: string) => n39.includes(id));
        expect(overlap).toEqual([]);
      }
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
