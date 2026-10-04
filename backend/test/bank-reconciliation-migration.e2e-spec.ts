import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource, QueryRunner } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureTestAppValidation } from './utils/configure-test-app-validation';
import { AddBankStatementReconciliations1791044381374 } from '../src/database/migrations/1791044381374-AddBankStatementReconciliations';

let app: INestApplication;
let ds: DataSource;

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

async function dropMigrationArtifacts(qr: QueryRunner): Promise<void> {
  await qr.query(
    `ALTER TABLE "bank_statement_reconciliation_version_lines" DROP CONSTRAINT IF EXISTS "FK_85326b3d6654db2471c1c124efc"`,
  );
  await qr.query(
    `ALTER TABLE "bank_statement_reconciliation_version_lines" DROP CONSTRAINT IF EXISTS "FK_f4f641540beb7d3f91d50f571ca"`,
  );
  await qr.query(
    `ALTER TABLE "bank_statement_reconciliation_versions" DROP CONSTRAINT IF EXISTS "FK_c37b68ba4562dcc4fa026cf91f6"`,
  );
  await qr.query(
    `ALTER TABLE "bank_statement_reconciliation_versions" DROP CONSTRAINT IF EXISTS "FK_9f0a0f02668e3b7fe8a3b5d01a5"`,
  );
  await qr.query(
    `ALTER TABLE "bank_statement_reconciliation_setup_marks" DROP CONSTRAINT IF EXISTS "FK_3e667c80a964fcc1e79be68a808"`,
  );
  await qr.query(
    `ALTER TABLE "bank_statement_reconciliation_setup_marks" DROP CONSTRAINT IF EXISTS "FK_26f8bf9639b802241838e6bbd3b"`,
  );
  await qr.query(
    `ALTER TABLE "bank_statement_reconciliation_lines" DROP CONSTRAINT IF EXISTS "FK_738d25d520fc505e0277b5eff2c"`,
  );
  await qr.query(
    `ALTER TABLE "bank_statement_reconciliation_lines" DROP CONSTRAINT IF EXISTS "FK_cb1a72da1f157afbc398d5c77a0"`,
  );
  await qr.query(
    `ALTER TABLE "bank_statement_reconciliations" DROP CONSTRAINT IF EXISTS "FK_2f4dc0ba113c6e4ba2cda27055a"`,
  );

  await qr.query(
    `DROP TABLE IF EXISTS "bank_statement_reconciliation_version_lines" CASCADE`,
  );
  await qr.query(
    `DROP TYPE IF EXISTS "public"."bank_statement_reconciliation_version_lines_role_enum" CASCADE`,
  );
  await qr.query(
    `DROP TABLE IF EXISTS "bank_statement_reconciliation_versions" CASCADE`,
  );
  await qr.query(
    `DROP TABLE IF EXISTS "bank_statement_reconciliation_setup_marks" CASCADE`,
  );
  await qr.query(
    `DROP TABLE IF EXISTS "bank_statement_reconciliation_lines" CASCADE`,
  );
  await qr.query(
    `DROP TYPE IF EXISTS "public"."bank_statement_reconciliation_lines_kind_enum" CASCADE`,
  );
  await qr.query(
    `DROP TABLE IF EXISTS "bank_statement_reconciliations" CASCADE`,
  );
  await qr.query(
    `DROP TYPE IF EXISTS "public"."bank_statement_reconciliations_status_enum" CASCADE`,
  );
  await qr.query(
    `DELETE FROM document_number_settings WHERE "documentName" = 'Bank Reconciliations'`,
  );
}

/** Pre-migration state inside a transaction that is ALWAYS rolled back. */
async function inRolledBackTxn(fn: (qr: QueryRunner) => Promise<void>): Promise<void> {
  const qr = ds.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    await dropMigrationArtifacts(qr);
    await fn(qr);
  } finally {
    await qr.rollbackTransaction();
    await qr.release();
  }
}

const migration = new AddBankStatementReconciliations1791044381374();

async function runUpWith(setupSql?: string): Promise<void> {
  await inRolledBackTxn(async (qr) => {
    if (setupSql) {
      await qr.query(setupSql);
    }
    await migration.up(qr);
  });
}

