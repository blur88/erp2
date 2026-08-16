import { AccountingPostingService } from '../accounting-posting.service';
import { PostingType, AccountingSourceType } from '../../../../common/accounting-posting/enums';

const acc = (code: string, id: string) => ({ id, code, isPostable: true, type: 'Equity' } as any);

describe('owner equity postings', () => {
  let service: AccountingPostingService;
  let saved: any[];
  // findExistingEntry() reads through this; null means "nothing posted yet".
  let existingEntry: { id: string } | null;

  const manager = {
    getRepository: () => ({
      create: (x: any) => x,
      save: async (x: any) => { saved.push(x); return { ...x, id: 'je-1' }; },
      findOne: async () => existingEntry,
    }),
  } as any;

  beforeEach(() => {
    saved = [];
    existingEntry = null;
    const lookup = {
      resolveChannelAccount: async (ch: string) => acc(ch === 'CASH' ? '1100' : '1200', 'ch-1'),
      resolveAccount: async (key: string) => {
        const map: Record<string, string> = {
          ownerCapital: '3100', ownerDrawings: '3300', inventory: '1300',
        };
        return acc(map[key], `${key}-id`);
      },
    } as any;
    const settings = { generateDocumentNumber: async () => 'JE-26-001' } as any;
    service = new AccountingPostingService(lookup, settings);
  });

  const codesOf = (entry: any) => entry.lines.map((l: any) =>
    ({ accountId: l.accountId, debit: l.debit, credit: l.credit }));

  it('capital injection debits the channel and credits owner capital', async () => {
    await service.postOwnerCapitalInjection({
      equityDocumentId: 'doc-1', settlementRowId: 'set-1', channel: 'BANK',
      amount: '20000.0000', sourceRef: 'EQ-26-001', entryDate: '2026-08-16',
    }, manager);
    const entry = saved[0];
    expect(entry.postingType).toBe(PostingType.OWNER_CAPITAL_INJECTION);
    expect(entry.sourceType).toBe(AccountingSourceType.OWNER_EQUITY);
    expect(entry.sourceEventId).toBe('set-1');
    expect(codesOf(entry)).toEqual([
      { accountId: 'ch-1', debit: '20000.0000', credit: '0.0000' },
      { accountId: 'ownerCapital-id', debit: '0.0000', credit: '20000.0000' },
    ]);
  });

  it('cash drawing debits owner drawings and credits the channel', async () => {
    await service.postOwnerCashDrawing({
      equityDocumentId: 'doc-2', settlementRowId: 'set-2', channel: 'CASH',
      amount: '500.0000', sourceRef: 'EQ-26-002', entryDate: '2026-08-16',
    }, manager);
    expect(codesOf(saved[0])).toEqual([
      { accountId: 'ownerDrawings-id', debit: '500.0000', credit: '0.0000' },
      { accountId: 'ch-1', debit: '0.0000', credit: '500.0000' },
    ]);
  });

  it('stock drawing debits owner drawings, credits inventory, keyed on the movement', async () => {
    await service.postOwnerStockDrawing({
      equityDocumentId: 'doc-3', stockMovementId: 'mv-9',
      amount: '75.0000', sourceRef: 'EQ-26-003', entryDate: '2026-08-16',
    }, manager);
    const entry = saved[0];
    expect(entry.sourceEventId).toBe('mv-9');
    expect(codesOf(entry)).toEqual([
      { accountId: 'ownerDrawings-id', debit: '75.0000', credit: '0.0000' },
      { accountId: 'inventory-id', debit: '0.0000', credit: '75.0000' },
    ]);
  });

  it('is idempotent: a repeated settlement posting returns the first entry', async () => {
    const cmd = {
      equityDocumentId: 'doc-1', settlementRowId: 'set-1', channel: 'BANK' as const,
      amount: '20000.0000', sourceRef: 'EQ-26-001', entryDate: '2026-08-16',
    };
    existingEntry = null;
    const first = await service.postOwnerCapitalInjection(cmd, manager);
    // Simulate the row now being on file for this sourceEventId.
    existingEntry = { id: first.journalEntryId };
    const second = await service.postOwnerCapitalInjection(cmd, manager);

    expect(second.journalEntryId).toBe(first.journalEntryId);
    expect(saved).toHaveLength(1);   // NOT 2 — no duplicate journal entry
  });

  it('is idempotent per stock movement id', async () => {
    const cmd = {
      equityDocumentId: 'doc-3', stockMovementId: 'mv-9',
      amount: '75.0000', sourceRef: 'EQ-26-003', entryDate: '2026-08-16',
    };
    existingEntry = null;
    const first = await service.postOwnerStockDrawing(cmd, manager);
    existingEntry = { id: first.journalEntryId };
    const second = await service.postOwnerStockDrawing(cmd, manager);

    expect(second.journalEntryId).toBe(first.journalEntryId);
    expect(saved).toHaveLength(1);
  });

  it('refunds swap the injection and drawing directions', async () => {
    await service.postOwnerCapitalInjectionRefund({
      equityDocumentId: 'doc-1', settlementRowId: 'set-3', channel: 'BANK',
      amount: '100.0000', sourceRef: 'EQ-26-001', entryDate: '2026-08-16',
    }, manager);
    expect(codesOf(saved[0])).toEqual([
      { accountId: 'ownerCapital-id', debit: '100.0000', credit: '0.0000' },
      { accountId: 'ch-1', debit: '0.0000', credit: '100.0000' },
    ]);
    saved.length = 0;
    await service.postOwnerCashDrawingRefund({
      equityDocumentId: 'doc-2', settlementRowId: 'set-4', channel: 'CASH',
      amount: '50.0000', sourceRef: 'EQ-26-002', entryDate: '2026-08-16',
    }, manager);
    expect(codesOf(saved[0])).toEqual([
      { accountId: 'ch-1', debit: '50.0000', credit: '0.0000' },
      { accountId: 'ownerDrawings-id', debit: '0.0000', credit: '50.0000' },
    ]);
  });
});
