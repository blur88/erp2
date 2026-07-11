import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStockAdjustmentRevertedStatus1783800000000 implements MigrationInterface {
  name = 'AddStockAdjustmentRevertedStatus1783800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "stock_adjustments_status_enum" ADD VALUE IF NOT EXISTS 'reverted'`);
  }

  public async down(): Promise<void> {
    // Postgres cannot drop an enum value; down is a no-op.
  }
}
