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

  it('matches schema-sync comments, numeric defaults, and primary-key naming', async () => {
    const { runner, statements } = makeRunner('0', '0');

    await new AddStockMovementValuationGaps1792455000000().up(runner);

    const sql = statements.join(' ').replace(/\s+/g, ' ');
    expect(sql).toContain(
      `COMMENT ON TABLE "stock_movement_valuation_gaps" IS 'Unvalued stock coverage gaps; zero posted value preserves interim COGS and does not assert known zero cost'`,
    );
    expect(sql).toContain(
      `COMMENT ON COLUMN "stock_movement_valuation_gaps"."movementId" IS 'Unique sale movement whose batch coverage is incomplete'`,
    );
    expect(sql).toContain(
      `COMMENT ON COLUMN "stock_movement_valuation_gaps"."quantity" IS 'Uncovered quantity, recorded separately from batch consumption'`,
    );
    expect(sql).toContain(
      `COMMENT ON COLUMN "stock_movement_valuation_gaps"."valueScale8" IS 'Compatibility posted value; zero is explicitly unvalued, not known zero cost'`,
    );
    expect(sql).toContain(
      `COMMENT ON COLUMN "stock_occurrences"."hasValuationGap" IS 'Whether this fulfillment contains unvalued stock provenance gaps'`,
    );
    expect(sql).toContain(`"valueScale8" numeric(24,8) NOT NULL DEFAULT '0'`);
    expect(sql).toContain('"PK_572cc0ea03c004f55c866f58bdd" PRIMARY KEY');
  });

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
