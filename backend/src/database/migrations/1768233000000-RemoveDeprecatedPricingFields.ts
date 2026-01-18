import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Remove deprecated pricing fields after Phase 8 cleanup
 *
 * This migration removes the following deprecated fields:
 * 1. products.pricingTiers (JSONB) - replaced by price_list_items table
 * 2. customers.pricingScheme (varchar) - replaced by customers.priceListId foreign key
 * 3. price_costing_settings.customerPricingSchemes (JSONB) - replaced by price_lists table
 *
 * These fields were kept during the transition period (30 days) for backward compatibility.
 * Now that the new price list system is stable, we can safely remove them.
 *
 * @date 2026-01-13
 * @phase Phase 8 - Post-Migration Cleanup
 */
export class RemoveDeprecatedPricingFields1768233000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop pricingTiers column from products table
    await queryRunner.query(`
      ALTER TABLE products
      DROP COLUMN IF EXISTS "pricingTiers";
    `);

    // 2. Drop pricingScheme column from customers table
    await queryRunner.query(`
      ALTER TABLE customers
      DROP COLUMN IF EXISTS "pricingScheme";
    `);

    // 3. Drop the index on pricingScheme if it exists
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_customers_pricingScheme";
    `);

    // 4. Drop customerPricingSchemes column from price_costing_settings table
    await queryRunner.query(`
      ALTER TABLE price_costing_settings
      DROP COLUMN IF EXISTS "customerPricingSchemes";
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rollback: Restore the deprecated columns
    // NOTE: Data will NOT be restored - this is just to restore the schema structure

    // 1. Restore pricingTiers column to products table
    await queryRunner.query(`
      ALTER TABLE products
      ADD COLUMN "pricingTiers" jsonb DEFAULT '{}';
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN products."pricingTiers" IS 'DEPRECATED: Dynamic pricing tiers - { "Retail": 100.00, "Wholesale": 80.00 }. Use price_list_items instead.';
    `);

    // 2. Restore pricingScheme column to customers table
    await queryRunner.query(`
      ALTER TABLE customers
      ADD COLUMN "pricingScheme" varchar(100) DEFAULT 'Retail';
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN customers."pricingScheme" IS 'DEPRECATED: Default pricing scheme name. Use priceListId instead.';
    `);

    // 3. Restore index on pricingScheme
    await queryRunner.query(`
      CREATE INDEX "IDX_customers_pricingScheme" ON customers ("pricingScheme");
    `);

    // 4. Restore customerPricingSchemes column to price_costing_settings table
    await queryRunner.query(`
      ALTER TABLE price_costing_settings
      ADD COLUMN "customerPricingSchemes" jsonb;
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN price_costing_settings."customerPricingSchemes" IS 'DEPRECATED: Pricing scheme configuration. Use price_lists table instead.';
    `);
  }
}
