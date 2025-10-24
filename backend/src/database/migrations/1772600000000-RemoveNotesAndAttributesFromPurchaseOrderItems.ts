import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveNotesAndAttributesFromPurchaseOrderItems1772600000000 implements MigrationInterface {
  name = 'RemoveNotesAndAttributesFromPurchaseOrderItems1772600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove unused fields from purchase_order_items table
    await queryRunner.query(`
      ALTER TABLE "purchase_order_items"
      DROP COLUMN IF EXISTS "notes",
      DROP COLUMN IF EXISTS "attributes"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add the fields for rollback
    await queryRunner.query(`
      ALTER TABLE "purchase_order_items"
      ADD COLUMN "notes" text NULL,
      ADD COLUMN "attributes" json NULL
    `);

    // Add comments
    await queryRunner.query(`
      COMMENT ON COLUMN "purchase_order_items"."notes" IS 'Special instructions for this item';
      COMMENT ON COLUMN "purchase_order_items"."attributes" IS 'Item-specific attributes or specifications';
    `);
  }
}