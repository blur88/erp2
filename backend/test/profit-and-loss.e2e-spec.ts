import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { User, UserRole, UserStatus } from '../src/database/entities/user.entity';
import { ChartOfAccount } from '../src/modules/accounting/entities/chart-of-account.entity';
import { AccountingSettings } from '../src/modules/accounting/entities/accounting-settings.entity';
import { ACCOUNTING_POSTING_PORT, AccountingPostingPort } from '../src/common/accounting-posting/accounting-posting.port';
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

describe('Profit & Loss (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let posting: AccountingPostingPort;
  let token: string;

  const year = new Date().getFullYear();

  // Seed constants — derived expected deltas from these, never from response.
  const SEEDED_REVENUE = '1200.0000';
  const SEEDED_COGS = '630.0000';
  const SEEDED_EXPENSE = '800.0000';
  const SEEDED_INCREASE = '100.0000';
  const SEEDED_DECREASE = '300.0000';
  const SEEDED_ADJUSTMENT_NET = '200.0000'; // 300 - 100 = 200

  const toMinor = (s: string) => BigInt(s.replace('.', '').replace('-', '')) * (s.startsWith('-') ? -1n : 1n);
  // Alternative robust: parse via toMinorUnits logic: remove dot, handle sign
  const minor = (s: string) => {
    const neg = s.startsWith('-');
    const clean = s.replace('-', '').replace('.', '');
    // pad if needed? but s is always 4 decimal places, so clean is without dot.
    // e.g., "1200.0000" -> "12000000"
    return neg ? -BigInt(clean) : BigInt(clean);
  };
  const sectionTotal = (r: any, key: string) => minor(r.sections.find((s: any) => s.key === key)!.total);

  const readReport = async (y: number) => {
    const res = await request(app.getHttpServer())
      .get(`/accounting/profit-and-loss?year=${y}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    // Controller returns raw object, not wrapped in { data }; handle both.
    const body = (res.body as any).data ?? res.body;
    return body as any;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();
    ds = moduleFixture.get(DataSource);
    posting = moduleFixture.get(ACCOUNTING_POSTING_PORT);
    await seedAccounting(ds);

    const username = `pl-e2e-${Date.now()}`;
    const userRepo = ds.getRepository(User);
    await userRepo.save(userRepo.create({
      username,
      email: `${username}@test.com`,
      password: await bcrypt.hash('Admin@123!', 12),
      firstName: 'PL',
      lastName: 'E2E',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      isActive: true,
      failedLoginAttempts: 0,
    }));
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: 'Admin@123!' });
    token = loginRes.body?.data?.accessToken ?? loginRes.body?.accessToken;
    expect(token).toBeTruthy();
  });

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
    await app.close();
  });

  it('tie-out over real postings and stock-adjustment netting (baseline-and-delta)', async () => {
    const before = await readReport(year);

    // Seed fixtures into current year using posting port directly.
    const coaRepo = ds.getRepository(ChartOfAccount);
    const expenseAcc = await coaRepo.findOneByOrFail({ code: '6990' });

    // 1. Sales fulfilment: revenue + COGS
    await ds.transaction((m) =>
      posting.postSalesFulfillment({
        salesOrderId: randomUUID(),
        sourceRef: `PL-E2E-FUL-${Date.now()}`,
        revenueAmount: SEEDED_REVENUE,
        cogsAmount: SEEDED_COGS,
        entryDate: `${year}-03-15`,
      }, m),
    );

    // 2. Expense payment
    await ds.transaction((m) =>
      posting.postExpensePayment({
        expenseId: randomUUID(),
        paymentRowId: randomUUID(),
        expenseAccountId: expenseAcc.id,
        channel: 'CASH' as any,
        amount: SEEDED_EXPENSE,
        sourceRef: `PL-E2E-EXP-${Date.now()}`,
        entryDate: `${year}-04-10`,
      }, m),
    );

    // 3. Stock adjustment with both increase and decrease (balanced journal)
    await ds.transaction((m) =>
      posting.postStockAdjustment({
        adjustmentId: randomUUID(),
        sourceRef: `PL-E2E-ADJ-${Date.now()}`,
        increaseAmount: SEEDED_INCREASE,
        decreaseAmount: SEEDED_DECREASE,
        entryDate: `${year}-05-20`,
      }, m),
    );

    // 4. Reversal: create a dummy opening balance and reverse it (net zero, proves reversal doesn't break tie-out)
    const assetsGroup = await coaRepo.findOneByOrFail({ code: '1000' });
    const dummyCode = `PLD-${Date.now().toString().slice(-6)}`;
    const dummyAcc = await coaRepo.save(coaRepo.create({
      code: dummyCode,
      name: 'PL Dummy',
      type: 'Asset' as any,
      parentId: assetsGroup.id,
      isActive: true, isSystem: false, isPostable: true, openingBalance: '0.0000',
    }));
    let dummyEntryId: string | null = null;
    await ds.transaction(async (m) => {
      const res = await posting.postOpeningBalance({
        accountId: dummyAcc.id,
        sourceRef: `PL-E2E-REV-${Date.now()}`,
        amount: '50.0000',
        entryDate: `${year}-06-01`,
      }, m);
      dummyEntryId = res.journalEntryId;
    });
    if (dummyEntryId) {
      await ds.transaction((m) =>
        posting.reverseEntry({ originalEntryId: dummyEntryId!, entryDate: `${year}-06-02` }, m),
      );
    }

    const after = await readReport(year);

    // Deltas match seeded amounts exactly (derived from constants, not response)
    expect(sectionTotal(after, 'revenue') - sectionTotal(before, 'revenue')).toBe(minor(SEEDED_REVENUE));
    expect(minor(after.inventoryAdjustments) - minor(before.inventoryAdjustments)).toBe(minor(SEEDED_ADJUSTMENT_NET));
    // totalCostOfSales moved by COGS + adjustment net
    expect(minor(after.totalCostOfSales) - minor(before.totalCostOfSales)).toBe(minor(SEEDED_COGS) + minor(SEEDED_ADJUSTMENT_NET));
    // Operating expenses delta excludes inventory adjustments (only the expense payment)
    // The expense account 6990's ordinary movement is the expense payment; adjustments are not in expenses section.
    // So expenses section delta should be SEEDED_EXPENSE
    // But there is also the stock adjustment's expense leg? Wait: stock adjustment increase is credit to expense (reduces), decrease is debit (adds).
    // In our case, net adjustment is 200 added to cost, but does it affect expenses section? No, adjustments are excluded from section totals, they go to totalCostOfSales only.
    // So expenses delta should be just SEEDED_EXPENSE.
    // However our expense payment of 800 is the only ordinary expense movement seeded. Stock adjustment's expense side is stockAdjustment component, not ordinary, so not in expenses section.
    // Let's assert expenses delta is SEEDED_EXPENSE
    // But note: other suites may have seeded other expenses in same year; we use delta so it's safe.
    // The expense section total should have increased by SEEDED_EXPENSE only, not by adjustment net.
    const expensesDelta = sectionTotal(after, 'expenses') - sectionTotal(before, 'expenses');
    // Use minor comparison with tolerance for other concurrent suites? No, we seeded exactly 800, so delta should be at least 800, but could be more if other suites seeded concurrently during our transaction window.
    // However our baseline capture is before seeding, and after capture is immediately after seeding, with no other suite running concurrently in same process (maxWorkers=1, serial). So delta should be exactly 800.
    // But to be safe against shared DB leakage from other suites that seeded earlier (before our before), delta should still be exactly 800 because we are measuring difference.
    expect(expensesDelta).toBe(minor(SEEDED_EXPENSE));

    // Net profit delta: revenue - totalCostOfSales - expenses + otherIncome(0)
    // revenue 1200 - (630+200) -800 = -430
    const expectedNetDelta = minor(SEEDED_REVENUE) - (minor(SEEDED_COGS) + minor(SEEDED_ADJUSTMENT_NET)) - minor(SEEDED_EXPENSE);
    expect(minor(after.netProfit) - minor(before.netProfit)).toBe(expectedNetDelta);

    // Inventories: check stock adjustment specifically
    expect(minor(after.totalCostOfSales) - minor(before.totalCostOfSales)).toBe(minor(SEEDED_COGS) + minor(SEEDED_ADJUSTMENT_NET));
    // The Operating Expenses delta excludes it (already asserted)
    expect(minor(after.inventoryAdjustments) - minor(before.inventoryAdjustments)).toBe(minor(SEEDED_ADJUSTMENT_NET));

    // The invariant holds absolutely, not as a delta.
    expect(after.integrity.tieOutOk).toBe(true);
    expect(after.netProfit).toBe(after.integrity.independentNetProfit);
    expect(after.integrity.anomalies).toEqual([]);
    expect(after.integrity.structuralFaults).toEqual([]);

    // Also check gross profit delta
    const grossDelta = minor(after.grossProfit) - minor(before.grossProfit);
    const expectedGrossDelta = minor(SEEDED_REVENUE) - (minor(SEEDED_COGS) + minor(SEEDED_ADJUSTMENT_NET));
    expect(grossDelta).toBe(expectedGrossDelta);
  });

  it('a year with no activity renders zeros, not an error', async () => {
    const res = await request(app.getHttpServer())
      .get('/accounting/profit-and-loss?year=1990')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const body = (res.body as any).data ?? res.body;
    expect(body.netProfit).toBe('0.0000');
    expect(body.sections).toHaveLength(4);
    expect(body.sections.map((s: any) => s.key)).toEqual(['revenue', 'cogs', 'otherIncome', 'expenses']);
    expect(body.totalCostOfSales).toBe('0.0000');
  });

  it('malformed year is a 400', async () => {
    await request(app.getHttpServer())
      .get('/accounting/profit-and-loss?year=abc')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('unauthenticated is a 401', async () => {
    await request(app.getHttpServer())
      .get(`/accounting/profit-and-loss?year=${year}`)
      .expect(401);
  });
});
