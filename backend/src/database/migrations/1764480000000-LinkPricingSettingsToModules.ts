import { MigrationInterface, QueryRunner } from "typeorm";

export class LinkPricingSettingsToModules1764480000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add pricingTiers JSONB column to products table
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN "pricingTiers" jsonb`,
    );

    await queryRunner.query(
      `COMMENT ON COLUMN "products"."pricingTiers" IS 'Dynamic pricing tiers from settings - { "Retail": 100.00, "Wholesale": 80.00, "VIP": 75.00 }'`,
    );

    // 2. Update product pricing column comments to mark as deprecated
    await queryRunner.query(
      `COMMENT ON COLUMN "products"."retailPrice" IS 'Retail selling price (deprecated - use pricingTiers)'`,
    );

    await queryRunner.query(
      `COMMENT ON COLUMN "products"."wholesalePrice" IS 'Wholesale selling price (deprecated - use pricingTiers)'`,
    );

    await queryRunner.query(
      `COMMENT ON COLUMN "products"."specialPrice" IS 'Special/promotional selling price (deprecated - use pricingTiers)'`,
    );

    // 3. Add pricingScheme column to customers table
    await queryRunner.query(
      `ALTER TABLE "customers" ADD COLUMN "pricingScheme" varchar(100) DEFAULT 'Retail'`,
    );

    await queryRunner.query(
      `COMMENT ON COLUMN "customers"."pricingScheme" IS 'Default pricing scheme name for this customer'`,
    );

    // 4. Migrate existing customer priceLevel data to pricingScheme
    await queryRunner.query(`
      UPDATE "customers"
      SET "pricingScheme" = CASE
        WHEN "priceLevel" = 'retail' THEN 'Retail'
        WHEN "priceLevel" = 'wholesale' THEN 'Wholesale'
        WHEN "priceLevel" = 'special' THEN 'Special'
        ELSE 'Retail'
      END
    `);

    // 5. Drop old priceLevel column and its index
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_customers_priceLevel"`);

    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "priceLevel"`);

    // 6. Create index on new pricingScheme column
    await queryRunner.query(
      `CREATE INDEX "IDX_customers_pricingScheme" ON "customers" ("pricingScheme")`,
    );

    // 7. Add currency column to sales_orders table
    await queryRunner.query(
      `ALTER TABLE "sales_orders" ADD COLUMN "currency" varchar(10) DEFAULT 'USD'`,
    );

    await queryRunner.query(
      `COMMENT ON COLUMN "sales_orders"."currency" IS 'Transaction currency'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse order of operations

    // 1. Remove currency from sales_orders
    await queryRunner.query(
      `ALTER TABLE "sales_orders" DROP COLUMN "currency"`,
    );

    // 2. Drop pricingScheme index
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_customers_pricingScheme"`,
    );

    // 3. Re-add priceLevel column
    await queryRunner.query(`
      ALTER TABLE "customers" ADD COLUMN "priceLevel" varchar(20) DEFAULT 'retail'
    `);

    // 4. Migrate pricingScheme back to priceLevel
    await queryRunner.query(`
      UPDATE "customers"
      SET "priceLevel" = CASE
        WHEN LOWER("pricingScheme") = 'retail' THEN 'retail'
        WHEN LOWER("pricingScheme") = 'wholesale' THEN 'wholesale'
        WHEN LOWER("pricingScheme") = 'special' THEN 'special'
        ELSE 'retail'
      END
    `);

    // 5. Remove pricingScheme column
    await queryRunner.query(
      `ALTER TABLE "customers" DROP COLUMN "pricingScheme"`,
    );

    // 6. Recreate priceLevel index
    await queryRunner.query(
      `CREATE INDEX "IDX_customers_priceLevel" ON "customers" ("priceLevel")`,
    );

    // 7. Revert product pricing column comments
    await queryRunner.query(
      `COMMENT ON COLUMN "products"."retailPrice" IS 'Retail selling price'`,
    );

    await queryRunner.query(
      `COMMENT ON COLUMN "products"."wholesalePrice" IS 'Wholesale selling price'`,
    );

    await queryRunner.query(
      `COMMENT ON COLUMN "products"."specialPrice" IS 'Special/promotional selling price'`,
    );

    // 8. Remove pricingTiers column from products
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN "pricingTiers"`,
    );
  }
}
