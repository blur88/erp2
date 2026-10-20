import { jest } from '@jest/globals';
import { QueryRunner } from 'typeorm';
import { AddReceiptLineIdentity1792369500000 } from '../1792369500000-AddReceiptLineIdentity';

describe('AddReceiptLineIdentity migration rollback', () => {
  function makeRunner(evidence: Record<string, string>) {
    const statements: string[] = [];
    const query = (jest.fn as unknown as any)().mockImplementation(async (sql: string) => {
      statements.push(sql);
      return [evidence];
    });
    return { runner: { query } as unknown as QueryRunner, statements };
  }

  it('refuses before DDL when receipt-line evidence is populated', async () => {
    const { runner, statements } = makeRunner({
      movement_line_count: '1',
      batch_line_count: '0',
      versioned_receipt_count: '0',
    });

    await expect(new AddReceiptLineIdentity1792369500000().down(runner)).rejects.toThrow(
      /receipt-line identity evidence would be lost/i,
    );
    expect(statements).toHaveLength(1);
  });

  it('removes empty receipt-line schema without rewriting evidence', async () => {
    const { runner, statements } = makeRunner({
      movement_line_count: '0',
      batch_line_count: '0',
      versioned_receipt_count: '0',
    });

    await new AddReceiptLineIdentity1792369500000().down(runner);

    expect(statements.some((sql) => /UPDATE\s+"stock_movements"/i.test(sql))).toBe(false);
    expect(statements.some((sql) => /DROP COLUMN "purchaseOrderItemId"/i.test(sql))).toBe(true);
  });
});
