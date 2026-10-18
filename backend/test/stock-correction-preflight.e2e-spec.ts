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
  it('is a read-only script with five labelled result sets', async () => {
    const { statements } = preflightStatements();
    expect(statements).toHaveLength(5);

    const expectedSections = [
      'order_counts',
      'legacy_receipt_shape',
      'stock_balance_reconciliation',
      'history_horizon_context',
      'product_stock_history',
    ];

    const runner: QueryRunner = ds.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query('SET TRANSACTION READ ONLY');
      for (const [index, statement] of statements.entries()) {
        expect(statement).toContain(`'${expectedSections[index]}'`);
        const rows = await runner.query(statement);
        if (rows.length > 0) expect(rows[0].section).toBe(expectedSections[index]);
      }
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
