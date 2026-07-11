import { AccountingPostingService } from './accounting-posting.service';
import { ChartOfAccount } from '../entities/chart-of-account.entity';
import { JournalEntry } from '../entities/journal-entry.entity';
import { AccountType } from '../entities/account-type.enum';
import { PostingType } from '../entities/posting-type.enum';

function acc(id: string, type = AccountType.ASSET): ChartOfAccount {
  return Object.assign(new ChartOfAccount(), { id, type, isActive: true, isPostable: true });
}

function makeService(saved: any[]) {
  const lookup = {
    resolveAccount: async (key: string) => acc(`${key}-id`),
    resolveChannelAccount: async (ch: string) => acc(`${ch}-id`),
  } as any;
  const docNumbers = { generateDocumentNumber: async () => 'JE-26-001' } as any;
  const svc = new AccountingPostingService(lookup, docNumbers);
  const manager = {
    getRepository: (entity: any) => ({
      create: (x: any) => x,
      save: async (x: any) => { saved.push({ entity: entity.name, value: x }); return { ...x, id: 'je-1' }; },
    }),
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
