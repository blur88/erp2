import { MigrationInterface, QueryRunner } from 'typeorm';

export class NormalizeValuationRecordDefaults1793198400000 implements MigrationInterface {
  name = 'NormalizeValuationRecordDefaults1793198400000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE inventory_reconciliations ALTER COLUMN "approvedTotalValue" SET DEFAULT '0'::numeric, ALTER COLUMN difference SET DEFAULT '0'::numeric`);
    await q.query(`ALTER TABLE inventory_opening_positions ALTER COLUMN "uncoveredQuantity" SET DEFAULT '0'::numeric`);
    await q.query(`ALTER TABLE inventory_opening_position_batches ALTER COLUMN "releaseQuantity" SET DEFAULT '0'::numeric`);
    await q.query(`ALTER TABLE inventory_reconciliation_journal_lines ALTER COLUMN debit SET DEFAULT '0'::numeric, ALTER COLUMN credit SET DEFAULT '0'::numeric`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE inventory_reconciliations ALTER COLUMN "approvedTotalValue" SET DEFAULT 0, ALTER COLUMN difference SET DEFAULT 0`);
    await q.query(`ALTER TABLE inventory_opening_positions ALTER COLUMN "uncoveredQuantity" DROP DEFAULT`);
    await q.query(`ALTER TABLE inventory_opening_position_batches ALTER COLUMN "releaseQuantity" SET DEFAULT 0`);
    await q.query(`ALTER TABLE inventory_reconciliation_journal_lines ALTER COLUMN debit SET DEFAULT 0, ALTER COLUMN credit SET DEFAULT 0`);
  }
}
