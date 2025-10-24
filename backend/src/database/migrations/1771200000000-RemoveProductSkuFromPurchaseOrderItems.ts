import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Remove productSku column from purchase_order_items
 *
 * This migration removes redundant product information field from purchase_order_items table:
 * - productSku: Product SKU captured at time of order (redundant - available via product relation)
 *
 * This field is no longer needed since we have a proper foreign key relationship
 * to the products table and can access current product information via the relation.
 * This aligns with the architectural pattern of removing redundant product fields.
 */
export class RemoveProductSkuFromPurchaseOrderItems1771200000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove productSku column from purchase_order_items
    await queryRunner.query(`
      ALTER TABLE "purchase_order_items"
      DROP COLUMN IF EXISTS "productSku"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore the column if migration is rolled back
    await queryRunner.query(`
      ALTER TABLE "purchase_order_items"
      ADD COLUMN "productSku" VARCHAR(50) NOT NULL DEFAULT ''
    `);

    // Add back the comment
    await queryRunner.query(`
      COMMENT ON COLUMN "purchase_order_items"."productSku" IS 'Product SKU at time of order'
    `);

    // Note: In a real rollback scenario, you might want to populate this column
    // with data from the products table, but that would require more complex logic
  }
}