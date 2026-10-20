import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource, QueryRunner } from 'typeorm';

import { AppModule } from '../src/app.module';
import { configureTestAppValidation } from './utils/configure-test-app-validation';

const PREFLIGHT_PATH = path.join(process.cwd(), 'scripts/preflight-stock-correction-path.sql');

let app: INestApplication;
let ds: DataSource;

function preflightStatements(): { raw: string; statements: string[] } {
  const raw = fs.readFileSync(PREFLIGHT_PATH, 'utf8');
  const withoutComments = raw.replace(/^\s*--.*$/gm, '');
  expect(withoutComments).toMatch(/BEGIN READ ONLY;/i);
  expect(withoutComments).toMatch(/ROLLBACK;/i);

  const code = withoutComments
    .replace(/BEGIN READ ONLY;/i, '')
    .replace(/ROLLBACK;/i, '');
  expect(code).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE)\b/i);

  const statements = code
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
  return { raw, statements };
}

async function executePreflightStatement(
  runner: QueryRunner,
  statement: string,
): Promise<Record<string, unknown>[]> {
  const psqlExec = statement.match(/^(.*)\\gexec\s*$/s);
  if (!psqlExec) return runner.query(statement);

  const generated = await runner.query(psqlExec[1]);
  expect(generated).toHaveLength(1);
  expect(typeof generated[0].query).toBe('string');
  return runner.query(generated[0].query);
}

beforeAll(async () => {
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleFixture.createNestApplication();
  configureTestAppValidation(app);
  await app.init();
  ds = app.get(DataSource);
});

afterAll(async () => {
  await app.close();
});

