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

describe('Owner Equity document numbering', () => {
  const currentYY = new Date().getFullYear() % 100;

  it('seeds an Owner Equity row with the EQ prefix', async () => {
    const saved: any[] = [];
    const docRepo = {
      findOne: async () => null, // nothing seeded yet
      create: (x: any) => x,
      save: async (x: any) => {
        saved.push(x);
        return x;
      },
    } as any;
    // createDefaultDocumentNumberSettings() derives the Journal Entries row via
    // nextJournalEntrySequence(), which queries the DB. It only swallows error
    // code 42P01 (undefined_table) — anything else propagates — so this query
    // MUST be stubbed or the test fails on the JE row before reaching EQ.
    const dataSource = { query: async () => [{ next: 1 }] } as any;

    await (makeService(docRepo, dataSource) as any).createDefaultDocumentNumberSettings();

    const eq = saved.find((r) => r.documentName === 'Owner Equity');
    expect(eq).toBeDefined();
    expect(eq.prefix).toBe('EQ');
    expect(eq.paddingDigits).toBe(3);
    expect(eq.nextNumber).toBe(1);
    expect(eq.lastResetYear).toBe(currentYY);
  });

  it('reconciles with a numeric-suffix query, never a lexical ORDER BY', async () => {
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
          documentName: 'Owner Equity',
          prefix: 'EQ',
          paddingDigits: 3,
          nextNumber: 1,
          lastResetYear: currentYY,
        },
      ],
      update: async () => undefined,
    } as any;

    await makeService(docRepo, dataSource).syncDocumentNumbersWithDatabase();

    const eqQuery = queries.find((q) => q.includes('owner_equity_documents'));
    expect(eqQuery).toBeDefined();
    // The whole point: cast the suffix to int and MAX it. At paddingDigits 3 the
    // generator emits EQ-26-999, which sorts above EQ-26-1000 lexically, so an
    // ORDER BY ... DESC LIMIT 1 reads 999 and the next issued number collides
    // with the row already at 1000.
    expect(eqQuery).toContain('split_part');
    expect(eqQuery).toContain('MAX(');
    expect(eqQuery).not.toMatch(/ORDER BY[\s\S]*LIMIT/i);
  });
});
