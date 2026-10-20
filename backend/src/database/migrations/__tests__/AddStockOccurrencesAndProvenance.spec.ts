import { jest } from '@jest/globals';
import { QueryRunner } from 'typeorm';
import { AddStockOccurrencesAndProvenance1792258286736 } from '../1792258286736-AddStockOccurrencesAndProvenance';

describe('AddStockOccurrencesAndProvenance migration rollback', () => {
  function makeRunner(evidence: Record<string, string>) {
    const statements: string[] = [];
    const query = (jest.fn as unknown as any)().mockImplementation(async (sql: string) => {
      statements.push(sql);
      return [evidence];
    });
    return { runner: { query } as unknown as QueryRunner, statements, query };
  }

  it('reapplies safely when rollback has preserved the additive movement enum value', async () => {
    const { runner, statements } = makeRunner({});

    await new AddStockOccurrencesAndProvenance1792258286736().up(runner);

    expect(
      statements.some(
        (sql) =>
          /ALTER TYPE "public"\."stock_movements_movementtype_enum" ADD VALUE IF NOT EXISTS 'purchase_receipt_reversal'/i.test(
            sql,
          ),
      ),
    ).toBe(true);
  });

  it('adds restrictive foreign keys for legacy journal and receipt-batch occurrences', async () => {
    const { runner, statements } = makeRunner({});

    await new AddStockOccurrencesAndProvenance1792258286736().up(runner);

    expect(
      statements.some(
        (sql) =>
          /FOREIGN KEY \("legacyJournalEntryId"\) REFERENCES "journal_entry"\("id"\) ON DELETE RESTRICT/i.test(
            sql,
          ),
      ),
    ).toBe(true);
    expect(
      statements.some(
        (sql) =>
          /FOREIGN KEY \("occurrenceId"\) REFERENCES "stock_occurrences"\("id"\) ON DELETE RESTRICT/i.test(
            sql,
          ),
      ),
    ).toBe(true);
  });

  it('refuses before any DDL when rollback would discard occurrence evidence', async () => {
    const { runner, statements } = makeRunner({
      occurrence_count: '1',
      allocation_count: '0',
      movement_occurrence_count: '0',
      reversal_movement_count: '0',
      batch_occurrence_count: '0',
      reversed_batch_count: '0',
    });

    await expect(
      new AddStockOccurrencesAndProvenance1792258286736().down(runner),
    ).rejects.toThrow(/occurrence.*evidence would be lost/i);
    expect(statements).toHaveLength(1);
  });

  it('never relabels movements or removes the reversal enum member on an empty rollback', async () => {
    const { runner, statements } = makeRunner({
      occurrence_count: '0',
      allocation_count: '0',
      movement_occurrence_count: '0',
      reversal_movement_count: '0',
      batch_occurrence_count: '0',
      reversed_batch_count: '0',
    });

    await new AddStockOccurrencesAndProvenance1792258286736().down(runner);

    expect(statements.some((sql) => /UPDATE\s+"stock_movements"\s+SET\s+"movementType"/i.test(sql))).toBe(false);
    expect(statements.some((sql) => /stock_movements_movementtype_enum_old/i.test(sql))).toBe(false);
    expect(statements.some((sql) => /DROP TYPE\s+"public"\."stock_movements_movementtype_enum"/i.test(sql))).toBe(false);
  });
});
