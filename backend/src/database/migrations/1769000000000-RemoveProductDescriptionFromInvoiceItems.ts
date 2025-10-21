import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveProductDescriptionFromAllItemTables1769000000000 implements MigrationInterface {
  name = 'RemoveProductDescriptionFromAllItemTables1769000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoice_items"
      DROP COLUMN IF EXISTS "productDescription"
    `);

    await queryRunner.query(`
      ALTER TABLE "sales_order_items"
      DROP COLUMN IF EXISTS "productDescription"
    `);

    await queryRunner.query(`
      ALTER TABLE "purchase_order_items"
      DROP COLUMN IF EXISTS "productDescription"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoice_items"
      ADD COLUMN "productDescription" text
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "invoice_items"."productDescription" IS 'Product description at time of invoice'
    `);

    await queryRunner.query(`
      ALTER TABLE "sales_order_items"
      ADD COLUMN "productDescription" text
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "sales_order_items"."productDescription" IS 'Product description at time of order'
    `);

    await queryRunner.query(`
      ALTER TABLE "purchase_order_items"
      ADD COLUMN "productDescription" text
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "purchase_order_items"."productDescription" IS 'Product description at time of order'
    `);
  }
}