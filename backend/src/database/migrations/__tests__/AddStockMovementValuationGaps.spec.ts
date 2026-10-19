import { jest } from '@jest/globals';
import { QueryRunner } from 'typeorm';
import { AddStockMovementValuationGaps1792455000000 } from '../1792455000000-AddStockMovementValuationGaps';

describe('AddStockMovementValuationGaps migration rollback', () => {
  function makeRunner(gapCount: string, markedOccurrenceCount: string) {
    const statements: string[] = [];
    const query = (jest.fn as unknown as any)().mockImplementation(async (sql: string) => {
      statements.push(sql);
      return [{ gap_count: gapCount, marked_occurrence_count: markedOccurrenceCount }];
    });
    return { runner: { query } as unknown as QueryRunner, statements };
  }

  it.each([
    ['gap rows', '1', '0'],
    ['occurrence markers', '0', '1'],
  ])('refuses before DDL when populated %s would be discarded', async (_evidence, gaps, markers) => {
    const { runner, statements } = makeRunner(gaps, markers);

    await expect(new AddStockMovementValuationGaps1792455000000().down(runner)).rejects.toThrow(
      /populated valuation-gap evidence would be lost/i,
    );
    expect(statements).toHaveLength(1);
  });

  it('removes the empty gap schema on rollback', async () => {
    const { runner, statements } = makeRunner('0', '0');

    await new AddStockMovementValuationGaps1792455000000().down(runner);

    expect(statements).toContain('DROP TABLE "stock_movement_valuation_gaps"');
    expect(statements).toContain('ALTER TABLE "stock_occurrences" DROP COLUMN "hasValuationGap"');
  });
});
