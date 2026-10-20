import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { configureTestAppValidation } from './utils/configure-test-app-validation';

/**
 * #1409 (#1398 project 2): the inspection script is read-only and reports
 * every section, in order. Sections that list offending rows may be empty;
 * the others always return at least one row.
 */
const SCRIPT_PATH = path.join(process.cwd(), 'scripts/inspect-1398-p2.sql');

const SECTIONS = [
  'environment',
  'soft_deleted_or_inactive',
  'vendor_payment_status',
  'costing_method',
  'stock_vs_batches',
  'zero_or_null_cost_batches',
  'inventory_ledger_vs_batches',
  'undo_exposure',
  'movements_outside_workflows',
  'balance_chain_breaks',
  'product_anomalies',
  'approver_pairing',
  'drafts_and_config',
  'deferred_until_3_25_0',
];
const MAY_BE_EMPTY = new Set([
  'stock_vs_batches',
  'zero_or_null_cost_batches',
  'movements_outside_workflows',
  'balance_chain_breaks',
  'product_anomalies',
]);

let app: INestApplication;
let ds: DataSource;

function statements(): string[] {
  const raw = fs.readFileSync(SCRIPT_PATH, 'utf8');
  const code = raw.replace(/^\s*--.*$/gm, '');
  expect(code).toMatch(/BEGIN READ ONLY;/i);
  expect(code).toMatch(/ROLLBACK;\s*$/i);
  const body = code.replace(/BEGIN READ ONLY;/i, '').replace(/ROLLBACK;\s*$/i, '');
  expect(body).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE|GRANT)\b/i);
  return body
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
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

describe('inspect-1398-p2.sql (#1409)', () => {
  it('declares each section exactly once, in order', () => {
    const labels = statements().map((statement) => {
      const found = statement.match(/'([a-z0-9_]+)'\s+AS\s+section/gi) ?? [];
      expect(found).toHaveLength(1);
      return found[0].match(/'([a-z0-9_]+)'/i)![1];
    });
    expect(labels).toEqual(SECTIONS);
  });

  it('runs every statement inside a read-only transaction and reports the always-present sections', async () => {
    const runner = ds.createQueryRunner();
    await runner.connect();
    try {
      await runner.query('START TRANSACTION READ ONLY');
      const seen: string[] = [];
      for (const [index, statement] of statements().entries()) {
        const rows: Array<{ section: string }> = await runner.query(statement);
        if (!MAY_BE_EMPTY.has(SECTIONS[index])) {
          expect(rows.length).toBeGreaterThan(0);
        }
        for (const row of rows) expect(row.section).toBe(SECTIONS[index]);
        if (rows.length > 0) seen.push(SECTIONS[index]);
      }
      expect(seen).toEqual(SECTIONS.filter((s) => !MAY_BE_EMPTY.has(s) || seen.includes(s)));
    } finally {
      await runner.query('ROLLBACK');
      await runner.release();
    }
  });
});
