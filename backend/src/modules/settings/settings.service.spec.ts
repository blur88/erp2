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
      {} as any, {} as any, {} as any, {} as any,
      {} as any,
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
      {} as any,
      {} as any,
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
    const documentNumberSettingRepository = {
      find: jest.fn().mockResolvedValue([
        { documentName: 'Journal Entries', prefix: 'JE', nextNumber: 42 },
      ]),
      update: jest.fn().mockResolvedValue(undefined),
    };

    const service = new SettingsService(
      {} as any, {} as any,
      documentNumberSettingRepository as any,
      {} as any, {} as any, {} as any, {} as any,
      {} as any,
      {} as any,
    );

    await service.syncDocumentNumbersWithDatabase();

    expect(documentNumberSettingRepository.update).not.toHaveBeenCalled();
  });

  it('createDefaultDocumentNumberSettings seeds Journal Entries collision-safe (max existing +1)', async () => {
    const saved: any[] = [];
    const documentNumberSettingRepository = {
      find: jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValue(saved),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((row) => row),
      save: jest.fn(async (row) => { saved.push(row); return row; }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const dataSource = { query: jest.fn().mockResolvedValue([{ next: 8 }]) };

    const service = new SettingsService(
      {} as any, {} as any,
      documentNumberSettingRepository as any,
      {} as any, {} as any, {} as any, {} as any,
      {} as any,
      dataSource as any,
    );

    await service.syncDocumentNumbersWithDatabase();

    const je = saved.find((r) => r.documentName === 'Journal Entries');
    expect(je).toBeDefined();
    expect(je.nextNumber).toBe(8);
    const so = saved.find((r) => r.documentName === 'Sales Orders');
    expect(so.nextNumber).toBe(1);
  });

  it('seeds Journal Entries at 1 when journal_entry table is absent (42P01)', async () => {
    const saved: any[] = [];
    const documentNumberSettingRepository = {
      find: jest.fn().mockResolvedValueOnce([]).mockResolvedValue(saved),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((row) => row),
      save: jest.fn(async (row) => { saved.push(row); return row; }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const dataSource = { query: jest.fn().mockRejectedValue(Object.assign(new Error('relation "journal_entry" does not exist'), { code: '42P01' })) };

    const service = new SettingsService(
      {} as any, {} as any,
      documentNumberSettingRepository as any,
      {} as any, {} as any, {} as any, {} as any,
      {} as any,
      dataSource as any,
    );

    await service.syncDocumentNumbersWithDatabase();
    const je = saved.find((r) => r.documentName === 'Journal Entries');
    expect(je.nextNumber).toBe(1);
  });

  it('rethrows a non-missing-table DB error instead of masking it as 1', async () => {
    const documentNumberSettingRepository = {
      find: jest.fn().mockResolvedValueOnce([]).mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((row) => row),
      save: jest.fn(async (row) => row),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const dataSource = { query: jest.fn().mockRejectedValue(Object.assign(new Error('connection reset'), { code: '08006' })) };

    const service = new SettingsService(
      {} as any, {} as any,
      documentNumberSettingRepository as any,
      {} as any, {} as any, {} as any, {} as any,
      {} as any,
      dataSource as any,
    );

    await expect(service.syncDocumentNumbersWithDatabase()).rejects.toThrow(
      'Failed to sync document numbers',
    );
    expect(documentNumberSettingRepository.save).not.toHaveBeenCalledWith(
      expect.objectContaining({ documentName: 'Journal Entries' }),
    );
  });

  it('syncDocumentNumbersWithDatabase parses EXP sequence and sets nextNumber', async () => {
    const documentNumberSettingRepository = {
      find: jest.fn().mockResolvedValue([
        { documentName: 'Expenses', prefix: 'EXP' },
      ]),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const queryBuilder = createQueryBuilderMock({ expenseNumber: 'EXP-26-123456' });
    const expenseRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };

    const service = new SettingsService(
      {} as any, {} as any,
      documentNumberSettingRepository as any,
      {} as any, {} as any,
      {} as any, {} as any,
      expenseRepository as any,
      {} as any,
    );

    await service.syncDocumentNumbersWithDatabase();

    expect(queryBuilder.where).toHaveBeenCalledWith(
      'e.expenseNumber LIKE :p',
      expect.objectContaining({ p: expect.stringMatching(/^EXP-\d{2}-%$/) }),
    );
    expect(documentNumberSettingRepository.update).toHaveBeenCalledWith(
      { documentName: 'Expenses' },
      { nextNumber: 123457, lastResetYear: expect.any(Number) },
    );
  });

  it('createDefaultDocumentNumberSettings includes Expenses in defaults', async () => {
    const saved: any[] = [];
    const documentNumberSettingRepository = {
      find: jest.fn().mockResolvedValueOnce([]).mockResolvedValue(saved),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((row) => row),
      save: jest.fn(async (row) => { saved.push(row); return row; }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const expenseRepository = { createQueryBuilder: jest.fn() };
    const dataSource = { query: jest.fn().mockResolvedValue([{ next: 1 }]) };

    const service = new SettingsService(
      {} as any, {} as any,
      documentNumberSettingRepository as any,
      {} as any, {} as any, {} as any, {} as any,
      expenseRepository as any,
      dataSource as any,
    );

    await service.syncDocumentNumbersWithDatabase();

    const expense = saved.find((r) => r.documentName === 'Expenses');
    expect(expense).toBeDefined();
    expect(expense.documentName).toBe('Expenses');
    expect(expense.prefix).toBe('EXP');
    expect(expense.nextNumber).toBe(1);
  });
});
