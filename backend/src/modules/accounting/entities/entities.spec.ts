import { AccountType } from './account-type.enum';
import { PostingType } from './posting-type.enum';
import { AccountingSourceType } from './source-type.enum';
import { ChartOfAccount } from './chart-of-account.entity';
import { AccountingSettings } from './accounting-settings.entity';
import { JournalEntry } from './journal-entry.entity';
import { JournalEntryLine } from './journal-entry-line.entity';
import { Expense, ExpenseDocumentStatus, ExpensePaymentStatus } from './expense.entity';
import { ExpensePayment } from './expense-payment.entity';
import { getMetadataArgsStorage } from 'typeorm';

describe('accounting entities', () => {
  it('exposes expected enum values', () => {
    expect(AccountType.ASSET).toBe('Asset');
    expect(PostingType.SALES_FULFILLMENT_COGS).toBe('SALES_FULFILLMENT_COGS');
    expect(AccountingSourceType.OPENING_BALANCE).toBe('OPENING_BALANCE');
    expect(ExpenseDocumentStatus.DRAFT).toBe('DRAFT');
    expect(ExpenseDocumentStatus.CANCELLED).toBe('CANCELLED');
    expect(ExpensePaymentStatus.UNPAID).toBe('UNPAID');
    expect(ExpensePaymentStatus.PARTIAL).toBe('PARTIAL');
    expect(ExpensePaymentStatus.PAID).toBe('PAID');
  });

  it('constructs entity instances with expected fields', () => {
    const acc = new ChartOfAccount();
    acc.code = '1100';
    acc.type = AccountType.ASSET;
    acc.isPostable = true;
    expect(acc.code).toBe('1100');

    const settings = new AccountingSettings();
    settings.cashAccountId = 'x';
    expect(settings.cashAccountId).toBe('x');

    const je = new JournalEntry();
    je.postingType = PostingType.SALES_PAYMENT;
    const line = new JournalEntryLine();
    line.debit = '500.0000';
    line.credit = '0.0000';
    expect(je.postingType).toBe('SALES_PAYMENT');
    expect(line.debit).toBe('500.0000');
  });

  it('creates Expense and ExpensePayment instances with metadata', () => {
    const expense = new Expense();
    expense.expenseNumber = 'EXP-001';
    expense.expenseDate = '2025-01-15';
    expense.description = 'Office supplies';
    expense.expenseAccountId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    expense.totalAmount = '1500.0000';
    expense.paidAmount = '0.0000';
    expense.balance = '1500.0000';
    expense.documentStatus = ExpenseDocumentStatus.DRAFT;
    expense.paymentStatus = ExpensePaymentStatus.UNPAID;

    expect(expense.expenseNumber).toBe('EXP-001');
    expect(expense.description).toBe('Office supplies');
    expect(expense.documentStatus).toBe('DRAFT');
    expect(expense.paymentStatus).toBe('UNPAID');

    const payment = new ExpensePayment();
    payment.expenseId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    payment.paymentMethodId = 'aaaaaaaa-bbbb-cccc-dddd-ffffffffffff';
    payment.paymentDate = '2025-01-20';
    payment.amount = '1500.0000';

    expect(payment.amount).toBe('1500.0000');
    expect(payment.reference).toBeUndefined();
    payment.reference = null;
    expect(payment.reference).toBeNull();

    const tables = getMetadataArgsStorage().tables;
    const expenseTable = tables.find(t => t.target === Expense);
    expect(expenseTable?.name).toBe('expenses');
    const expensePaymentTable = tables.find(t => t.target === ExpensePayment);
    expect(expensePaymentTable?.name).toBe('expense_payments');
  });
});
