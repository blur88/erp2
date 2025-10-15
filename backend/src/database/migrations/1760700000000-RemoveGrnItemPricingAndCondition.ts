import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Remove unitCost, totalAmount, and condition columns from goods_received_note_items
 *
 * This migration removes pricing and condition tracking from GRN items table:
 * - unitCost: Unit cost at time of receipt (no longer needed)
 * - totalAmount: Total amount for line (no longer needed)
 * - condition: Item condition at receipt (no longer needed)
 *
 * The GRN items now only track ordered and received quantities.
 */
export class RemoveGrnItemPricingAndCondition1760700000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove unitCost, totalAmount, and condition columns from goods_received_note_items
    await queryRunner.query(`
      ALTER TABLE "goods_received_note_items"
      DROP COLUMN IF EXISTS "unitCost",
      DROP COLUMN IF EXISTS "totalAmount",
      DROP COLUMN IF EXISTS "condition"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore the columns if migration is rolled back
    await queryRunner.query(`
      ALTER TABLE "goods_received_note_items"
      ADD COLUMN "unitCost" DECIMAL(15,4) DEFAULT 0 NOT NULL,
      ADD COLUMN "totalAmount" DECIMAL(15,4) DEFAULT 0 NOT NULL,
      ADD COLUMN "condition" VARCHAR(20) DEFAULT 'good' NOT NULL
    `);

    // Add back the comments
    await queryRunner.query(`
      COMMENT ON COLUMN "goods_received_note_items"."unitCost" IS 'Unit cost at time of receipt'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "goods_received_note_items"."totalAmount" IS 'Total amount for this line (receivedQuantity × unitCost)'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "goods_received_note_items"."condition" IS 'Item condition at receipt'
    `);
  }
}
