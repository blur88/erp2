import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Migration: Create Price List Tables
 *
 * This migration creates the normalized price list structure to replace
 * the JSONB-based pricing system (Product.pricingTiers, Customer.pricingScheme).
 *
 * Changes:
 * - Creates price_lists table (master pricing schemes)
 * - Creates price_list_items table (product-specific prices)
 * - Adds priceListId foreign key to customers table
 * - Adds indexes for performance
 * - Keeps old fields (pricingTiers, pricingScheme) for backward compatibility
 *
 * Note: This migration was auto-applied by TypeORM synchronize feature.
 * The migration file serves as documentation and for applying to other environments.
 */
export class CreatePriceListTables1768231502083 implements MigrationInterface {
  name = "CreatePriceListTables1768231502083";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create price_lists table
    await queryRunner.query(`
            CREATE TABLE "price_lists" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deletedAt" TIMESTAMP WITH TIME ZONE,
                "isActive" boolean NOT NULL DEFAULT true,
                "code" character varying(50) NOT NULL,
                "name" character varying(100) NOT NULL,
                "description" text,
                "isDefault" boolean NOT NULL DEFAULT false,
                "effectiveFrom" TIMESTAMP,
                "effectiveTo" TIMESTAMP,
                "priority" integer NOT NULL DEFAULT 0,
                CONSTRAINT "PK_price_lists" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_price_lists_code" UNIQUE ("code")
            )
        `);

    // Create indexes for price_lists
    await queryRunner.query(
      `CREATE INDEX "IDX_price_lists_code" ON "price_lists" ("code")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_price_lists_isActive" ON "price_lists" ("isActive")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_price_lists_isDefault" ON "price_lists" ("isDefault")`,
    );

    // Create price_list_items table
    await queryRunner.query(`
            CREATE TABLE "price_list_items" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deletedAt" TIMESTAMP WITH TIME ZONE,
                "isActive" boolean NOT NULL DEFAULT true,
                "priceListId" uuid NOT NULL,
                "productId" uuid NOT NULL,
                "price" numeric(12,4) NOT NULL,
                "costBasis" numeric(12,4),
                "marginPercent" numeric(5,2),
                "minimumPrice" numeric(12,4),
                "effectiveFrom" TIMESTAMP,
                "effectiveTo" TIMESTAMP,
                CONSTRAINT "PK_price_list_items" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_price_list_items_priceListId_productId" UNIQUE ("priceListId", "productId")
            )
        `);

    // Create indexes for price_list_items
    await queryRunner.query(
      `CREATE INDEX "IDX_price_list_items_priceListId" ON "price_list_items" ("priceListId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_price_list_items_productId" ON "price_list_items" ("productId")`,
    );

    // Add foreign keys for price_list_items
    await queryRunner.query(`
            ALTER TABLE "price_list_items"
            ADD CONSTRAINT "FK_price_list_items_priceListId"
            FOREIGN KEY ("priceListId") REFERENCES "price_lists"("id")
            ON DELETE CASCADE
        `);
    await queryRunner.query(`
            ALTER TABLE "price_list_items"
            ADD CONSTRAINT "FK_price_list_items_productId"
            FOREIGN KEY ("productId") REFERENCES "products"("id")
            ON DELETE CASCADE
        `);

    // Add priceListId column to customers table (nullable for backward compatibility)
    await queryRunner.query(`ALTER TABLE "customers" ADD "priceListId" uuid`);
    await queryRunner.query(
      `CREATE INDEX "IDX_customers_priceListId" ON "customers" ("priceListId")`,
    );
    await queryRunner.query(`
            ALTER TABLE "customers"
            ADD CONSTRAINT "FK_customers_priceListId"
            FOREIGN KEY ("priceListId") REFERENCES "price_lists"("id")
            ON DELETE SET NULL
        `);

    // Update comments on deprecated fields
    await queryRunner.query(`
            COMMENT ON COLUMN "products"."pricingTiers" IS
            'DEPRECATED: Dynamic pricing tiers from settings - { "Retail": 100.00, "Wholesale": 80.00, "VIP": 75.00 }. Use PriceListItem relationship instead.'
        `);
    await queryRunner.query(`
            COMMENT ON COLUMN "customers"."pricingScheme" IS
            'DEPRECATED: Default pricing scheme name for this customer. Use priceListId instead.'
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove foreign key from customers
    await queryRunner.query(
      `ALTER TABLE "customers" DROP CONSTRAINT "FK_customers_priceListId"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_customers_priceListId"`);
    await queryRunner.query(
      `ALTER TABLE "customers" DROP COLUMN "priceListId"`,
    );

    // Remove foreign keys from price_list_items
    await queryRunner.query(
      `ALTER TABLE "price_list_items" DROP CONSTRAINT "FK_price_list_items_productId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "price_list_items" DROP CONSTRAINT "FK_price_list_items_priceListId"`,
    );

    // Drop indexes for price_list_items
    await queryRunner.query(`DROP INDEX "IDX_price_list_items_productId"`);
    await queryRunner.query(`DROP INDEX "IDX_price_list_items_priceListId"`);

    // Drop price_list_items table
    await queryRunner.query(`DROP TABLE "price_list_items"`);

    // Drop indexes for price_lists
    await queryRunner.query(`DROP INDEX "IDX_price_lists_isDefault"`);
    await queryRunner.query(`DROP INDEX "IDX_price_lists_isActive"`);
    await queryRunner.query(`DROP INDEX "IDX_price_lists_code"`);

    // Drop price_lists table
    await queryRunner.query(`DROP TABLE "price_lists"`);

    // Remove comments on deprecated fields
    await queryRunner.query(
      `COMMENT ON COLUMN "products"."pricingTiers" IS 'Dynamic pricing tiers from settings - { "Retail": 100.00, "Wholesale": 80.00, "VIP": 75.00 }'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "customers"."pricingScheme" IS 'Default pricing scheme name for this customer'`,
    );
  }
}
