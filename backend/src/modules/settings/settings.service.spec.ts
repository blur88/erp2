import { jest } from '@jest/globals';
import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  /*
   * The seeded row carries a placeholder registration number, like the other
   * fields — but the VALUE must stay self-evidently fake. A plausible-looking
   * stand-in (e.g. '000000000000') would be dangerous: the Form B tax view
   * prints this as N1a, so it could reach a filed return unnoticed.
   *
   * Form B additionally treats this exact string as unset
   * (PLACEHOLDER_IDENTITY in form-b.service.ts), so the two must stay in step.
   */
  it('seeds company settings with a non-numeric placeholder registration number', async () => {
    let created: any;
    const companySettingsRepository = {
      findOne: (jest.fn as unknown as any)().mockResolvedValue(null),
      create: (jest.fn as unknown as any)((v: any) => { created = v; return v; }),
      save: (jest.fn as unknown as any)((v: any) => Promise.resolve({ ...v, id: 'seeded' })),
    };
    const service = new SettingsService(
      companySettingsRepository as any, {} as any, {} as any,
      {} as any, {} as any, {} as any,
      {} as any,
      { transaction: (jest.fn as unknown as any)() } as any,
    );

    await service.getCompanySettings();

    expect(created.registrationNumber).toBe('Your Registration Number');
    // Must not resemble a real SSM number — no digit runs at all.
    expect(created.registrationNumber).not.toMatch(/\d{4,}/);
    expect(created.name).toBe('Your Company Name');
  });


  it('reuses the caller transaction manager (no nested transaction)', async () => {
    const manager = {
      query: (jest.fn as unknown as any)()
        .mockResolvedValueOnce([{ prefix: 'JE', paddingDigits: 3, nextNumber: 1, lastResetYear: new Date().getFullYear() % 100 }])
        .mockResolvedValueOnce(undefined),
    } as any;
    const dataSourceMock = { transaction: (jest.fn as unknown as any)() };
    const service = new SettingsService(
      {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any,
      {} as any,
      dataSourceMock as any,
    );
    const num = await service.generateDocumentNumber('Journal Entries', manager);
    expect(num).toMatch(/^JE-\d{2}-001$/);
    expect(manager.query).toHaveBeenCalled();
    expect(dataSourceMock.transaction).not.toHaveBeenCalled();
  });

  // Every reconciled document type must read its max sequence numerically, not
  // lexically: at paddingDigits 3 the generator emits <PREFIX>-26-999, which sorts
  // ABOVE <PREFIX>-26-1000 as text, so an ORDER BY ... DESC LIMIT 1 reads 999 and
  // the next issued number collides with the row already at 1000 (issue #1075,
  // same class as #901).
  describe.each([
    ['Sales Orders', 'SO', 'sales_orders', 'orderNumber'],
    ['Purchase Orders', 'PO', 'purchase_orders', 'orderNumber'],
    ['Stock Adjustment', 'SA', 'stock_adjustments', 'adjustmentNumber'],
    ['Expenses', 'EXP', 'expenses', 'expenseNumber'],
  ])('syncDocumentNumbersWithDatabase for %s', (documentName, prefix, table, column) => {
    const currentYY = new Date().getFullYear() % 100;

    const setup = (max: number | null) => {
      const documentNumberSettingRepository = {
        find: (jest.fn as unknown as any)().mockResolvedValue([{ documentName, prefix }]),
        update: (jest.fn as unknown as any)().mockResolvedValue(undefined),
      };
      const dataSource = { query: (jest.fn as unknown as any)().mockResolvedValue([{ max }]) };
      const service = new SettingsService(
        {} as any, {} as any,
        documentNumberSettingRepository as any,
        {} as any, {} as any, {} as any,
        {} as any,
        dataSource as any,
      );
      return { service, documentNumberSettingRepository, dataSource };
    };

    it('queries the right table and column with a numeric-suffix max', async () => {
      const { service, dataSource } = setup(1000);

      await service.syncDocumentNumbersWithDatabase();

      expect(dataSource.query).toHaveBeenCalledTimes(1);
      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toContain(`FROM ${table}`);
      expect(sql).toContain(`split_part("${column}", '-', 3)`);
      expect(sql).toContain('MAX(');
      expect(sql).not.toMatch(/ORDER BY[\s\S]*LIMIT/i);
      // Prefix and year are parameterized; only the identifiers are inlined.
      expect(params).toEqual([prefix, String(currentYY).padStart(2, '0')]);
    });

    it('sets nextNumber past a four-digit sequence', async () => {
      const { service, documentNumberSettingRepository } = setup(1000);

      await service.syncDocumentNumbersWithDatabase();

      expect(documentNumberSettingRepository.update).toHaveBeenCalledWith(
        { documentName },
        { nextNumber: 1001, lastResetYear: currentYY },
      );
    });

    it('sets nextNumber to 1 when the table holds no current-year rows', async () => {
      const { service, documentNumberSettingRepository } = setup(null);

      await service.syncDocumentNumbersWithDatabase();

      expect(documentNumberSettingRepository.update).toHaveBeenCalledWith(
        { documentName },
        { nextNumber: 1, lastResetYear: currentYY },
      );
    });
  });

  it('syncDocumentNumbersWithDatabase leaves unknown document types (e.g. Journal Entries) unchanged', async () => {
    const documentNumberSettingRepository = {
      find: (jest.fn as unknown as any)().mockResolvedValue([
        { documentName: 'Journal Entries', prefix: 'JE', nextNumber: 42 },
      ]),
      update: (jest.fn as unknown as any)().mockResolvedValue(undefined),
    };

    const service = new SettingsService(
      {} as any, {} as any,
      documentNumberSettingRepository as any,
      {} as any, {} as any, {} as any,
      {} as any,
      {} as any,
    );

    await service.syncDocumentNumbersWithDatabase();

    expect(documentNumberSettingRepository.update).not.toHaveBeenCalled();
  });

  it('createDefaultDocumentNumberSettings seeds Journal Entries collision-safe (max existing +1)', async () => {
    const saved: any[] = [];
    const documentNumberSettingRepository = {
      find: (jest.fn as unknown as any)()
        .mockResolvedValueOnce([])
        .mockResolvedValue(saved),
      findOne: (jest.fn as unknown as any)().mockResolvedValue(null),
      create: (jest.fn as unknown as any)((row) => row),
      save: (jest.fn as unknown as any)(async (row) => { saved.push(row); return row; }),
      update: (jest.fn as unknown as any)().mockResolvedValue(undefined),
    };
    // Serves both nextJournalEntrySequence() ({ next }) and the per-type
    // reconciliation max ({ max }) — seeded rows are reconciled in the same call.
    const dataSource = { query: (jest.fn as unknown as any)().mockResolvedValue([{ next: 8, max: 0 }]) };

    const service = new SettingsService(
      {} as any, {} as any,
      documentNumberSettingRepository as any,
      {} as any, {} as any, {} as any,
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
      find: (jest.fn as unknown as any)().mockResolvedValueOnce([]).mockResolvedValue(saved),
      findOne: (jest.fn as unknown as any)().mockResolvedValue(null),
      create: (jest.fn as unknown as any)((row) => row),
      save: (jest.fn as unknown as any)(async (row) => { saved.push(row); return row; }),
      update: (jest.fn as unknown as any)().mockResolvedValue(undefined),
    };
    const dataSource = { query: (jest.fn as unknown as any)().mockRejectedValue(Object.assign(new Error('relation "journal_entry" does not exist'), { code: '42P01' })) };

    const service = new SettingsService(
      {} as any, {} as any,
      documentNumberSettingRepository as any,
      {} as any, {} as any, {} as any,
      {} as any,
      dataSource as any,
    );

    await service.syncDocumentNumbersWithDatabase();
    const je = saved.find((r) => r.documentName === 'Journal Entries');
    expect(je.nextNumber).toBe(1);
  });

  it('creates defaults without Payments or Goods Received', async () => {
    const saved: Array<{ documentName: string }> = [];
    const repo = {
      findOne: (jest.fn as unknown as any)().mockResolvedValue(null),
      create: (jest.fn as unknown as any)((v: any) => v),
      save: (jest.fn as unknown as any)((v: any) => {
        saved.push(v);
        return Promise.resolve(v);
      }),
      find: (jest.fn as unknown as any)().mockResolvedValue([]),
    };
    const service = new SettingsService(
      {} as any, {} as any,
      repo as any,
      {} as any, {} as any, {} as any, {} as any,
      { query: (jest.fn as unknown as any)().mockResolvedValue([{ next: 1 }]) } as any,
    );

    await (service as any).createDefaultDocumentNumberSettings();

    const names = saved.map((r) => r.documentName);
    expect(names).toEqual([
      'Sales Orders',
      'Purchase Orders',
      'Stock Adjustment',
      'Journal Entries',
      'Expenses',
      'Owner Equity',
    ]);
    expect(names).not.toContain('Payments');
    expect(names).not.toContain('Goods Received');
  });

  it('rethrows a non-missing-table DB error instead of masking it as 1', async () => {
    const documentNumberSettingRepository = {
      find: (jest.fn as unknown as any)().mockResolvedValueOnce([]).mockResolvedValue([]),
      findOne: (jest.fn as unknown as any)().mockResolvedValue(null),
      create: (jest.fn as unknown as any)((row) => row),
      save: (jest.fn as unknown as any)(async (row) => row),
      update: (jest.fn as unknown as any)().mockResolvedValue(undefined),
    };
    const dataSource = { query: (jest.fn as unknown as any)().mockRejectedValue(Object.assign(new Error('connection reset'), { code: '08006' })) };

    const service = new SettingsService(
      {} as any, {} as any,
      documentNumberSettingRepository as any,
      {} as any, {} as any, {} as any,
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

  it('createDefaultDocumentNumberSettings includes Expenses in defaults', async () => {
    const saved: any[] = [];
    const documentNumberSettingRepository = {
      find: (jest.fn as unknown as any)().mockResolvedValueOnce([]).mockResolvedValue(saved),
      findOne: (jest.fn as unknown as any)().mockResolvedValue(null),
      create: (jest.fn as unknown as any)((row) => row),
      save: (jest.fn as unknown as any)(async (row) => { saved.push(row); return row; }),
      update: (jest.fn as unknown as any)().mockResolvedValue(undefined),
    };
    // Serves both nextJournalEntrySequence() ({ next }) and the per-type
    // reconciliation max ({ max }) — the seeded rows are reconciled in the same call.
    const dataSource = { query: (jest.fn as unknown as any)().mockResolvedValue([{ next: 1, max: 0 }]) };

    const service = new SettingsService(
      {} as any, {} as any,
      documentNumberSettingRepository as any,
      {} as any, {} as any, {} as any,
      {} as any,
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
