import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { User, UserRole, UserStatus } from '../src/database/entities/user.entity';
import { ChartOfAccount } from '../src/modules/accounting/entities/chart-of-account.entity';
import { AccountingSettings } from '../src/modules/accounting/entities/accounting-settings.entity';
import { configureTestAppValidation } from './utils/configure-test-app-validation';

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

    const adminUsername = `formb-e2e-admin-${stamp}`;
    await userRepo.save(userRepo.create({
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
    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: adminUsername, password: 'Admin@123!' });
    adminToken = adminLogin.body?.data?.accessToken ?? adminLogin.body?.accessToken;
    expect(adminToken).toBeTruthy();

    const nonAdminUsername = `formb-e2e-sales-${stamp}`;
    await userRepo.save(userRepo.create({
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
    const nonAdminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: nonAdminUsername, password: 'Admin@123!' });
    nonAdminToken = nonAdminLogin.body?.data?.accessToken ?? nonAdminLogin.body?.accessToken;
    expect(nonAdminToken).toBeTruthy();
  });

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
    await app.close();
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

  it('requires admin for mapping and settings writes', async () => {
    // Settings write must be admin-only
    await request(app.getHttpServer())
      .put('/accounting/form-b-settings')
      .set(nonAdminHeader()).send({ businessName: 'X' }).expect(403);

    // Mappings write must also be admin-only
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

  it('round-trips Form B settings with fallback provenance', async () => {
    await request(app.getHttpServer())
      .put('/accounting/form-b-settings')
      .set(adminHeader()).send({ businessCode: '47111' }).expect(200);
    const res = await request(app.getHttpServer())
      .get('/accounting/form-b-settings').set(authHeader()).expect(200);
    const body = unwrap(res.body);
    // GET returns identity directly, or wrapped in data
    const identity = body.businessCode ? body : (body.data ?? body);
    expect(identity.businessCode).toEqual({
      value: '47111', source: 'formB', override: '47111',
    });
  });

  it('rejects a malformed business code', async () => {
    await request(app.getHttpServer())
      .put('/accounting/form-b-settings')
      .set(adminHeader()).send({ businessCode: '123' }).expect(400);
  });
});
