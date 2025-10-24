import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Remove productName column from purchase_order_items
 *
 * This migration removes redundant product information field from purchase order items table:
 * - productName: Product name captured at time of order (redundant - available via product relation)
 *
 * This field is no longer needed since we have a proper foreign key relationship
 * to the products table and can access current product information via the relation.
 */
export class RemoveProductNameFromPurchaseOrderItems1765000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove productName column from purchase_order_items
    await queryRunner.query(`
      ALTER TABLE "purchase_order_items"
      DROP COLUMN IF EXISTS "productName"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore the column if migration is rolled back
    await queryRunner.query(`
      ALTER TABLE "purchase_order_items"
      ADD COLUMN "productName" VARCHAR(200) NOT NULL DEFAULT ''
    `);

    // Add back the comment
    await queryRunner.query(`
      COMMENT ON COLUMN "purchase_order_items"."productName" IS 'Product name at time of order'
    `);

    // Note: In a real rollback scenario, you might want to populate this column
    // with data from the products table, but that would require more complex logic
  }
}