import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  it('reuses the caller transaction manager (no nested transaction)', async () => {
    const manager = {
      query: jest.fn()
        .mockResolvedValueOnce([{ prefix: 'JE', paddingDigits: 3, nextNumber: 1, lastResetYear: new Date().getFullYear() % 100 }])
        .mockResolvedValueOnce(undefined),
    } as any;
    const dataSourceMock = { transaction: jest.fn() };
    const service = new SettingsService(
      {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, {} as any, {} as any,
      dataSourceMock as any,
    );
    const num = await service.generateDocumentNumber('Journal Entries', manager);
    expect(num).toMatch(/^JE-\d{2}-001$/);
    expect(manager.query).toHaveBeenCalled();
    expect(dataSourceMock.transaction).not.toHaveBeenCalled();
  });

  const createQueryBuilderMock = (result: unknown) => ({
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(result),
  });

  it('syncDocumentNumbersWithDatabase parses PO sequence and sets nextNumber', async () => {
    const documentNumberSettingRepository = {
      find: jest.fn().mockResolvedValue([
        { documentName: 'Purchase Orders', prefix: 'PO' },
      ]),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const queryBuilder = createQueryBuilderMock({ orderNumber: 'PO-26-123456' });
    const purchaseOrderRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };

    const service = new SettingsService(
      {} as any, {} as any,
      documentNumberSettingRepository as any,
      {} as any, {} as any,
      purchaseOrderRepository as any,
      {} as any, {} as any,
      {} as any,
    );

    await service.syncDocumentNumbersWithDatabase();

    expect(queryBuilder.where).toHaveBeenCalledWith(
      'po.orderNumber LIKE :p',
      expect.objectContaining({ p: expect.stringMatching(/^PO-\d{2}-%$/) }),
    );
    expect(documentNumberSettingRepository.update).toHaveBeenCalledWith(
      { documentName: 'Purchase Orders' },
      { nextNumber: 123457, lastResetYear: expect.any(Number) },
    );
  });

  it('syncDocumentNumbersWithDatabase leaves unknown document types (e.g. Journal Entries) unchanged', async () => {
    // Regression for #901: the sync route must NOT reset a type it can't compute a
    // source-table max for back to 1 — that would collide with already-issued numbers.
    const documentNumberSettingRepository = {
      find: jest.fn().mockResolvedValue([
        { documentName: 'Journal Entries', prefix: 'JE', nextNumber: 42 },
      ]),
      update: jest.fn().mockResolvedValue(undefined),
    };

    const service = new SettingsService(
      {} as any, {} as any,
      documentNumberSettingRepository as any,
      {} as any, {} as any, {} as any, {} as any, {} as any,
      {} as any,
    );

    await service.syncDocumentNumbersWithDatabase();

    // No update issued for the unknown type — nextNumber preserved.
    expect(documentNumberSettingRepository.update).not.toHaveBeenCalled();
  });

  it('createDefaultDocumentNumberSettings seeds Journal Entries collision-safe (max existing +1)', async () => {
    // Regression for #901: the create-default fallback must not seed JE at a literal 1
    // when journal entries already exist, or the next post collides on journalNo.
    const saved: any[] = [];
    const documentNumberSettingRepository = {
      // Empty table -> triggers createDefaultDocumentNumberSettings; then non-empty.
      find: jest.fn()
        .mockResolvedValueOnce([]) // syncDocumentNumbersWithDatabase: table empty
        .mockResolvedValue(saved), // re-read after createDefault
      findOne: jest.fn().mockResolvedValue(null), // no row exists yet
      create: jest.fn((row) => row),
      save: jest.fn(async (row) => { saved.push(row); return row; }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    // journal_entry already has JE-yy-007 -> next sequence 8.
    const dataSource = { query: jest.fn().mockResolvedValue([{ next: 8 }]) };

    const service = new SettingsService(
      {} as any, {} as any,
      documentNumberSettingRepository as any,
      {} as any, {} as any, {} as any, {} as any, {} as any,
      dataSource as any,
    );

    await service.syncDocumentNumbersWithDatabase();

    const je = saved.find((r) => r.documentName === 'Journal Entries');
    expect(je).toBeDefined();
    expect(je.nextNumber).toBe(8); // collision-safe, not 1
    const so = saved.find((r) => r.documentName === 'Sales Orders');
    expect(so.nextNumber).toBe(1); // other types unaffected
  });
});
