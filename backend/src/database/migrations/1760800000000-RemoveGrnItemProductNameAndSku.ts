import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Remove productName and productSku columns from goods_received_note_items
 *
 * This migration removes redundant product information fields from GRN items table:
 * - productName: Product name captured at time of receipt (redundant - available via product relation)
 * - productSku: Product SKU captured at time of receipt (redundant - available via product relation)
 *
 * These fields are no longer needed since we have a proper foreign key relationship
 * to the products table and can access current product information via the relation.
 */
export class RemoveGrnItemProductNameAndSku1760800000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove productName and productSku columns from goods_received_note_items
    await queryRunner.query(`
      ALTER TABLE "goods_received_note_items"
      DROP COLUMN IF EXISTS "productName",
      DROP COLUMN IF EXISTS "productSku"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore the columns if migration is rolled back
    await queryRunner.query(`
      ALTER TABLE "goods_received_note_items"
      ADD COLUMN "productName" VARCHAR(200) NOT NULL DEFAULT '',
      ADD COLUMN "productSku" VARCHAR(50) NOT NULL DEFAULT ''
    `);

    // Add back the comments
    await queryRunner.query(`
      COMMENT ON COLUMN "goods_received_note_items"."productName" IS 'Product name at time of receipt'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "goods_received_note_items"."productSku" IS 'Product SKU at time of receipt'
    `);

    // Note: In a real rollback scenario, you might want to populate these columns
    // with data from the products table, but that would require more complex logic
  }
}