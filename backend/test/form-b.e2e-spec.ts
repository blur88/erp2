import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { jest } from '@jest/globals';
import { AppModule } from '../src/app.module';
import { User, UserRole, UserStatus } from '../src/database/entities/user.entity';
import { ChartOfAccount } from '../src/modules/accounting/entities/chart-of-account.entity';
import { AccountingSettings } from '../src/modules/accounting/entities/accounting-settings.entity';
import { FormBMappingService } from '../src/modules/accounting/services/form-b-mapping.service';
import { configureTestAppValidation } from './utils/configure-test-app-validation';
import { removeSuiteAdmin } from './utils/shared-e2e-fixture';
import { removeSuiteTraces } from './utils/shared-e2e-traces-fixture';

async function seedAccounting(ds: DataSource) {
  const coa = ds.getRepository(ChartOfAccount);
  const groups = [
    ['1000', 'Assets', 'Asset'],
    ['2000', 'Liabilities', 'Liability'],
    ['3000', 'Equity', 'Equity'],
    ['4000', 'Income', 'Income'],
    ['5000', 'Cost of Sales', 'Expense'],
    ['6000', 'Expenses', 'Expense'],
  ] as const;
  for (const [code, name, type] of groups) {
    if (!(await coa.findOneBy({ code }))) {
      await coa.save(coa.create({ code, name, type, isSystem: true, isPostable: false } as any));
    }
  }
  const children = [
    ['1100', 'Cash', 'Asset', '1000'],
    ['1200', 'Bank', 'Asset', '1000'],
    ['1300', 'Inventory', 'Asset', '1000'],
    ['1400', 'Supplier Deposit', 'Asset', '1000'],
    ['2100', 'Customer Deposit', 'Liability', '2000'],
    ['3100', 'Owner Capital', 'Equity', '3000'],
    ['3200', 'Opening Balance Equity', 'Equity', '3000'],
    ['3300', 'Owner Drawings', 'Equity', '3000'],
    ['4100', 'Sales Revenue', 'Income', '4000'],
    ['5100', 'Cost of Goods Sold', 'Expense', '5000'],
    ['6990', 'Other Expenses', 'Expense', '6000'],
  ] as const;
  for (const [code, name, type, parentCode] of children) {
    if (!(await coa.findOneBy({ code }))) {
      const parent = await coa.findOneByOrFail({ code: parentCode });
      await coa.save(coa.create({ code, name, type, parentId: parent.id, isSystem: true, isPostable: true } as any));
    }
  }
  const settingsRepo = ds.getRepository(AccountingSettings);
  if (!(await settingsRepo.findOneBy({ id: true } as any))) {
    const id = async (c: string) => (await coa.findOneByOrFail({ code: c })).id;
    await settingsRepo.save(settingsRepo.create({
      id: true, cashAccountId: await id('1100'), bankAccountId: await id('1200'),
      inventoryAccountId: await id('1300'), supplierDepositAccountId: await id('1400'),
      customerDepositAccountId: await id('2100'), openingBalanceEquityAccountId: await id('3200'),
      ownerCapitalAccountId: await id('3100'), ownerDrawingsAccountId: await id('3300'),
      salesRevenueAccountId: await id('4100'), cogsAccountId: await id('5100'),
      defaultExpenseAccountId: await id('6990'),
    } as any));
  }
  await ds.query(`INSERT INTO "document_number_settings" ("documentName","prefix","paddingDigits","nextNumber","lastResetYear")
    VALUES ('Journal Entries','JE',3,1, EXTRACT(YEAR FROM now())::int % 100)
    ON CONFLICT ("documentName") DO NOTHING`);
}