describe('AddBankStatementReconciliations migration e2e', () => {
  it('aborts and names the table when bank_reconciliations exists', async () => {
    await expect(runUpWith('CREATE TABLE bank_reconciliations (id int)')).rejects.toThrow(
      /legacy reconciliation tables present: bank_reconciliations/,
    );
  });

  it('aborts and names the table when reconciled_transactions exists', async () => {
    await expect(runUpWith('CREATE TABLE reconciled_transactions (id int)')).rejects.toThrow(
      /legacy reconciliation tables present: reconciled_transactions/,
    );
  });

  it('aborts as unexpected when a new table already exists', async () => {
    await expect(
      runUpWith('CREATE TABLE bank_statement_reconciliation_lines (id int)'),
    ).rejects.toThrow(/unexpected existing tables: bank_statement_reconciliation_lines/);
  });

  it('does not abort for an unrelated %reconcil% table', async () => {
    await expect(runUpWith('CREATE TABLE stock_reconcile_notes (id int)')).resolves.toBeUndefined();
  });

  it('down refuses when a version row exists', async () => {
    await inRolledBackTxn(async (qr) => {
      await migration.up(qr);
      const [acct] = await qr.query(
        `SELECT id, code, name FROM chart_of_account WHERE "isBankAccount" LIMIT 1`,
      );
      const [recon] = await qr.query(
        `INSERT INTO bank_statement_reconciliations (
           "reconciliationNo", "bankAccountId", "sequenceNo", "periodFrom", "periodTo", "openingBalance", "closingBalance", status
         ) VALUES ('BR-TEST-001', $1, 1, '2026-01-01', '2026-01-31', 0, 0, 'DRAFT') RETURNING id`,
        [acct.id],
      );
      await qr.query(
        `INSERT INTO bank_statement_reconciliation_versions (
           "reconciliationId", "versionNo", "reconciliationNo", "sequenceNo",
           "bankAccountId", "bankAccountCode", "bankAccountName",
           "periodFrom", "periodTo", "openingBalance", "closingBalance"
         ) VALUES ($1, 1, 'BR-TEST-001', 1, $2, $3, $4, '2026-01-01', '2026-01-31', 0, 0)`,
        [recon.id, acct.id, acct.code, acct.name],
      );
      await expect(migration.down(qr)).rejects.toThrow(
        /completion history exists \(1 versions\)/,
      );
    });
  });

  it('preflight labels legacy, new and review categories', async () => {
    await inRolledBackTxn(async (qr) => {
      await qr.query('CREATE TABLE bank_reconciliations (id int)');
      await qr.query('CREATE TABLE bank_statement_reconciliations (id int)');
      await qr.query('CREATE TABLE stock_reconcile_notes (id int)');

      const sqlContent = fs.readFileSync(
        path.join(process.cwd(), 'scripts/preflight-bank-reconciliation.sql'),
        'utf8',
      );
      // Strip BEGIN READ ONLY; and ROLLBACK; so query runner executes the SELECT statement
      const selectSql = sqlContent
        .replace(/BEGIN READ ONLY;/i, '')
        .replace(/ROLLBACK;/i, '')
        .trim();

      const rows: Array<{ category: string; table_name: string }> = await qr.query(selectSql);

      expect(rows).toEqual(
        expect.arrayContaining([
          { category: 'legacy', table_name: 'bank_reconciliations' },
          { category: 'new', table_name: 'bank_statement_reconciliations' },
          { category: 'review', table_name: 'stock_reconcile_notes' },
        ]),
      );
    });
  });

  it('seeds the BR document-number row once', async () => {
    await inRolledBackTxn(async (qr) => {
      await migration.up(qr);
      const rows = await qr.query(
        `SELECT * FROM document_number_settings WHERE "documentName" = 'Bank Reconciliations'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].prefix).toBe('BR');
      expect(rows[0].paddingDigits).toBe(3);
      expect(rows[0].nextNumber).toBe(1);

      // Running up's document-number insert again is idempotent
      await qr.query(`
        INSERT INTO document_number_settings ("documentName", prefix, "paddingDigits", "nextNumber", "lastResetYear")
        SELECT 'Bank Reconciliations', 'BR', 3, 1, EXTRACT(YEAR FROM CURRENT_DATE)::int % 100
        WHERE NOT EXISTS (
          SELECT 1 FROM document_number_settings WHERE "documentName" = 'Bank Reconciliations')
      `);
      const rowsAfter = await qr.query(
        `SELECT * FROM document_number_settings WHERE "documentName" = 'Bank Reconciliations'`,
      );
      expect(rowsAfter).toHaveLength(1);
    });
  });
});
