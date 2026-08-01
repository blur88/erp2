import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Preserves the draft-time stock snapshot so completion can overwrite
 * oldQuantity/newQuantity with the real movement balances (#982).
 *
 * Nullable with no backfill: rows completed before this column existed have no
 * recoverable snapshot, and NULL states that honestly. Zero-difference lines
 * also stay NULL — they create no stock movement, so there are no real balances
 * to reconcile against.
 */
export class AddRequestedOldQuantityToStockAdjustmentItems1785700000000
  implements MigrationInterface
{
  name = 'AddRequestedOldQuantityToStockAdjustmentItems1785700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "stock_adjustment_items"
      ADD COLUMN "requestedOldQuantity" numeric(15,4)
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "stock_adjustment_items"."requestedOldQuantity" IS
      'Stock quantity shown to the user when the adjustment was drafted. Preserved at completion so drift against the real movement balance is auditable. NULL for rows completed before this column existed, and for zero-difference lines.'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "stock_adjustment_items" DROP COLUMN "requestedOldQuantity"
    `);
  }
}
