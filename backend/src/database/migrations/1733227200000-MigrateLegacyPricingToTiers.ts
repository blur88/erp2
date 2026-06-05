import { MigrationInterface, QueryRunner } from "typeorm";

export class MigrateLegacyPricingToTiers1733227200000 implements MigrationInterface {
  name = "MigrateLegacyPricingToTiers1733227200000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Ensure pricingTiers column exists (it should from previous migrations)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'products' AND column_name = 'pricingTiers'
        ) THEN
          ALTER TABLE "products" ADD COLUMN "pricingTiers" jsonb;
        END IF;
      END $$;
    `);

    // Step 2: Check if legacy columns exist before migrating
    const retailPriceExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'retailPrice'
      ) as exists
    `);

    // Only perform migration if legacy columns exist
    if (retailPriceExists[0].exists) {
      // Step 3: Migrate existing legacy pricing data to pricingTiers
      // Only migrate if pricingTiers is null or empty
      await queryRunner.query(`
        UPDATE "products"
        SET "pricingTiers" = jsonb_build_object(
          'Retail', COALESCE("retailPrice", 0),
          'Wholesale', COALESCE("wholesalePrice", 0),
          'Special', COALESCE("specialPrice", 0)
        )
        WHERE "pricingTiers" IS NULL
          AND ("retailPrice" IS NOT NULL OR "wholesalePrice" IS NOT NULL OR "specialPrice" IS NOT NULL);
      `);

      // Step 4: For products with empty pricingTiers but valid legacy prices, populate them
      await queryRunner.query(`
        UPDATE "products"
        SET "pricingTiers" = jsonb_build_object(
          'Retail', COALESCE("retailPrice", 0),
          'Wholesale', COALESCE("wholesalePrice", 0),
          'Special', COALESCE("specialPrice", 0)
        )
        WHERE "pricingTiers" = '{}'::jsonb
          AND ("retailPrice" IS NOT NULL OR "wholesalePrice" IS NOT NULL OR "specialPrice" IS NOT NULL);
      `);

      // Step 5: Remove legacy pricing columns
      await queryRunner.query(
        `ALTER TABLE "products" DROP COLUMN IF EXISTS "retailPrice"`,
      );
      await queryRunner.query(
        `ALTER TABLE "products" DROP COLUMN IF EXISTS "wholesalePrice"`,
      );
      await queryRunner.query(
        `ALTER TABLE "products" DROP COLUMN IF EXISTS "specialPrice"`,
      );
    } else {
      console.log("Legacy pricing columns do not exist, skipping migration");
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recreate legacy pricing columns
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "retailPrice" numeric(15,4)
    `);

    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "wholesalePrice" numeric(15,4)
    `);

    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "specialPrice" numeric(15,4)
    `);

    // Migrate data back from pricingTiers to legacy columns
    await queryRunner.query(`
      UPDATE "products"
      SET
        "retailPrice" = CAST(("pricingTiers"->>'Retail') AS numeric),
        "wholesalePrice" = CAST(("pricingTiers"->>'Wholesale') AS numeric),
        "specialPrice" = CAST(("pricingTiers"->>'Special') AS numeric)
      WHERE "pricingTiers" IS NOT NULL
    `);
  }
}