describe('Form B (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let adminToken: string;
  let nonAdminToken: string;
  // Own-rows tracking (issue #1204).
  let adminUsername = '';
  let nonAdminUsername = '';
  let adminUserId = '';
  let nonAdminUserId = '';
  const ownedCoAIds: string[] = [];
  let companySnapshot: any[] = [];
  let docNumberSnapshot: any[] = [];

  const authHeader = () => ({ Authorization: `Bearer ${adminToken}` });
  const adminHeader = () => ({ Authorization: `Bearer ${adminToken}` });
  const nonAdminHeader = () => ({ Authorization: `Bearer ${nonAdminToken}` });

  // Helper to unwrap potential { data: ... } wrapper for resilience
  const unwrap = (body: any) => (body?.data ?? body);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();
    ds = moduleFixture.get(DataSource);
    await seedAccounting(ds);

    const userRepo = ds.getRepository(User);
    const stamp = Date.now();

    adminUsername = `formb-e2e-admin-${stamp}`;
    const savedAdmin = await userRepo.save(userRepo.create({
      username: adminUsername,
      email: `${adminUsername}@test.com`,
      password: await bcrypt.hash('Admin@123!', 12),
      firstName: 'FormB',
      lastName: 'Admin',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      isActive: true,
      failedLoginAttempts: 0,
    }));
    adminUserId = (savedAdmin as any).id;
    companySnapshot = await ds.query(`SELECT * FROM company_settings`);
    docNumberSnapshot = await ds.query(`SELECT * FROM document_number_settings`);
    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: adminUsername, password: 'Admin@123!' });
    adminToken = adminLogin.body?.data?.accessToken ?? adminLogin.body?.accessToken;
    expect(adminToken).toBeTruthy();

    nonAdminUsername = `formb-e2e-sales-${stamp}`;
    const savedSales = await userRepo.save(userRepo.create({
      username: nonAdminUsername,
      email: `${nonAdminUsername}@test.com`,
      password: await bcrypt.hash('Admin@123!', 12),
      firstName: 'FormB',
      lastName: 'Sales',
      role: UserRole.SALES_STAFF,
      status: UserStatus.ACTIVE,
      isActive: true,
      failedLoginAttempts: 0,
    }));
    nonAdminUserId = (savedSales as any).id;
    const nonAdminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: nonAdminUsername, password: 'Admin@123!' });
    nonAdminToken = nonAdminLogin.body?.data?.accessToken ?? nonAdminLogin.body?.accessToken;
    expect(nonAdminToken).toBeTruthy();
  });

  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        // Bulk CoA fixtures (69xxA/B, 51xxC) have no journals/movements, so a
        // direct scoped delete suffices. Inner block pushes into ownedCoAIds.
        if (ownedCoAIds.length) {
          await ds.query(`DELETE FROM chart_of_account WHERE id = ANY($1)`, [
            [...new Set(ownedCoAIds)],
          ]);
        }
        // Restore company_settings to the snapshotted baseline. Baseline is
        // empty (0 rows); the suite's PUT creates the Acme row, and the
        // placeholder test mutates the seeded registration number — both must
        // be undone so a reuse sees the placeholder again.
        const currentCompany: any[] = await ds.query(
          `SELECT * FROM company_settings`,
        );
        if (!companySnapshot.length) {
          if (currentCompany.length) {
            await ds.query(`DELETE FROM company_settings`);
          }
        } else {
          for (const snap of companySnapshot) {
            await ds.query(
              `UPDATE company_settings SET name=$1, "registrationNumber"=$2, address=$3, city=$4, state=$5, "postalCode"=$6, country=$7, phone=$8, email=$9, website=$10, "miscInfo"=$11, "logoUrl"=$12 WHERE id=$13`,
              [
                snap.name,
                snap.registrationNumber,
                snap.address,
                snap.city,
                snap.state,
                snap.postalCode,
                snap.country,
                snap.phone,
                snap.email,
                snap.website,
                snap.miscInfo,
                snap.logoUrl,
                snap.id,
              ],
            );
          }
          const snapIds = new Set(companySnapshot.map((r: any) => r.id));
          for (const row of currentCompany) {
            if (!snapIds.has(row.id)) {
              await ds.query(`DELETE FROM company_settings WHERE id = $1`, [
                row.id,
              ]);
            }
          }
        }
        // Traces (search_queries keyed by user) + users (cascade tokens).
        const traceUserIds = [adminUserId, nonAdminUserId].filter(Boolean);
        const traceUsernames = [adminUsername, nonAdminUsername].filter(Boolean);
        if (traceUserIds.length || traceUsernames.length) {
          await removeSuiteTraces(ds, {
            userIds: traceUserIds,
            usernames: traceUsernames,
          });
        }
        if (adminUsername) await removeSuiteAdmin(ds, adminUsername);
        if (nonAdminUsername) await removeSuiteAdmin(ds, nonAdminUsername);
        for (const snap of docNumberSnapshot) {
          await ds.query(
            `UPDATE document_number_settings SET prefix=$1, "paddingDigits"=$2, "nextNumber"=$3, "lastResetYear"=$4 WHERE "documentName"=$5`,
            [
              snap.prefix,
              snap.paddingDigits,
              snap.nextNumber,
              snap.lastResetYear,
              snap.documentName,
            ],
          );
        }
      }
    } finally {
      if (ds?.isInitialized) await ds.destroy();
      await app.close();
    }
  });

  it('GET /accounting/profit-and-loss/form-b returns all of N3-N27', async () => {
    const res = await request(app.getHttpServer())
      .get('/accounting/profit-and-loss/form-b?year=2025')
      .set(authHeader()).expect(200);
    const body = unwrap(res.body);
    const rows = body.rows ?? body.data?.rows;
    expect(rows.map((r: any) => r.line)).toEqual(
      Array.from({ length: 25 }, (_, i) => `N${i + 3}`),
    );
    const formVersion = body.formVersion ?? body.data?.formVersion;
    expect(formVersion).toBe(2025);
  });

  it('rejects a malformed year with 400', async () => {
    await request(app.getHttpServer())
      .get('/accounting/profit-and-loss/form-b?year=nope')
      .set(authHeader()).expect(400);
  });

  it('returns N27 as undetermined', async () => {
    const res = await request(app.getHttpServer())
      .get('/accounting/profit-and-loss/form-b?year=2025')
      .set(authHeader()).expect(200);
    const body = unwrap(res.body);
    const rows: any[] = body.rows ?? body.data?.rows;
    const n27 = rows.find((r: any) => r.line === 'N27');
    expect(n27).toBeDefined();
    expect(n27.amount).toBeNull();
    expect(n27.status).toBe('requiresFilerInput');
  });

  it('lists mappings and round-trips one assignment and clear', async () => {
    const listRes = await request(app.getHttpServer())
      .get('/accounting/form-b-mappings').set(adminHeader()).expect(200);
    const listBody = unwrap(listRes.body);
    const list: any[] = Array.isArray(listBody) ? listBody : (listBody.data ?? listBody);
    // Allow-list: find the seeded 6990 account rather than asserting a count.
    const sundry = list.find((r: any) => r.code === '6990');
    expect(sundry).toBeDefined();
    expect(sundry.accountId).toBeTruthy();

    await request(app.getHttpServer())
      .put(`/accounting/form-b-mappings/${sundry.accountId}`)
      .set(adminHeader()).send({ category: 'SALARIES_AND_WAGES' }).expect(200);

    const afterRes = await request(app.getHttpServer())
      .get('/accounting/form-b-mappings').set(adminHeader()).expect(200);
    const afterBody = unwrap(afterRes.body);
    const afterList: any[] = Array.isArray(afterBody) ? afterBody : (afterBody.data ?? afterBody);
    expect(afterList.find((r: any) => r.code === '6990').category)
      .toBe('SALARIES_AND_WAGES');

    await request(app.getHttpServer())
      .put(`/accounting/form-b-mappings/${sundry.accountId}`)
      .set(adminHeader()).send({ category: null }).expect(200);

    // Verify clear
    const clearedRes = await request(app.getHttpServer())
      .get('/accounting/form-b-mappings').set(adminHeader()).expect(200);
    const clearedBody = unwrap(clearedRes.body);
    const clearedList: any[] = Array.isArray(clearedBody) ? clearedBody : (clearedBody.data ?? clearedBody);
    const cleared = clearedList.find((r: any) => r.code === '6990');
    // After clear, 6990 may remain as fallback or disappear if unmapped & ineligible?
    // At minimum category must not be SALARIES_AND_WAGES; if it remains, category is null.
    if (cleared) {
      expect(cleared.category).toBeNull();
    }
  });

  it('rejects mapping a COGS descendant', async () => {
    // 5100 Cost of Goods Sold is seeded under the configured COGS root.
    const listRes = await request(app.getHttpServer())
      .get('/accounting/form-b-mappings').set(adminHeader()).expect(200);
    const listBody = unwrap(listRes.body);
    const list: any[] = Array.isArray(listBody) ? listBody : (listBody.data ?? listBody);
    expect(list.find((r: any) => r.code === '5100')).toBeUndefined();

    // Also verify direct assignment is rejected with 400
    const coaRepo = ds.getRepository(ChartOfAccount);
    const cogs = await coaRepo.findOneBy({ code: '5100' });
    if (cogs) {
      await request(app.getHttpServer())
        .put(`/accounting/form-b-mappings/${cogs.id}`)
        .set(adminHeader()).send({ category: 'SALARIES_AND_WAGES' }).expect(400);
    }
  });

  it('requires admin for mapping writes', async () => {
    const listRes = await request(app.getHttpServer())
      .get('/accounting/form-b-mappings').set(adminHeader()).expect(200);
    const listBody = unwrap(listRes.body);
    const list: any[] = Array.isArray(listBody) ? listBody : (listBody.data ?? listBody);
    const target = list.find((r: any) => r.code === '6990');
    if (target) {
      await request(app.getHttpServer())
        .put(`/accounting/form-b-mappings/${target.accountId}`)
        .set(nonAdminHeader()).send({ category: 'SALARIES_AND_WAGES' }).expect(403);
    } else {
      // Fallback: try with a random UUID to ensure the guard fires before not-found
      await request(app.getHttpServer())
        .put('/accounting/form-b-mappings/00000000-0000-0000-0000-000000000000')
        .set(nonAdminHeader()).send({ category: 'SALARIES_AND_WAGES' }).expect(403);
    }
  });

  /*
   * The placeholder must be PRESENT on the company settings row before anyone
   * edits it. createDefaultSettings() only seeds when the table is empty, so an
   * installation that already had a row gets the value solely from the
   * migration's backfill — drop that and this field silently reads blank in the
   * UI forever, which is exactly the bug this pins.
   *
   * Runs before the write below, which would otherwise mask it.
   */
  it('exposes a seeded placeholder registration number before any edit', async () => {
    const res = await request(app.getHttpServer())
      .get('/settings/company')
      .set(authHeader())
      .expect(200);
    const company = unwrap(res.body);
    expect(company.registrationNumber).toBe('Your Registration Number');
  });

  // Identity comes from Company Settings (/settings/company); Form B has no
  // settings routes of its own.
  it('reads business identity from Company Settings', async () => {
    await request(app.getHttpServer())
      .put('/settings/company')
      .set(adminHeader())
      .send({
        name: 'Acme Sdn Bhd',
        registrationNumber: '201901234567',
        address: '1 Test Road',
        city: 'KL',
        country: 'Malaysia',
      })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/accounting/profit-and-loss/form-b?year=2025')
      .set(authHeader())
      .expect(200);
    const data = unwrap(res.body);
    expect(data.identity.businessName).toEqual({
      value: 'Acme Sdn Bhd', source: 'companySettings',
    });
    expect(data.identity.registrationNumber).toEqual({
      value: '201901234567', source: 'companySettings',
    });
    // N2 / N2a are not modelled at all.
    expect(Object.keys(data.identity).sort()).toEqual([
      'businessName', 'registrationNumber',
    ]);
  });

  it('exposes no Form B settings routes', async () => {
    await request(app.getHttpServer())
      .get('/accounting/form-b-settings').set(authHeader()).expect(404);
  });

  describe('PUT /accounting/form-b-mappings (bulk)', () => {
    let ownedA: string;
    let ownedB: string;
    let cogsChildId: string;

    const mappingOf = async (id: string) => {
      const res = await request(app.getHttpServer())
        .get('/accounting/form-b-mappings')
        .set(adminHeader());
      const rows = unwrap(res.body) as any[];
      return rows.find((r) => r.accountId === id)?.category ?? null;
    };

    beforeAll(async () => {
      const coa = ds.getRepository(ChartOfAccount);
      const parent = await coa.findOneByOrFail({ code: '6000' });
      const stamp = Date.now();

      const a = await coa.save(coa.create({
        code: `69${stamp % 100}A`, name: 'Bulk Owned A', type: 'Expense',
        parentId: parent.id, isSystem: false, isPostable: true,
      } as any));
      const b = await coa.save(coa.create({
        code: `69${stamp % 100}B`, name: 'Bulk Owned B', type: 'Expense',
        parentId: parent.id, isSystem: false, isPostable: true,
      } as any));
      ownedA = (a as any).id;
      ownedB = (b as any).id;
      ownedCoAIds.push(ownedA, ownedB);

      // A descendant of the COGS root is write-INELIGIBLE: it already reaches
      // Form B through N7. This is the invalid item the failure tests use.
      const cogsRoot = await coa.findOneByOrFail({ code: '5100' });
      const child = await coa.save(coa.create({
        code: `51${stamp % 100}C`, name: 'Bulk COGS Child', type: 'Expense',
        parentId: (cogsRoot as any).id, isSystem: false, isPostable: true,
      } as any));
      cogsChildId = (child as any).id;
      ownedCoAIds.push(cogsChildId);
    });

    /*
     * Each test establishes its own baseline rather than inheriting the
     * previous one's writes. Without this, every case after the first assumed
     * ownedA already held SALARIES_AND_WAGES, so running one in isolation
     * (`-t "rolls back an earlier write"`) failed with `Received: null` — and
     * a reordering would have broken them in CI for a reason unrelated to the
     * code under test.
     *
     * Written through the repository, not the bulk route: a baseline that goes
     * through the endpoint under test cannot distinguish "the endpoint works"
     * from "the baseline was already correct".
     */
    beforeEach(async () => {
      const coa = ds.getRepository(ChartOfAccount);
      await coa.update(ownedA, {
        formBExpenseCategory: 'SALARIES_AND_WAGES', formBIncomeCategory: null,
      } as any);
      await coa.update(ownedB, {
        formBExpenseCategory: 'RENT_LEASE', formBIncomeCategory: null,
      } as any);
      await coa.update(cogsChildId, {
        formBExpenseCategory: null, formBIncomeCategory: null,
      } as any);
    });

    it('saves several mappings in one request', async () => {
      /*
       * Seed both rows to null through the REPOSITORY, not the endpoint.
       *
       * The beforeEach baseline is the same pair of values this test asserts,
       * so without moving off it first a completely no-op endpoint would pass.
       * Seeding via the endpoint under test does not fix that — its result
       * would be unasserted, so a no-op would leave the baseline in place and
       * still satisfy every assertion below.
       */
      const coa = ds.getRepository(ChartOfAccount);
      await coa.update(ownedA, {
        formBExpenseCategory: null, formBIncomeCategory: null,
      } as any);
      await coa.update(ownedB, {
        formBExpenseCategory: null, formBIncomeCategory: null,
      } as any);
      expect(await mappingOf(ownedA)).toBeNull();
      expect(await mappingOf(ownedB)).toBeNull();

      const res = await request(app.getHttpServer())
        .put('/accounting/form-b-mappings')
        .set(adminHeader())
        .send({ mappings: [
          { accountId: ownedA, category: 'SALARIES_AND_WAGES' },
          { accountId: ownedB, category: 'RENT_LEASE' },
        ] });

      expect(res.status).toBe(200);
      // The response is the refreshed list, not an echo of the request.
      const rows = unwrap(res.body) as any[];
      expect(rows.find((r) => r.accountId === ownedA)?.category).toBe('SALARIES_AND_WAGES');
      expect(await mappingOf(ownedB)).toBe('RENT_LEASE');
    });

    it('validates every item before writing any', async () => {
      // ownedA holds SALARIES_AND_WAGES from this block's beforeEach.
      const res = await request(app.getHttpServer())
        .put('/accounting/form-b-mappings')
        .set(adminHeader())
        .send({ mappings: [
          { accountId: ownedA, category: 'COMMISSION' },     // valid
          { accountId: cogsChildId, category: 'RENT_LEASE' }, // ineligible
        ] });

      expect(res.status).toBe(400);
      // Prevalidation: the write phase never opened, so the valid item is
      // untouched. This proves nothing about rollback — see the next test.
      expect(await mappingOf(ownedA)).toBe('SALARIES_AND_WAGES');
    });

    it('rolls back an earlier write when a later write throws', async () => {
      const service = app.get(FormBMappingService);
      const dataSource = app.get(DataSource);
      const realTransaction = dataSource.transaction.bind(dataSource);

      /*
       * Both spies are restored in `finally`. The deliberate-mutation check in
       * Step 2 makes this test FAIL, and a failure that exits before
       * mockRestore() would leave dataSource.transaction patched for every
       * later test in the suite.
       */
      let repoSpy: jest.SpyInstance | undefined;
      const spy = jest
        .spyOn(dataSource, 'transaction')
        .mockImplementation(((cb: any) =>
          realTransaction(async (manager: any) => {
            const repo = manager.getRepository(ChartOfAccount);
            let calls = 0;
            const realUpdate = repo.update.bind(repo);
            // Fail the SECOND actual update, inside the transaction — a
            // validation rejection never reaches this phase and could not
            // test rollback.
            repoSpy = jest.spyOn(repo, 'update').mockImplementation(async (...args: any[]) => {
              calls += 1;
              if (calls === 2) throw new Error('injected write failure');
              return realUpdate(...args);
            });
            return cb(manager);
          })) as any);

      try {
        await expect(service.setCategories([
          { accountId: ownedA, category: 'REPAIRS_MAINTENANCE' },
          { accountId: ownedB, category: 'COMMISSION' },
        ])).rejects.toThrow('injected write failure');

        // The first update succeeded inside the transaction and must have been
        // rolled back. A write issued through the injected coaRepo instead of
        // manager.getRepository would survive here and fail this assertion.
        expect(await mappingOf(ownedA)).toBe('SALARIES_AND_WAGES');
      } finally {
        repoSpy?.mockRestore();
        spy.mockRestore();
      }
    });

    it('rejects duplicate accountIds', async () => {
      const res = await request(app.getHttpServer())
        .put('/accounting/form-b-mappings')
        .set(adminHeader())
        .send({ mappings: [
          { accountId: ownedA, category: 'RENT_LEASE' },
          { accountId: ownedA, category: null },
        ] });

      expect(res.status).toBe(400);
      expect(await mappingOf(ownedA)).toBe('SALARIES_AND_WAGES');
    });

    it('rejects an empty array', async () => {
      const res = await request(app.getHttpServer())
        .put('/accounting/form-b-mappings')
        .set(adminHeader())
        .send({ mappings: [] });

      expect(res.status).toBe(400);
    });

    it('is forbidden for a non-admin', async () => {
      const res = await request(app.getHttpServer())
        .put('/accounting/form-b-mappings')
        .set(nonAdminHeader())
        .send({ mappings: [{ accountId: ownedA, category: 'RENT_LEASE' }] });

      expect(res.status).toBe(403);
      expect(await mappingOf(ownedA)).toBe('SALARIES_AND_WAGES');
    });
  });
});
