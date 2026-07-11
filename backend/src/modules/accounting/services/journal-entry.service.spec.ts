import { JournalEntryService } from './journal-entry.service';

describe('JournalEntryService.deriveStatus', () => {
  const svc = new JournalEntryService({} as any, {} as any);
  it('returns Reversed when a reversal exists', () => {
    expect(svc.deriveStatus({ id: 'e1' } as any, true)).toBe('Reversed');
  });
  it('returns Posted when none exists', () => {
    expect(svc.deriveStatus({ id: 'e1' } as any, false)).toBe('Posted');
  });
});

describe('JournalEntryService.entryTotals', () => {
  const svc = new JournalEntryService({} as any, {} as any);
  it('sums debit/credit in display scale', () => {
    const totals = svc.entryTotals([
      { debit: '500.0000', credit: '0.0000' },
      { debit: '0.0000', credit: '500.0000' },
    ] as any);
    expect(totals.totalDebit).toBe('500.0000');
    expect(totals.totalCredit).toBe('500.0000');
    expect(totals.difference).toBe('0.0000');
  });
});
