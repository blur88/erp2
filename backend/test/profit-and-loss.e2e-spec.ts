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
  // Posted to Revenue then reversed: must net to zero in the report.
  const SEEDED_REVERSED = '77.0000';

  /** Scale-4 decimal string -> minor units. Every figure here is scale-4. */
  const minor = (s: string) => {
    const neg = s.startsWith('-');
    return (neg ? -1n : 1n) * BigInt(s.replace('-', '').replace('.', ''));
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

    // 2. Operating expense.
    //
    // Deliberately NOT postExpensePayment: that resolves a CASH/BANK channel
    // account from settings and so debits/credits the shared 1100 or 1200.
    // owner-equity.e2e-spec.ts asserts DELTAS on 1100/1200 across its own
    // beforeAll..it window, so a channel posting from this suite lands inside
    // that window and shifts its expected figures — the suites share one DB
    // and are size-ordered, so the interleaving is not stable.
    //
    // This report only needs an Expense-account debit; the funding leg is
    // incidental to every assertion below. Posting an opening balance against
    // 6990 gives the same P&L movement while touching only 6990 and Opening
    // Balance Equity (3200), which no other suite asserts on.
    await ds.transaction((m) =>
      posting.postOpeningBalance({
        accountId: expenseAcc.id,
        sourceRef: `PL-E2E-EXP-${Date.now()}`,
        amount: SEEDED_EXPENSE,
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

    // 4. Reversal of a P&L posting.
    //
    // Reversing an ASSET opening balance would prove nothing here: an Asset
    // account never reaches this report, so the reversal could be broken and
    // every assertion below would still pass. Reverse an INCOME posting, so
    // the original and its reversal both land in the Revenue section and must
    // cancel — that is what makes reversal handling actually tested.
    const salesAcc = await coaRepo.findOneByOrFail({ code: '4100' });
    let reversedEntryId: string | null = null;
    await ds.transaction(async (m) => {
      const res = await posting.postOpeningBalance({
        accountId: salesAcc.id,
        sourceRef: `PL-E2E-REV-${Date.now()}`,
        amount: SEEDED_REVERSED,
        entryDate: `${year}-06-01`,
      }, m);
      reversedEntryId = res.journalEntryId;
    });
    expect(reversedEntryId).toBeTruthy();
    await ds.transaction((m) =>
      posting.reverseEntry({ originalEntryId: reversedEntryId!, entryDate: `${year}-06-02` }, m),
    );

    const after = await readReport(year);

    // Deltas match seeded amounts exactly (derived from constants, not response)
    // Revenue moves by the fulfilment only: the reversed posting and its
    // reversal both land here and cancel. A delta of
    // SEEDED_REVENUE + SEEDED_REVERSED would mean the reversal was ignored.
    expect(sectionTotal(after, 'revenue') - sectionTotal(before, 'revenue')).toBe(minor(SEEDED_REVENUE));
    expect(minor(after.inventoryAdjustments) - minor(before.inventoryAdjustments)).toBe(minor(SEEDED_ADJUSTMENT_NET));
    // totalCostOfSales moved by COGS + adjustment net
    expect(minor(after.totalCostOfSales) - minor(before.totalCostOfSales)).toBe(minor(SEEDED_COGS) + minor(SEEDED_ADJUSTMENT_NET));
    // Operating Expenses moves by the ordinary expense only. The stock
    // adjustment's expense leg is the stockAdjustment component, which §4.2
    // routes to Inventory Adjustments instead.
    const expensesDelta = sectionTotal(after, 'expenses') - sectionTotal(before, 'expenses');
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
