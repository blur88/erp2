import { SettingsService } from '../settings.service';

/** documentNumberSettingRepository is arg 3, dataSource is arg 8. */
function makeService(docRepo: any, dataSource: any): SettingsService {
  return new SettingsService(
    undefined as any, // 1 companySettingsRepository
    undefined as any, // 2 regionalSettingsRepository
    docRepo, // 3 documentNumberSettingRepository
    undefined as any, // 4 salesOrderRepository
    undefined as any, // 5 purchaseOrderRepository
    undefined as any, // 6 stockAdjustmentRepository
    undefined as any, // 7 expenseRepository
    dataSource, // 8 dataSource
  );
}

describe('Bank Reconciliation document numbering', () => {
  const currentYY = new Date().getFullYear() % 100;

  it('seeds a Bank Reconciliations row with the BR prefix', async () => {
    const saved: any[] = [];
    const docRepo = {
      findOne: async () => null, // nothing seeded yet
      create: (x: any) => x,
      save: async (x: any) => {
        saved.push(x);
        return x;
      },
    } as any;
    const dataSource = { query: async () => [{ next: 1 }] } as any;

    await (makeService(docRepo, dataSource) as any).createDefaultDocumentNumberSettings();

    const br = saved.find((r) => r.documentName === 'Bank Reconciliations');
    expect(br).toBeDefined();
    expect(br.prefix).toBe('BR');
    expect(br.paddingDigits).toBe(3);
    expect(br.nextNumber).toBe(1);
    expect(br.lastResetYear).toBe(currentYY);
  });

  it('reconciles with a numeric-suffix query on bank_statement_reconciliations', async () => {
    const queries: string[] = [];
    const dataSource = {
      query: async (sql: string) => {
        queries.push(sql);
        return [{ max: 0 }];
      },
    } as any;
    const docRepo = {
      find: async () => [
        {
          documentName: 'Bank Reconciliations',
          prefix: 'BR',
          paddingDigits: 3,
          nextNumber: 1,
          lastResetYear: currentYY,
        },
      ],
      update: async () => undefined,
    } as any;

    await makeService(docRepo, dataSource).syncDocumentNumbersWithDatabase();

    const brQuery = queries.find((q) => q.includes('bank_statement_reconciliations'));
    expect(brQuery).toBeDefined();
    expect(brQuery).toContain('reconciliationNo');
    expect(brQuery).toContain('split_part');
    expect(brQuery).toContain('MAX(');
    expect(brQuery).not.toMatch(/ORDER BY[\s\S]*LIMIT/i);
  });
});
