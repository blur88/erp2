import { AccountType } from './account-type.enum';
import { PostingType } from './posting-type.enum';
import { AccountingSourceType } from './source-type.enum';
import { ChartOfAccount } from './chart-of-account.entity';
import { AccountingSettings } from './accounting-settings.entity';
import { JournalEntry } from './journal-entry.entity';
import { JournalEntryLine } from './journal-entry-line.entity';

describe('accounting entities', () => {
  it('exposes expected enum values', () => {
    expect(AccountType.ASSET).toBe('Asset');
    expect(PostingType.SALES_FULFILLMENT_COGS).toBe('SALES_FULFILLMENT_COGS');
    expect(AccountingSourceType.OPENING_BALANCE).toBe('OPENING_BALANCE');
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
});
