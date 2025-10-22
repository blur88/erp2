import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveIncludeShippingInCostFromProducts1745129700000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove includeShippingInCost column from products table
    await queryRunner.query(`
      ALTER TABLE products
      DROP COLUMN IF EXISTS "includeShippingInCost"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Add includeShippingInCost column back to products table
    await queryRunner.query(`
      ALTER TABLE products
      ADD COLUMN "includeShippingInCost" BOOLEAN DEFAULT true
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN products."includeShippingInCost" IS 'Whether to include shipping in base cost calculation'
    `);
  }
}