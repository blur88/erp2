import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { ExpenseService } from '../src/modules/accounting/services/expense.service';
import { ExpensePaymentService } from '../src/modules/accounting/services/expense-payment.service';
import { ChartOfAccount } from '../src/modules/accounting/entities/chart-of-account.entity';
import { AccountingSettings } from '../src/modules/accounting/entities/accounting-settings.entity';
import { PaymentMethodEntity } from '../src/database/entities/payment-method.entity';
import { Expense, ExpenseDocumentStatus, ExpensePaymentStatus } from '../src/modules/accounting/entities/expense.entity';
import { ACCOUNTING_POSTING_PORT, AccountingPostingPort } from '../src/common/accounting-posting/accounting-posting.port';
import { TrialBalanceService } from '../src/modules/accounting/services/trial-balance.service';
import { GeneralLedgerService } from '../src/modules/accounting/services/general-ledger.service';
import { AccountingSourceType } from '../src/modules/accounting/entities/source-type.enum';
import { PostingType } from '../src/modules/accounting/entities/posting-type.enum';
import { AccountType } from '../src/modules/accounting/entities/account-type.enum';
import { CreateExpenseDto, PayExpenseDto, RefundExpenseDto, UpdateExpenseDto } from '../src/modules/accounting/dto/create-expense.dto';
import { SettingsService } from '../src/modules/settings/settings.service';
import { configureTestAppValidation } from './utils/configure-test-app-validation';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { User, UserRole, UserStatus } from '../src/database/entities/user.entity';

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
    VALUES ('Expenses','EXP',3,1, EXTRACT(YEAR FROM now())::int % 100)
    ON CONFLICT ("documentName") DO NOTHING`);
  await ds.query(`INSERT INTO "document_number_settings" ("documentName","prefix","paddingDigits","nextNumber","lastResetYear")
    VALUES ('Journal Entries','JE',3,1, EXTRACT(YEAR FROM now())::int % 100)
    ON CONFLICT ("documentName") DO NOTHING`);
}

async function seedPaymentMethods(ds: DataSource): Promise<{ cash: PaymentMethodEntity; bank: PaymentMethodEntity }> {
  const pmRepo = ds.getRepository(PaymentMethodEntity);
  let cash = await pmRepo.findOne({ where: { code: 'CASH' } });
  if (!cash) {
    cash = await pmRepo.save(pmRepo.create({ code: 'CASH', name: 'Cash', useForPurchases: true, accountingChannel: 'CASH', sortOrder: 1 }));
  }
  let bank = await pmRepo.findOne({ where: { code: 'BANK' } });
  if (!bank) {
    bank = await pmRepo.save(pmRepo.create({ code: 'BANK', name: 'Bank Transfer', useForPurchases: true, accountingChannel: 'BANK', sortOrder: 2 }));
  }
  return { cash, bank };
}

function partition(results: PromiseSettledResult<unknown>[]) {
  const fulfilled = results.filter(
    (r): r is PromiseFulfilledResult<unknown> => r.status === 'fulfilled',
  );
  const rejected = results.filter(
    (r): r is PromiseRejectedResult => r.status === 'rejected',
  );
  return { fulfilled, rejected };
}

function toMinorUnits(v: string): bigint {
  const [i, f = ''] = v.split('.');
  return BigInt(i) * 10000n + BigInt(f.padEnd(4, '0'));
}

function formatDate(d: string | Date): string {
  if (d instanceof Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return d;
}

describe('Expense e2e lifecycle, posting & concurrency', () => {
  let app: INestApplication;
  let ds: DataSource;
  let expenseService: ExpenseService;
  let expensePaymentService: ExpensePaymentService;
  let ledger: GeneralLedgerService;
  let trial: TrialBalanceService;
  let posting: AccountingPostingPort;

  let expenseAccount: ChartOfAccount;
  let cashMethod: PaymentMethodEntity;
  let bankMethod: PaymentMethodEntity;

  // Logged in ONCE below: /auth/login is throttled to 5 req/min
  // (auth.controller.ts:41), so a per-test login would 403 under CI timing.
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();
    ds = moduleFixture.get(DataSource);
    expenseService = moduleFixture.get(ExpenseService);
    expensePaymentService = moduleFixture.get(ExpensePaymentService);
    ledger = moduleFixture.get(GeneralLedgerService);
    trial = moduleFixture.get(TrialBalanceService);
    posting = moduleFixture.get(ACCOUNTING_POSTING_PORT);
    await seedAccounting(ds);
    const methods = await seedPaymentMethods(ds);
    cashMethod = methods.cash;
    bankMethod = methods.bank;
    expenseAccount = await ds.getRepository(ChartOfAccount).findOneByOrFail({ code: '6990' });

    const username = `exp-filter-admin-${Date.now()}`;
    const userRepo = ds.getRepository(User);
    await userRepo.save(
      userRepo.create({
        username,
        email: `${username}@test.com`,
        password: await bcrypt.hash('Admin@123!', 12),
        firstName: 'Exp',
        lastName: 'Filter',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        isActive: true,
        failedLoginAttempts: 0,
      }),
    );

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

  const clearJournal = async () => {
    await ds.query(`DELETE FROM journal_entry_line`);
    await ds.query(`DELETE FROM journal_entry`);
    await ds.query(`DELETE FROM expense_payments`);
    await ds.query(`DELETE FROM expenses`);
  };
  beforeEach(clearJournal);
  afterEach(clearJournal);

  async function createExpense(overrides: Partial<CreateExpenseDto> = {}): Promise<Expense> {
    return expenseService.create({
      expenseDate: '2026-07-15',
      payee: 'Test Vendor',
      description: 'Test Expense',
      expenseAccountId: expenseAccount.id,
      totalAmount: '1000.0000',
      ...overrides,
    }, 'e2e', 'e2e');
  }

  async function payExpense(expenseId: string, payments: PayExpenseDto['payments']): Promise<Expense> {
    return expensePaymentService.pay(expenseId, { payments }, 'e2e', 'e2e');
  }

  async function refundExpense(expenseId: string, refunds: RefundExpenseDto['refunds']): Promise<Expense> {
    return expensePaymentService.refund(expenseId, { refunds }, 'e2e', 'e2e');
  }

  async function updateExpense(id: string, dto: UpdateExpenseDto): Promise<Expense> {
    return expenseService.update(id, dto, 'e2e', 'e2e');
  }

  async function cancelExpense(id: string): Promise<Expense> {
    return expenseService.cancel(id, 'e2e', 'e2e');
  }

  async function uncancelExpense(id: string): Promise<Expense> {
    return expenseService.uncancel(id, 'e2e', 'e2e');
  }

  async function expenseJeCount(expenseId: string): Promise<number> {
    const rows = await ds.query(
      `SELECT COUNT(*)::int AS n FROM journal_entry WHERE "sourceType" = $1 AND "sourceDocumentId" = $2`,
      [AccountingSourceType.EXPENSE, expenseId],
    );
    return rows[0].n;
  }

  async function getExpense(id: string): Promise<Expense> {
    return expenseService.findOne(id);
  }

  async function assertExpenseStatus(id: string, expectedDocStatus: ExpenseDocumentStatus, expectedPayStatus: ExpensePaymentStatus, expectedPaid: string, expectedBalance: string) {
    const exp = await getExpense(id);
    expect(exp.documentStatus).toBe(expectedDocStatus);
    expect(exp.paymentStatus).toBe(expectedPayStatus);
    expect(exp.paidAmount).toBe(expectedPaid);
    expect(exp.balance).toBe(expectedBalance);
  }

  async function assertJECount(sourceEventId: string, postingType: PostingType, expected: number) {
    const count = await ds.query(
      `SELECT COUNT(*)::int AS n FROM journal_entry
       WHERE "sourceType" = $1 AND "sourceEventId" = $2 AND "postingType" = $3 AND "reversalOfEntryId" IS NULL`,
      [AccountingSourceType.EXPENSE, sourceEventId, postingType],
    );
    expect(count[0].n).toBe(expected);
  }

  async function assertJEBalanced(sourceEventId: string, postingType: PostingType) {
    const lines = await ds.query(
      `SELECT l.debit, l.credit FROM journal_entry_line l
       JOIN journal_entry e ON e.id = l."entryId"
       WHERE e."sourceType" = $1 AND e."sourceEventId" = $2 AND e."postingType" = $3 AND e."reversalOfEntryId" IS NULL
       AND l."deletedAt" IS NULL AND e."deletedAt" IS NULL`,
      [AccountingSourceType.EXPENSE, sourceEventId, postingType],
    );
    const totalDebit = lines.reduce((sum: bigint, l: any) => sum + toMinorUnits(l.debit), 0n);
    const totalCredit = lines.reduce((sum: bigint, l: any) => sum + toMinorUnits(l.credit), 0n);
    expect(totalDebit).toBe(totalCredit);
  }

  async function assertJEAccounts(sourceEventId: string, postingType: PostingType, expectedDebitCode: string, expectedCreditCode: string) {
    const lines = await ds.query(
      `SELECT a.code, l.debit, l.credit FROM journal_entry_line l
       JOIN journal_entry e ON e.id = l."entryId"
       JOIN chart_of_account a ON a.id = l."accountId"
       WHERE e."sourceType" = $1 AND e."sourceEventId" = $2 AND e."postingType" = $3 AND e."reversalOfEntryId" IS NULL
       AND l."deletedAt" IS NULL AND e."deletedAt" IS NULL
       ORDER BY l.id`,
      [AccountingSourceType.EXPENSE, sourceEventId, postingType],
    );
    expect(lines.length).toBe(2);
    const debitLine = lines.find((l: any) => toMinorUnits(l.debit) > 0n);
    const creditLine = lines.find((l: any) => toMinorUnits(l.credit) > 0n);
    expect(debitLine?.code).toBe(expectedDebitCode);
    expect(creditLine?.code).toBe(expectedCreditCode);
  }

  async function assertJEDate(sourceEventId: string, postingType: PostingType, expectedDate: string) {
    const jeDate = await ds.query(`SELECT "entryDate" FROM journal_entry WHERE "sourceType" = $1 AND "sourceEventId" = $2 AND "postingType" = $3 AND "reversalOfEntryId" IS NULL`, [AccountingSourceType.EXPENSE, sourceEventId, postingType]);
    const actual = jeDate[0]?.entryDate;
    const actualStr = actual instanceof Date ? actual.toLocaleDateString('en-CA') : String(actual);
    expect(actualStr).toBe(expectedDate);
  }

  describe('Full lifecycle: create → pay partial → pay to full → refund partial → refund to zero → cancel', () => {
    it('complete lifecycle with correct statuses and JE at each step', async () => {
      // 1. Create
      let expense = await createExpense({ totalAmount: '1000.0000' });
      expect(expense.documentStatus).toBe(ExpenseDocumentStatus.DRAFT);
      expect(expense.paymentStatus).toBe(ExpensePaymentStatus.UNPAID);
      expect(expense.paidAmount).toBe('0.0000');
      expect(expense.balance).toBe('1000.0000');
      expect(expense.expenseNumber).toMatch(/^EXP-/);

      let jeCount = await ds.query(`SELECT COUNT(*)::int AS n FROM journal_entry WHERE "sourceType" = $1`, [AccountingSourceType.EXPENSE]);
      expect(jeCount[0].n).toBe(0);

      let tb = await trial.getTrialBalance({ asOfDate: '2026-07-31' });
      expect(tb.balanced).toBe(true);

      // 2. Pay partial (300)
      expense = await payExpense(expense.id, [{
        paymentMethodId: cashMethod.id,
        amount: '300.0000',
        paymentDate: '2026-07-16',
        reference: 'CASH-001',
      }]);
      await assertExpenseStatus(expense.id, ExpenseDocumentStatus.DRAFT, ExpensePaymentStatus.PARTIAL, '300.0000', '700.0000');

      let paymentRows = await ds.query(`SELECT id FROM expense_payments WHERE "expenseId" = $1 AND "sourcePaymentId" IS NULL`, [expense.id]);
      expect(paymentRows.length).toBe(1);
      let paymentRowId = paymentRows[0].id;

      await assertJECount(paymentRowId, PostingType.EXPENSE_PAYMENT, 1);
      await assertJEBalanced(paymentRowId, PostingType.EXPENSE_PAYMENT);
      await assertJEAccounts(paymentRowId, PostingType.EXPENSE_PAYMENT, '6990', '1100');
      await assertJEDate(paymentRowId, PostingType.EXPENSE_PAYMENT, '2026-07-16');

      let expenseGL = await ledger.getLedger({ accountId: expenseAccount.id, fromDate: '2026-07-01', toDate: '2026-07-31' });
      expect(toMinorUnits(expenseGL.closingBalance)).toBe(3000000n);

      let cashGL = await ledger.getLedger({ accountId: (await ds.getRepository(ChartOfAccount).findOneByOrFail({ code: '1100' })).id, fromDate: '2026-07-01', toDate: '2026-07-31' });
      expect(toMinorUnits(cashGL.closingBalance)).toBe(-3000000n);

      tb = await trial.getTrialBalance({ asOfDate: '2026-07-31' });
      expect(tb.balanced).toBe(true);

      // 3. Pay to full (700)
      expense = await payExpense(expense.id, [{
        paymentMethodId: bankMethod.id,
        amount: '700.0000',
        paymentDate: '2026-07-17',
        reference: 'BANK-001',
      }]);
      await assertExpenseStatus(expense.id, ExpenseDocumentStatus.COMPLETED, ExpensePaymentStatus.PAID, '1000.0000', '0.0000');

      paymentRows = await ds.query(`SELECT id FROM expense_payments WHERE "expenseId" = $1 AND "sourcePaymentId" IS NULL ORDER BY "paymentDate"`, [expense.id]);
      expect(paymentRows.length).toBe(2);
      paymentRowId = paymentRows[1].id;

      await assertJECount(paymentRowId, PostingType.EXPENSE_PAYMENT, 1);
      await assertJEBalanced(paymentRowId, PostingType.EXPENSE_PAYMENT);
      await assertJEAccounts(paymentRowId, PostingType.EXPENSE_PAYMENT, '6990', '1200');
      await assertJEDate(paymentRowId, PostingType.EXPENSE_PAYMENT, '2026-07-17');

      expenseGL = await ledger.getLedger({ accountId: expenseAccount.id, fromDate: '2026-07-01', toDate: '2026-07-31' });
      expect(toMinorUnits(expenseGL.closingBalance)).toBe(10000000n);

      let bankGL = await ledger.getLedger({ accountId: (await ds.getRepository(ChartOfAccount).findOneByOrFail({ code: '1200' })).id, fromDate: '2026-07-01', toDate: '2026-07-31' });
      expect(toMinorUnits(bankGL.closingBalance)).toBe(-7000000n);

      tb = await trial.getTrialBalance({ asOfDate: '2026-07-31' });
      expect(tb.balanced).toBe(true);

      // 4. Refund partial (200 from first payment)
      paymentRows = await ds.query(`SELECT id, amount FROM expense_payments WHERE "expenseId" = $1 AND "sourcePaymentId" IS NULL ORDER BY "paymentDate"`, [expense.id]);
      const firstPaymentId = paymentRows[0].id;

      expense = await refundExpense(expense.id, [{
        sourcePaymentId: firstPaymentId,
        amount: '200.0000',
        refundDate: '2026-07-18',
        reference: 'REF-001',
      }]);
      await assertExpenseStatus(expense.id, ExpenseDocumentStatus.DRAFT, ExpensePaymentStatus.PARTIAL, '800.0000', '200.0000');

      let refundRows = await ds.query(`SELECT id FROM expense_payments WHERE "expenseId" = $1 AND "sourcePaymentId" = $2`, [expense.id, firstPaymentId]);
      expect(refundRows.length).toBe(1);
      let refundRowId = refundRows[0].id;

      await assertJECount(refundRowId, PostingType.EXPENSE_REFUND, 1);
      await assertJEBalanced(refundRowId, PostingType.EXPENSE_REFUND);
      await assertJEAccounts(refundRowId, PostingType.EXPENSE_REFUND, '1100', '6990');
      await assertJEDate(refundRowId, PostingType.EXPENSE_REFUND, '2026-07-18');

      expenseGL = await ledger.getLedger({ accountId: expenseAccount.id, fromDate: '2026-07-01', toDate: '2026-07-31' });
      expect(toMinorUnits(expenseGL.closingBalance)).toBe(8000000n);

      cashGL = await ledger.getLedger({ accountId: (await ds.getRepository(ChartOfAccount).findOneByOrFail({ code: '1100' })).id, fromDate: '2026-07-01', toDate: '2026-07-31' });
      expect(toMinorUnits(cashGL.closingBalance)).toBe(-1000000n);

      tb = await trial.getTrialBalance({ asOfDate: '2026-07-31' });
      expect(tb.balanced).toBe(true);

       // 5. Refund to zero (100 remaining from first + 700 from second = 800 total)
       paymentRows = await ds.query(`SELECT id FROM expense_payments WHERE "expenseId" = $1 AND "sourcePaymentId" IS NULL ORDER BY "paymentDate"`, [expense.id]);
       const p1Id = paymentRows[0].id;
       const p2Id = paymentRows[1].id;

       expense = await refundExpense(expense.id, [
         { sourcePaymentId: p1Id, amount: '100.0000', refundDate: '2026-07-19', reference: 'REF-002a' },
         { sourcePaymentId: p2Id, amount: '700.0000', refundDate: '2026-07-19', reference: 'REF-002b' },
       ]);
       await assertExpenseStatus(expense.id, ExpenseDocumentStatus.DRAFT, ExpensePaymentStatus.UNPAID, '0.0000', '1000.0000');

       refundRows = await ds.query(`SELECT id, "sourcePaymentId" FROM expense_payments WHERE "expenseId" = $1 AND "sourcePaymentId" = $2 ORDER BY "paymentDate"`, [expense.id, p1Id]);
       expect(refundRows.length).toBe(2);
       refundRowId = refundRows[0].id;
       await assertJECount(refundRowId, PostingType.EXPENSE_REFUND, 1);
       await assertJEBalanced(refundRowId, PostingType.EXPENSE_REFUND);
       await assertJEAccounts(refundRowId, PostingType.EXPENSE_REFUND, '1100', '6990');
       await assertJEDate(refundRowId, PostingType.EXPENSE_REFUND, '2026-07-18');

       refundRowId = refundRows[1].id;
       await assertJECount(refundRowId, PostingType.EXPENSE_REFUND, 1);
       await assertJEBalanced(refundRowId, PostingType.EXPENSE_REFUND);
       await assertJEAccounts(refundRowId, PostingType.EXPENSE_REFUND, '1100', '6990');
       await assertJEDate(refundRowId, PostingType.EXPENSE_REFUND, '2026-07-19');

       refundRows = await ds.query(`SELECT id FROM expense_payments WHERE "expenseId" = $1 AND "sourcePaymentId" = $2`, [expense.id, p2Id]);
       expect(refundRows.length).toBe(1);
       refundRowId = refundRows[0].id;
       await assertJECount(refundRowId, PostingType.EXPENSE_REFUND, 1);
       await assertJEBalanced(refundRowId, PostingType.EXPENSE_REFUND);
       await assertJEAccounts(refundRowId, PostingType.EXPENSE_REFUND, '1200', '6990');
       await assertJEDate(refundRowId, PostingType.EXPENSE_REFUND, '2026-07-19');

       expenseGL = await ledger.getLedger({ accountId: expenseAccount.id, fromDate: '2026-07-01', toDate: '2026-07-31' });
       expect(toMinorUnits(expenseGL.closingBalance)).toBe(0n);

       cashGL = await ledger.getLedger({ accountId: (await ds.getRepository(ChartOfAccount).findOneByOrFail({ code: '1100' })).id, fromDate: '2026-07-01', toDate: '2026-07-31' });
       expect(toMinorUnits(cashGL.closingBalance)).toBe(0n);

       bankGL = await ledger.getLedger({ accountId: (await ds.getRepository(ChartOfAccount).findOneByOrFail({ code: '1200' })).id, fromDate: '2026-07-01', toDate: '2026-07-31' });
       expect(toMinorUnits(bankGL.closingBalance)).toBe(0n);

      tb = await trial.getTrialBalance({ asOfDate: '2026-07-31' });
      expect(tb.balanced).toBe(true);

      // 6. Cancel
      expense = await cancelExpense(expense.id);
      expect(expense.documentStatus).toBe(ExpenseDocumentStatus.CANCELLED);
      expect(expense.paymentStatus).toBe(ExpensePaymentStatus.UNPAID);

       jeCount = await ds.query(`SELECT COUNT(*)::int AS n FROM journal_entry WHERE "sourceType" = $1 AND "sourceDocumentId" = $2`, [AccountingSourceType.EXPENSE, expense.id]);
       expect(jeCount[0].n).toBe(5);

      tb = await trial.getTrialBalance({ asOfDate: '2026-07-31' });
      expect(tb.balanced).toBe(true);

      // 7. Uncancel — restores DRAFT + UNPAID without touching settlement facts.
      const beforeUncancel = await getExpense(expense.id);
      const paymentRowsBefore = await ds.query(
        `SELECT id, amount, "paymentDate", "sourcePaymentId" FROM expense_payments
         WHERE "expenseId" = $1 ORDER BY id`,
        [expense.id],
      );
      const jeBefore = await expenseJeCount(expense.id);

      expense = await uncancelExpense(expense.id);

      // Asserted BEFORE any new payment: a later payment would legitimately move
      // these values and mask a regression.
      expect(expense.documentStatus).toBe(ExpenseDocumentStatus.DRAFT);
      expect(expense.paymentStatus).toBe(ExpensePaymentStatus.UNPAID);
      expect(expense.paidAmount).toBe(beforeUncancel.paidAmount);
      expect(expense.balance).toBe(beforeUncancel.balance);

      const paymentRowsAfter = await ds.query(
        `SELECT id, amount, "paymentDate", "sourcePaymentId" FROM expense_payments
         WHERE "expenseId" = $1 ORDER BY id`,
        [expense.id],
      );
      expect(paymentRowsAfter).toEqual(paymentRowsBefore);

      // Uncancel posts nothing. Compared before/after rather than asserting zero,
      // because this expense already has pay/refund JEs.
      expect(await expenseJeCount(expense.id)).toBe(jeBefore);

      // 8. The restored DRAFT genuinely accepts payment again.
      expense = await payExpense(expense.id, [{
        paymentMethodId: cashMethod.id,
        amount: '1000.0000',
        paymentDate: '2026-07-22',
        reference: 'PAY-AFTER-UNCANCEL',
      }]);
      expect(expense.paymentStatus).toBe(ExpensePaymentStatus.PAID);
      expect(expense.documentStatus).toBe(ExpenseDocumentStatus.COMPLETED);
    });

    it('round-trips COMPLETED through pay → refund → re-pay', async () => {
      const expense = await createExpense({ totalAmount: '500' });

      await payExpense(expense.id, [
        { paymentMethodId: cashMethod.id, amount: '500', paymentDate: '2026-08-06' },
      ]);
      await assertExpenseStatus(expense.id, ExpenseDocumentStatus.COMPLETED, ExpensePaymentStatus.PAID, '500.0000', '0.0000');

      const rows = await ds.query(
        `SELECT id FROM expense_payments WHERE "expenseId" = $1 AND "sourcePaymentId" IS NULL`,
        [expense.id],
      );
      await refundExpense(expense.id, [
        { sourcePaymentId: rows[0].id, amount: '200', refundDate: '2026-08-06' },
      ]);
      await assertExpenseStatus(expense.id, ExpenseDocumentStatus.DRAFT, ExpensePaymentStatus.PARTIAL, '300.0000', '200.0000');

      await payExpense(expense.id, [
        { paymentMethodId: cashMethod.id, amount: '200', paymentDate: '2026-08-06' },
      ]);
      await assertExpenseStatus(expense.id, ExpenseDocumentStatus.COMPLETED, ExpensePaymentStatus.PAID, '500.0000', '0.0000');
    });

    it('rejects a further payment once settled', async () => {
      const expense = await createExpense({ totalAmount: '500' });
      await payExpense(expense.id, [
        { paymentMethodId: cashMethod.id, amount: '500', paymentDate: '2026-08-06' },
      ]);

      await expect(
        payExpense(expense.id, [
          { paymentMethodId: cashMethod.id, amount: '10', paymentDate: '2026-08-06' },
        ]),
      ).rejects.toThrow('Settled expenses cannot receive further payments');
    });
  });

  describe('Action-matrix rejections', () => {
    it('edit paid expense: rejects', async () => {
      const expense = await createExpense({ totalAmount: '1000.0000' });
      await payExpense(expense.id, [{
        paymentMethodId: cashMethod.id,
        amount: '1000.0000',
        paymentDate: '2026-07-16',
        reference: 'PAY-001',
      }]);
      await expect(updateExpense(expense.id, { description: 'Updated' })).rejects.toThrow('Settled expenses cannot be edited');
    });

    it('cancel partial expense: rejects', async () => {
      const expense = await createExpense({ totalAmount: '1000.0000' });
      await payExpense(expense.id, [{
        paymentMethodId: cashMethod.id,
        amount: '300.0000',
        paymentDate: '2026-07-16',
      }]);
      await expect(cancelExpense(expense.id)).rejects.toThrow('Refund all payments before cancelling this expense');
    });

    it('cancel paid expense: rejects', async () => {
      const expense = await createExpense({ totalAmount: '1000.0000' });
      await payExpense(expense.id, [{
        paymentMethodId: cashMethod.id,
        amount: '1000.0000',
        paymentDate: '2026-07-16',
        reference: 'PAY-001',
      }]);
      await expect(cancelExpense(expense.id)).rejects.toThrow('Only draft expenses can be cancelled');
    });

    it('uncancel a draft expense: rejects', async () => {
      const exp = await createExpense({ totalAmount: '500.0000' });
      await expect(uncancelExpense(exp.id)).rejects.toThrow('Only cancelled expenses can be uncancelled');
    });

    it('pay cancelled expense: rejects', async () => {
      const expense = await createExpense({ totalAmount: '500.0000' });
      await cancelExpense(expense.id);
      await expect(payExpense(expense.id, [{
        paymentMethodId: cashMethod.id,
        amount: '100.0000',
        paymentDate: '2026-07-17',
      }])).rejects.toThrow('Cancelled expenses cannot receive payments');
    });

    it('account change after any payment: rejects', async () => {
      const expense = await createExpense({ totalAmount: '1000.0000' });
      await payExpense(expense.id, [{
        paymentMethodId: cashMethod.id,
        amount: '300.0000',
        paymentDate: '2026-07-16',
      }]);
      const otherExpenseAccount = await ds.getRepository(ChartOfAccount).save(
        ds.getRepository(ChartOfAccount).create({ code: '6991', name: 'Other Expense', type: AccountType.EXPENSE, parentId: (await ds.getRepository(ChartOfAccount).findOneByOrFail({ code: '6000' })).id, isSystem: true, isPostable: true })
      );
      await expect(updateExpense(expense.id, { expenseAccountId: otherExpenseAccount.id })).rejects.toThrow('Expense account is locked after the first payment');
    });

    it('amount below net paid: rejects', async () => {
      const expense = await createExpense({ totalAmount: '1000.0000' });
      await payExpense(expense.id, [{
        paymentMethodId: cashMethod.id,
        amount: '600.0000',
        paymentDate: '2026-07-16',
      }]);
      await expect(updateExpense(expense.id, { totalAmount: '500.0000' })).rejects.toThrow('Amount cannot be less than the amount already paid');
    });

    it('overpay (sum > balance): accepted, records OVERPAID status', async () => {
      const expense = await createExpense({ totalAmount: '1000.0000' });
      await payExpense(expense.id, [{
        paymentMethodId: cashMethod.id,
        amount: '600.0000',
        paymentDate: '2026-07-16',
      }]);
      await payExpense(expense.id, [{
        paymentMethodId: bankMethod.id,
        amount: '500.0000',
        paymentDate: '2026-07-17',
      }]);
      const final = await getExpense(expense.id);
      expect(final.paymentStatus).toBe(ExpensePaymentStatus.OVERPAID);
      expect(final.paidAmount).toBe('1100.0000');
    });

    it('refund > source remaining: rejects', async () => {
      const expense = await createExpense({ totalAmount: '1000.0000' });
      await payExpense(expense.id, [{
        paymentMethodId: cashMethod.id,
        amount: '1000.0000',
        paymentDate: '2026-07-16',
        reference: 'PAY-001',
      }]);
      const paymentRows = await ds.query(`SELECT id FROM expense_payments WHERE "expenseId" = $1 AND "sourcePaymentId" IS NULL`, [expense.id]);
      const paymentRowId = paymentRows[0].id;
      await expect(refundExpense(expense.id, [{
        sourcePaymentId: paymentRowId,
        amount: '1500.0000',
        refundDate: '2026-07-17',
      }])).rejects.toThrow('Refund total exceeds the refundable amount for source payment');
    });
  });

  describe('JE assertions: one balanced immutable entry per pay/refund row, correct accounts/dates, none on create/edit/cancel', () => {
    it('create does not post JE', async () => {
      const exp = await createExpense({ totalAmount: '500.0000' });
      const count = await ds.query(`SELECT COUNT(*)::int AS n FROM journal_entry WHERE "sourceType" = $1 AND "sourceDocumentId" = $2`, [AccountingSourceType.EXPENSE, exp.id]);
      expect(count[0].n).toBe(0);
    });

    it('edit does not post JE', async () => {
      const exp = await createExpense({ totalAmount: '500.0000' });
      await updateExpense(exp.id, { description: 'Updated' });
      const count = await ds.query(`SELECT COUNT(*)::int AS n FROM journal_entry WHERE "sourceType" = $1 AND "sourceDocumentId" = $2`, [AccountingSourceType.EXPENSE, exp.id]);
      expect(count[0].n).toBe(0);
    });

    it('cancel does not post JE', async () => {
      const exp = await createExpense({ totalAmount: '500.0000' });
      await cancelExpense(exp.id);
      const count = await ds.query(`SELECT COUNT(*)::int AS n FROM journal_entry WHERE "sourceType" = $1 AND "sourceDocumentId" = $2`, [AccountingSourceType.EXPENSE, exp.id]);
      expect(count[0].n).toBe(0);
    });

    it('uncancel does not post JE', async () => {
      const exp = await createExpense({ totalAmount: '500.0000' });
      await cancelExpense(exp.id);
      const before = await expenseJeCount(exp.id);
      await uncancelExpense(exp.id);
      expect(await expenseJeCount(exp.id)).toBe(before);
    });

    it('each payment row gets exactly one balanced JE with correct accounts and date', async () => {
      const exp = await createExpense({ totalAmount: '1000.0000' });
      const paid = await payExpense(exp.id, [{
        paymentMethodId: cashMethod.id,
        amount: '400.0000',
        paymentDate: '2026-07-20',
        reference: 'PAY-001',
      }, {
        paymentMethodId: bankMethod.id,
        amount: '600.0000',
        paymentDate: '2026-07-21',
        reference: 'PAY-002',
      }]);

      const paymentRows = await ds.query(`SELECT id, "paymentDate" FROM expense_payments WHERE "expenseId" = $1 AND "sourcePaymentId" IS NULL ORDER BY "paymentDate"`, [exp.id]);
      expect(paymentRows.length).toBe(2);

      for (const row of paymentRows) {
        await assertJECount(row.id, PostingType.EXPENSE_PAYMENT, 1);
        await assertJEBalanced(row.id, PostingType.EXPENSE_PAYMENT);
        await assertJEDate(row.id, PostingType.EXPENSE_PAYMENT, formatDate(row.paymentDate));
      }

      await assertJEAccounts(paymentRows[0].id, PostingType.EXPENSE_PAYMENT, '6990', '1100');
      await assertJEAccounts(paymentRows[1].id, PostingType.EXPENSE_PAYMENT, '6990', '1200');
    });

    it('each refund row gets exactly one balanced JE with correct accounts and date', async () => {
      const exp = await createExpense({ totalAmount: '1000.0000' });
      await payExpense(exp.id, [{
        paymentMethodId: cashMethod.id,
        amount: '600.0000',
        paymentDate: '2026-07-20',
      }, {
        paymentMethodId: bankMethod.id,
        amount: '400.0000',
        paymentDate: '2026-07-21',
      }]);

      const paymentRows = await ds.query(`SELECT id FROM expense_payments WHERE "expenseId" = $1 AND "sourcePaymentId" IS NULL ORDER BY "paymentDate"`, [exp.id]);
      const firstPaymentId = paymentRows[0].id;
      const secondPaymentId = paymentRows[1].id;

      await refundExpense(exp.id, [{
        sourcePaymentId: firstPaymentId,
        amount: '300.0000',
        refundDate: '2026-07-22',
      }]);
      await refundExpense(exp.id, [{
        sourcePaymentId: secondPaymentId,
        amount: '400.0000',
        refundDate: '2026-07-23',
      }]);

      const refundRows = await ds.query(`SELECT id, "paymentDate" FROM expense_payments WHERE "expenseId" = $1 AND "sourcePaymentId" IS NOT NULL ORDER BY "paymentDate"`, [exp.id]);
      expect(refundRows.length).toBe(2);

      for (const row of refundRows) {
        await assertJECount(row.id, PostingType.EXPENSE_REFUND, 1);
        await assertJEBalanced(row.id, PostingType.EXPENSE_REFUND);
        await assertJEDate(row.id, PostingType.EXPENSE_REFUND, formatDate(row.paymentDate));
      }

      await assertJEAccounts(refundRows[0].id, PostingType.EXPENSE_REFUND, '1100', '6990');
      await assertJEAccounts(refundRows[1].id, PostingType.EXPENSE_REFUND, '1200', '6990');
    });
  });

  describe('List paymentStatus filter (#1019)', () => {
    // Seeds one expense in each of the four payment states and returns the ids
    // we own. Assertions below are scoped strictly to these ids: the e2e
    // database is shared and suites run size-ordered, so asserting a total
    // count or exact response length breaks CI-only when an unrelated suite
    // leaves expenses behind.
    async function seedOnePerPaymentStatus() {
      const unpaid = await createExpense({ totalAmount: '1000.0000' });

      const partial = await createExpense({ totalAmount: '1000.0000' });
      await payExpense(partial.id, [
        { paymentMethodId: cashMethod.id, amount: '400.0000', paymentDate: '2026-07-16' },
      ]);

      const paid = await createExpense({ totalAmount: '1000.0000' });
      await payExpense(paid.id, [
        { paymentMethodId: cashMethod.id, amount: '1000.0000', paymentDate: '2026-07-16' },
      ]);

      const overpaid = await createExpense({ totalAmount: '1000.0000' });
      await payExpense(overpaid.id, [
        { paymentMethodId: cashMethod.id, amount: '1200.0000', paymentDate: '2026-07-16' },
      ]);

      return {
        [ExpensePaymentStatus.UNPAID]: unpaid.id,
        [ExpensePaymentStatus.PARTIAL]: partial.id,
        [ExpensePaymentStatus.PAID]: paid.id,
        [ExpensePaymentStatus.OVERPAID]: overpaid.id,
      } as Record<ExpensePaymentStatus, string>;
    }

    // Goes through the controller + ValidationPipe + ListExpensesQueryDto —
    // the boundary that actually 400s on a lowercase value in #1019.
    // The body is {data, meta} when paginated and a bare array when page/limit
    // are omitted (expense.service.ts:283), so normalize both shapes.
    async function listByPaymentStatus(paymentStatus: string) {
      const res = await request(app.getHttpServer())
        .get('/accounting/expenses')
        .query({ paymentStatus })
        .set('Authorization', `Bearer ${token}`);
      return res;
    }

    function rowsOf(body: any): Array<{ id: string; paymentStatus: string }> {
      return Array.isArray(body) ? body : body.data;
    }

    // ONE seed, all four statuses asserted in a single test. clearJournal wipes
    // expenses between tests, so seeding per-case would mean 20 expenses and
    // four logins' worth of setup for no extra coverage.
    it('filters by each payment status through the HTTP endpoint', async () => {
      const owned = await seedOnePerPaymentStatus();
      const allStatuses = Object.keys(owned) as ExpensePaymentStatus[];

      for (const status of allStatuses) {
        const res = await listByPaymentStatus(status);
        expect(res.status).toBe(200);

        const returnedIds = rowsOf(res.body).map((r) => r.id);

        // 1. the owned row with the requested status is present
        expect(returnedIds).toContain(owned[status]);

        // 2. the other three owned rows are absent
        for (const other of allStatuses.filter((s) => s !== status)) {
          expect(returnedIds).not.toContain(owned[other]);
        }

        // 3. every row that came back reports the requested status. Safe on a
        //    shared DB: constrains the shape of whatever returned, not how many.
        for (const row of rowsOf(res.body)) {
          expect(row.paymentStatus).toBe(status);
        }
      }
    });

    it('returns all four owned expenses when no paymentStatus filter is applied', async () => {
      const owned = await seedOnePerPaymentStatus();

      const res = await request(app.getHttpServer())
        .get('/accounting/expenses')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);

      const returnedIds = rowsOf(res.body).map((r) => r.id);
      for (const id of Object.values(owned)) {
        expect(returnedIds).toContain(id);
      }
    });

    // The #1019 defect itself, pinned at the boundary: the DTO's uppercase
    // @IsIn (expense.dto.ts:117) must reject the lowercase value the shared
    // filter used to emit. This is why the frontend has to send uppercase.
    it.each(['unpaid', 'partial', 'paid', 'overpaid'])(
      'rejects the lowercase value %s with 400',
      async (lowercase) => {
        const res = await listByPaymentStatus(lowercase);
        expect(res.status).toBe(400);
      },
    );
  });

  describe('Concurrency races via Promise.allSettled', () => {
    it('two payments vs remaining balance: both succeed, status OVERPAID', async () => {
      const exp = await createExpense({ totalAmount: '1000.0000' });
      await payExpense(exp.id, [{
        paymentMethodId: cashMethod.id,
        amount: '400.0000',
        paymentDate: '2026-07-20',
      }]);

      const results = await Promise.allSettled([
        payExpense(exp.id, [{
          paymentMethodId: bankMethod.id,
          amount: '400.0000',
          paymentDate: '2026-07-21',
        }]),
        payExpense(exp.id, [{
          paymentMethodId: cashMethod.id,
          amount: '300.0000',
          paymentDate: '2026-07-21',
        }]),
      ]);

      const { fulfilled, rejected } = partition(results);
      expect(fulfilled).toHaveLength(2);
      expect(rejected).toHaveLength(0);

      const final = await getExpense(exp.id);
      expect(final.paymentStatus).toBe(ExpensePaymentStatus.OVERPAID);
      expect(final.paidAmount).toBe('1100.0000');

      const paymentRows = await ds.query(`SELECT id FROM expense_payments WHERE "expenseId" = $1 AND "sourcePaymentId" IS NULL`, [exp.id]);
      expect(paymentRows.length).toBe(3);

      const jeCount = await ds.query(`SELECT COUNT(*)::int AS n FROM journal_entry WHERE "sourceType" = $1 AND "sourceDocumentId" = $2 AND "postingType" = $3`, [AccountingSourceType.EXPENSE, exp.id, PostingType.EXPENSE_PAYMENT]);
      expect(jeCount[0].n).toBe(3);
    });

    it('two refunds vs same source remainder: exactly one succeeds', async () => {
      const exp = await createExpense({ totalAmount: '1000.0000' });
      await payExpense(exp.id, [{
        paymentMethodId: cashMethod.id,
        amount: '1000.0000',
        paymentDate: '2026-07-20',
      }]);

      const paymentRows = await ds.query(`SELECT id FROM expense_payments WHERE "expenseId" = $1 AND "sourcePaymentId" IS NULL`, [exp.id]);
      const sourcePaymentId = paymentRows[0].id;

      const results = await Promise.allSettled([
        refundExpense(exp.id, [{
          sourcePaymentId,
          amount: '600.0000',
          refundDate: '2026-07-21',
        }]),
        refundExpense(exp.id, [{
          sourcePaymentId,
          amount: '600.0000',
          refundDate: '2026-07-21',
        }]),
      ]);

      const { fulfilled, rejected } = partition(results);
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0].reason as Error).message).toMatch(/exceeds the refundable amount/i);

      const final = await getExpense(exp.id);
      expect(final.paymentStatus).toBe(ExpensePaymentStatus.PARTIAL);
      expect(final.paidAmount).toBe('400.0000');

      const refundRows = await ds.query(`SELECT id FROM expense_payments WHERE "expenseId" = $1 AND "sourcePaymentId" = $2`, [exp.id, sourcePaymentId]);
      expect(refundRows.length).toBe(1);

      const jeCount = await ds.query(`SELECT COUNT(*)::int AS n FROM journal_entry WHERE "sourceType" = $1 AND "sourceDocumentId" = $2 AND "postingType" = $3`, [AccountingSourceType.EXPENSE, exp.id, PostingType.EXPENSE_REFUND]);
      expect(jeCount[0].n).toBe(1);
    });

    it('reconciliation reads the maximum NUMERIC suffix, not the lexical maximum', async () => {
      // paddingDigits is 3, so the real sequence emits EXP-YY-999 and then
      // EXP-YY-1000. '999' sorts ABOVE '1000' lexically ('9' > '1'), so a
      // textual max reads 999 and the next issued number collides with the
      // existing 1000 on expenses.expenseNumber's UNIQUE constraint (#1075).
      // NOTE: a zero-padded '0999' fixture does NOT reproduce this — '0999'
      // sorts below '1000' and the lexical query accidentally returns the right
      // row. The unpadded 3-digit form is what the generator actually issues.
      // Expenses is the representative case for the four types converted here;
      // the same shared query serves Sales/Purchase Orders and Stock Adjustment.
      const yy = String(new Date().getFullYear() % 100).padStart(2, '0');
      const repo = ds.getRepository(Expense);
      for (const seq of ['999', '1000']) {
        await repo.save(
          repo.create({
            expenseNumber: `EXP-${yy}-${seq}`,
            expenseDate: '2026-07-15',
            description: 'numbering fixture',
            expenseAccountId: expenseAccount.id,
            totalAmount: '1.0000',
            paidAmount: '0.0000',
            balance: '1.0000',
          } as any),
        );
      }

      const settings = app.get(SettingsService);
      await settings.syncDocumentNumbersWithDatabase();

      expect(await settings.generateDocumentNumber('Expenses')).toBe(`EXP-${yy}-1001`);
    });

    it('two creates: distinct expenseNumbers', async () => {
      const results = await Promise.allSettled([
        createExpense({ totalAmount: '100.0000' }),
        createExpense({ totalAmount: '200.0000' }),
      ]);

      const { fulfilled, rejected } = partition(results);
      expect(fulfilled).toHaveLength(2);
      expect(rejected).toHaveLength(0);

      const exp1 = fulfilled[0].value as Expense;
      const exp2 = fulfilled[1].value as Expense;
      expect(exp1.expenseNumber).not.toBe(exp2.expenseNumber);
      expect(exp1.expenseNumber).toMatch(/^EXP-\d{2}-\d{3,}$/);
      expect(exp2.expenseNumber).toMatch(/^EXP-\d{2}-\d{3,}$/);
    });
  });
});