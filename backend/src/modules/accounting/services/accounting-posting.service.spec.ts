import { AccountingPostingService } from './accounting-posting.service';
import { ChartOfAccount } from '../entities/chart-of-account.entity';
import { JournalEntry } from '../entities/journal-entry.entity';
import { AccountType } from '../entities/account-type.enum';
import { PostingType } from '../entities/posting-type.enum';
import { AccountingSourceType } from '../entities/source-type.enum';

function acc(id: string, type = AccountType.ASSET): ChartOfAccount {
  return Object.assign(new ChartOfAccount(), { id, type, isActive: true, isPostable: true });
}

function makeService(saved: any[], findOneMap?: Record<string, any>) {
  const map = findOneMap ?? {};
  const lookup = {
    resolveAccount: async (key: string) => acc(`${key}-id`),
    resolveChannelAccount: async (ch: string) => acc(`${ch}-id`),
  } as any;
  const docNumbers = { generateDocumentNumber: async () => 'JE-26-001' } as any;
  const svc = new AccountingPostingService(lookup, docNumbers);
  const manager = {
    getRepository: (entity: any) => {
      const name = entity.name;
      return {
        create: (x: any) => x,
        save: async (x: any) => { saved.push({ entity: name, value: x }); return { ...x, id: 'je-1' }; },
        findOne: async (_opts: any) => map[name] ?? null,
      };
    },
  } as any;
  return { svc, manager };
}

describe('AccountingPostingService', () => {
  it('posts a balanced sales payment JE (Cash debit, Customer Deposit credit)', async () => {
    const saved: any[] = [];
    const { svc, manager } = makeService(saved);
    const res = await svc.postSalesPayment(
      { salesOrderId: 'so1', sourceRef: 'SO-26-001', paymentRowId: 'p1', channel: 'CASH', amount: '500.0000', entryDate: '2026-07-10' },
      manager,
    );
    expect(res.journalEntryId).toBe('je-1');
    const entry = saved.find((s) => s.entity === 'JournalEntry')!.value as JournalEntry;
    expect(entry.postingType).toBe(PostingType.SALES_PAYMENT);
    expect(entry.lines).toHaveLength(2);
    const debit = entry.lines.find((l) => l.debit !== '0.0000');
    const credit = entry.lines.find((l) => l.credit !== '0.0000');
    expect(debit!.debit).toBe('500.0000');
    expect(credit!.credit).toBe('500.0000');
  });

  it('posts an expense payment JE (Dr expense account, Cr channel account)', async () => {
    const saved: any[] = [];
    const { svc, manager } = makeService(saved, {
      ChartOfAccount: { id: 'exp-acc-1', isPostable: true, type: AccountType.EXPENSE },
    });
    const res = await svc.postExpensePayment({
      expenseId: 'exp1', sourceRef: 'EXP-26-001', paymentRowId: 'pr1',
      expenseAccountId: 'exp-acc-1', channel: 'BANK', amount: '1250.0000',
      entryDate: '2026-07-15',
    }, manager);
    expect(res.journalEntryId).toBe('je-1');
    const entry = saved.find((s) => s.entity === 'JournalEntry')!.value as any;
    expect(entry.postingType).toBe(PostingType.EXPENSE_PAYMENT);
    expect(entry.sourceType).toBe(AccountingSourceType.EXPENSE);
    expect(entry.sourceEventId).toBe('pr1');
    expect(entry.sourceDocumentId).toBe('exp1');
    expect(entry.sourceRef).toBe('EXP-26-001');
    expect(entry.lines).toHaveLength(2);
    const debit = entry.lines.find((l) => l.debit !== '0.0000');
    const credit = entry.lines.find((l) => l.credit !== '0.0000');
    expect(debit!.debit).toBe('1250.0000');
    expect(credit!.credit).toBe('1250.0000');
    expect(debit!.accountId).toBe('exp-acc-1');
    expect(credit!.accountId).toBe('BANK-id');
  });

  it('posts an expense refund JE (Dr channel account, Cr expense account)', async () => {
    const saved: any[] = [];
    const { svc, manager } = makeService(saved, {
      ChartOfAccount: { id: 'exp-acc-2', isPostable: true, type: AccountType.EXPENSE },
    });
    const res = await svc.postExpenseRefund({
      expenseId: 'exp1', sourceRef: 'EXP-26-001', refundRowId: 'rr1',
      expenseAccountId: 'exp-acc-2', channel: 'BANK', amount: '300.0000',
      entryDate: '2026-07-16',
    }, manager);
    expect(res.journalEntryId).toBe('je-1');
    const entry = saved.find((s) => s.entity === 'JournalEntry')!.value as any;
    expect(entry.postingType).toBe(PostingType.EXPENSE_REFUND);
    expect(entry.sourceType).toBe(AccountingSourceType.EXPENSE);
    expect(entry.sourceEventId).toBe('rr1');
    expect(entry.sourceDocumentId).toBe('exp1');
    expect(entry.sourceRef).toBe('EXP-26-001');
    expect(entry.lines).toHaveLength(2);
    const debit = entry.lines.find((l) => l.debit !== '0.0000');
    const credit = entry.lines.find((l) => l.credit !== '0.0000');
    expect(debit!.debit).toBe('300.0000');
    expect(credit!.credit).toBe('300.0000');
    // Refund: Dr channel, Cr expense
    expect(debit!.accountId).toBe('BANK-id');
    expect(credit!.accountId).toBe('exp-acc-2');
  });

  it('returns existing JE when expense payment already posted (find-or-return)', async () => {
    const saved: any[] = [];
    const { svc, manager } = makeService(saved, {
      ChartOfAccount: { id: 'exp-acc-1', isPostable: true, type: AccountType.EXPENSE },
      JournalEntry: { id: 'existing-je-42' },
    });
    const res = await svc.postExpensePayment({
      expenseId: 'exp1', sourceRef: 'EXP-26-001', paymentRowId: 'pr1',
      expenseAccountId: 'exp-acc-1', channel: 'BANK', amount: '1250.0000',
      entryDate: '2026-07-15',
    }, manager);
    expect(res.journalEntryId).toBe('existing-je-42');
    // No new JournalEntry should be saved
    expect(saved.find((s) => s.entity === 'JournalEntry')).toBeUndefined();
  });

  it('rejects an unbalanced entry', async () => {
    const saved: any[] = [];
    const { svc } = makeService(saved);
    await expect(
      (svc as any).assertBalanced([
        { debit: '500.0000', credit: '0.0000' },
        { debit: '0.0000', credit: '400.0000' },
      ]),
    ).rejects.toThrow(/balanced|debit.*credit/i);
  });
});