describe('preflight-stock-correction-path.sql', () => {
  it('is a read-only script with seven labelled result sets', async () => {
    const { statements } = preflightStatements();
    expect(statements).toHaveLength(7);

    const expectedSections = [
      'order_counts',
      'legacy_receipt_shape',
      'stock_balance_reconciliation',
      'history_horizon_context',
      'product_stock_history',
      'fulfilment_batch_coverage_exposure',
      'valuation_gap_exposure',
    ];

    const runner: QueryRunner = ds.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query('SET TRANSACTION READ ONLY');
      for (const [index, statement] of statements.entries()) {
        expect(statement).toContain(`'${expectedSections[index]}'`);
        const rows = await executePreflightStatement(runner, statement);
        if (rows.length > 0) expect(rows[0].section).toBe(expectedSections[index]);
      }
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });

  it('runs all seven sections when the valuation-gap migration is absent', async () => {
    const { statements } = preflightStatements();
    const runner = ds.createQueryRunner();
    await runner.connect();
    try {
      for (const table of [
        'sales_orders',
        'purchase_orders',
        'purchase_order_items',
        'stock_movements',
        'purchase_cost_history',
        'journal_entry',
        'journal_entry_line',
        'products',
        'audit_logs',
      ]) {
        await runner.query(`CREATE TEMP TABLE ${table} AS TABLE public.${table} WITH NO DATA`);
      }

      await runner.startTransaction();
      await runner.query('SET TRANSACTION READ ONLY');
      await runner.query('SET LOCAL search_path TO pg_temp, pg_catalog');
      let valuationGapRows: Record<string, unknown>[] = [];
      for (const [index, statement] of statements.entries()) {
        expect(statement).toContain(`'${[
          'order_counts',
          'legacy_receipt_shape',
          'stock_balance_reconciliation',
          'history_horizon_context',
          'product_stock_history',
          'fulfilment_batch_coverage_exposure',
          'valuation_gap_exposure',
        ][index]}'`);
        const rows = await executePreflightStatement(runner, statement);
        if (index === 6) valuationGapRows = rows;
        if (rows.length > 0) expect(rows[0].section).toBeDefined();
      }
      expect(valuationGapRows).toEqual([
        {
          section: 'valuation_gap_exposure',
          status: 'not migrated yet, no gaps can be recorded before #1406',
        },
      ]);
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.query(`DROP TABLE IF EXISTS
        pg_temp.sales_orders,
        pg_temp.purchase_orders,
        pg_temp.purchase_order_items,
        pg_temp.stock_movements,
        pg_temp.purchase_cost_history,
        pg_temp.journal_entry,
        pg_temp.journal_entry_line,
        pg_temp.products,
        pg_temp.audit_logs`);
      await runner.release();
    }
  });

  it('reports persisted partial and wholly unbatched valuation gaps by product', async () => {
    const { statements } = preflightStatements();
    const runner = ds.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query(`CREATE TEMP TABLE products (id uuid, name text)`);
      await runner.query(`CREATE TEMP TABLE stock_occurrences (id uuid, kind text)`);
      await runner.query(`CREATE TEMP TABLE stock_movements (
        id uuid, "productId" uuid, "occurrenceId" uuid, "movementType" text, quantity numeric
      )`);
      await runner.query(`CREATE TEMP TABLE stock_movement_valuation_gaps (
        "movementId" uuid, quantity numeric, "valueScale8" numeric, status text
      )`);
      const productId = '00000000-0000-4000-8000-000000000201';
      const partialOccurrenceId = '00000000-0000-4000-8000-000000000202';
      const unbatchedOccurrenceId = '00000000-0000-4000-8000-000000000203';
      const partialMovementId = '00000000-0000-4000-8000-000000000204';
      const unbatchedMovementId = '00000000-0000-4000-8000-000000000205';
      await runner.query(`INSERT INTO products VALUES ($1, 'Gap product')`, [productId]);
      await runner.query(
        `INSERT INTO stock_occurrences VALUES ($1, 'fulfilment'), ($2, 'fulfilment')`,
        [partialOccurrenceId, unbatchedOccurrenceId],
      );
      await runner.query(
        `INSERT INTO stock_movements VALUES
          ($1, $2, $3, 'sale', -8), ($4, $2, $5, 'sale', -8)`,
        [partialMovementId, productId, partialOccurrenceId, unbatchedMovementId, unbatchedOccurrenceId],
      );
      await runner.query(
        `INSERT INTO stock_movement_valuation_gaps VALUES
          ($1, 3, 0, 'unvalued_gap'), ($2, 8, 0, 'unvalued_gap')`,
        [partialMovementId, unbatchedMovementId],
      );
      await runner.query('SET TRANSACTION READ ONLY');

      const rows = await executePreflightStatement(runner, statements[6]);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        section: 'valuation_gap_exposure',
        product_id: productId,
        product_name: 'Gap product',
        fulfillment_occurrences: '2',
        sale_movements: '2',
        uncovered_quantity: '11',
        valuation_status: 'unvalued, recorded zero posted value is not known zero cost',
      });
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });

  it('reports every correction audit and reversal when counts differ for an order', async () => {
    const { statements } = preflightStatements();
    const runner = ds.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query(`CREATE TEMP TABLE audit_logs (
        id uuid, "entityType" text, "entityId" uuid, description text, "createdAt" timestamptz
      )`);
      await runner.query(`CREATE TEMP TABLE journal_entry (
        id uuid, "sourceDocumentId" uuid, "postingType" text,
        "createdAt" timestamptz, "reversalOfEntryId" uuid
      )`);

      const documentId = '00000000-0000-4000-8000-000000000101';
      await runner.query(
        `INSERT INTO audit_logs (id, "entityType", "entityId", description, "createdAt")
         VALUES
           ('00000000-0000-4000-8000-000000000102', 'SalesOrder', $1, 'Unfulfilled sales order: SO-101', now()),
           ('00000000-0000-4000-8000-000000000103', 'SalesOrder', $1, 'Unfulfilled sales order: SO-101', now())`,
        [documentId],
      );
      await runner.query(
        `INSERT INTO journal_entry (id, "sourceDocumentId", "postingType", "createdAt", "reversalOfEntryId")
         VALUES ('00000000-0000-4000-8000-000000000104', $1, 'SALES_FULFILLMENT_REVENUE', now(),
                 '00000000-0000-4000-8000-000000000105')`,
        [documentId],
      );

      await runner.query('SET TRANSACTION READ ONLY');
      const rows = await runner.query(statements[3]);
      expect(rows).toHaveLength(4);
      const summary = rows.find((row: any) => row.record_type === 'summary');
      expect(summary).toMatchObject({
        section: 'history_horizon_context',
        record_type: 'summary',
        unmatched_audit_count: '2',
        unmatched_reversal_count: '1',
      });
      expect(rows.filter((row: any) => row.record_type === 'audit_unmatched_or_ambiguous')).toHaveLength(2);
      expect(rows.filter((row: any) => row.record_type === 'reversal_unmatched_or_ambiguous')).toHaveLength(1);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
