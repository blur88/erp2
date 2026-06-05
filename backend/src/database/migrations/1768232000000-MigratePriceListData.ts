import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Migration: Migrate Price List Data
 *
 * This migration migrates existing pricing data from JSONB fields to normalized tables:
 * 1. Creates PriceList records from customerPricingSchemes settings
 * 2. Creates PriceListItem records from Product.pricingTiers JSONB
 * 3. Links Customers to appropriate PriceLists
 *
 * Dependencies:
 * - Requires CreatePriceListTables1768231502083 to have been run first
 *
 * Rollback Strategy:
 * - Restores data to JSONB fields from normalized tables
 * - Safe to rollback within 30 days of migration
 */
export class MigratePriceListData1768232000000 implements MigrationInterface {
  name = "MigratePriceListData1768232000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log("Starting Price List Data Migration...");

    // Step 1: Migrate pricing schemes from settings to price_lists table
    console.log("Step 1: Migrating pricing schemes from settings...");

    // Get existing pricing schemes from price_costing_settings
    const settingsResult = await queryRunner.query(`
            SELECT "customerPricingSchemes"
            FROM "price_costing_settings"
            WHERE "isActive" = true
            LIMIT 1
        `);

    let pricingSchemes: Array<{ name: string; currency: string }> = [];

    if (settingsResult.length > 0 && settingsResult[0].customerPricingSchemes) {
      pricingSchemes = settingsResult[0].customerPricingSchemes;
    } else {
      // Use default schemes if none exist
      console.log("No pricing schemes found in settings, using defaults");
      pricingSchemes = [
        { name: "Retail", currency: "USD" },
        { name: "Wholesale", currency: "USD" },
        { name: "Special", currency: "USD" },
      ];
    }

    console.log(`Found ${pricingSchemes.length} pricing schemes to migrate`);

    // Create price lists from schemes
    const priceListMap: Map<string, string> = new Map(); // Map scheme name to price list ID

    for (let i = 0; i < pricingSchemes.length; i++) {
      const scheme = pricingSchemes[i];
      const code = scheme.name.toUpperCase().replace(/\s+/g, "_");
      const isDefault = i === 0; // First scheme is default

      // Check if price list already exists
      const existingPriceList = await queryRunner.query(
        `
                SELECT "id" FROM "price_lists"
                WHERE "code" = $1
                LIMIT 1
            `,
        [code],
      );

      let priceListId: string;

      if (existingPriceList.length > 0) {
        priceListId = existingPriceList[0].id;
        console.log(`Price list already exists: ${scheme.name} (${code})`);
      } else {
        const result = await queryRunner.query(
          `
                    INSERT INTO "price_lists" (
                        "code",
                        "name",
                        "description",
                        "isDefault",
                        "isActive",
                        "priority"
                    )
                    VALUES ($1, $2, $3, $4, $5, $6)
                    RETURNING "id"
                `,
          [
            code,
            scheme.name,
            `Migrated from legacy pricing scheme: ${scheme.name}`,
            isDefault,
            true,
            i,
          ],
        );
        priceListId = result[0].id;
        console.log(
          `Created price list: ${scheme.name} (${code}) - ID: ${priceListId}`,
        );
      }

      priceListMap.set(scheme.name, priceListId);
    }

    // Step 2: Migrate product pricing tiers to price_list_items
    console.log("Step 2: Migrating product pricing tiers...");

    // Get all products with non-null pricingTiers
    const products = await queryRunner.query(`
            SELECT "id", "pricingTiers", "baseCost"
            FROM "products"
            WHERE "pricingTiers" IS NOT NULL
            AND "deletedAt" IS NULL
        `);

    console.log(
      `Found ${products.length} products with pricing tiers to migrate`,
    );

    let itemsCreated = 0;
    let itemsSkipped = 0;

    for (const product of products) {
      if (!product.pricingTiers || typeof product.pricingTiers !== "object") {
        console.log(
          `Skipping product ${product.id}: invalid pricingTiers format`,
        );
        itemsSkipped++;
        continue;
      }

      // Iterate through each price tier
      for (const [schemeName, price] of Object.entries(product.pricingTiers)) {
        const priceListId = priceListMap.get(schemeName);

        if (!priceListId) {
          console.log(
            `Warning: No price list found for scheme "${schemeName}", skipping`,
          );
          continue;
        }

        const priceValue = parseFloat(price as string);

        if (isNaN(priceValue) || priceValue < 0) {
          console.log(
            `Skipping invalid price for product ${product.id}, scheme ${schemeName}: ${price}`,
          );
          continue;
        }

        // Check if item already exists
        const existingItem = await queryRunner.query(
          `
                    SELECT "id" FROM "price_list_items"
                    WHERE "priceListId" = $1
                    AND "productId" = $2
                    LIMIT 1
                `,
          [priceListId, product.id],
        );

        if (existingItem.length > 0) {
          console.log(
            `Price list item already exists for product ${product.id}, scheme ${schemeName}`,
          );
          itemsSkipped++;
          continue;
        }

        // Calculate margin if baseCost exists
        let marginPercent = null;
        const baseCost = product.baseCost ? parseFloat(product.baseCost) : null;

        if (baseCost && baseCost > 0) {
          marginPercent = ((priceValue - baseCost) / baseCost) * 100;
        }

        // Create price list item
        await queryRunner.query(
          `
                    INSERT INTO "price_list_items" (
                        "priceListId",
                        "productId",
                        "price",
                        "costBasis",
                        "marginPercent",
                        "isActive"
                    )
                    VALUES ($1, $2, $3, $4, $5, $6)
                `,
          [priceListId, product.id, priceValue, baseCost, marginPercent, true],
        );

        itemsCreated++;
      }
    }

    console.log(
      `Created ${itemsCreated} price list items, skipped ${itemsSkipped}`,
    );

    // Step 3: Migrate customer pricing scheme assignments
    console.log("Step 3: Migrating customer pricing scheme assignments...");

    // Get all customers with pricingScheme set
    const customers = await queryRunner.query(`
            SELECT "id", "pricingScheme"
            FROM "customers"
            WHERE "pricingScheme" IS NOT NULL
            AND "pricingScheme" != ''
            AND "deletedAt" IS NULL
        `);

    console.log(
      `Found ${customers.length} customers with pricing schemes to migrate`,
    );

    let customersUpdated = 0;
    let customersSkipped = 0;

    for (const customer of customers) {
      const priceListId = priceListMap.get(customer.pricingScheme);

      if (!priceListId) {
        console.log(
          `Warning: No price list found for customer ${customer.id} scheme "${customer.pricingScheme}"`,
        );
        customersSkipped++;
        continue;
      }

      // Update customer with priceListId
      await queryRunner.query(
        `
                UPDATE "customers"
                SET "priceListId" = $1
                WHERE "id" = $2
            `,
        [priceListId, customer.id],
      );

      customersUpdated++;
    }

    console.log(
      `Updated ${customersUpdated} customers, skipped ${customersSkipped}`,
    );

    // Step 4: Validation summary
    console.log("Step 4: Generating validation summary...");

    const priceListCount = await queryRunner.query(
      `SELECT COUNT(*) as count FROM "price_lists" WHERE "isActive" = true`,
    );
    const priceListItemCount = await queryRunner.query(
      `SELECT COUNT(*) as count FROM "price_list_items" WHERE "isActive" = true`,
    );
    const customersWithPriceList = await queryRunner.query(
      `SELECT COUNT(*) as count FROM "customers" WHERE "priceListId" IS NOT NULL AND "deletedAt" IS NULL`,
    );

    console.log("\n=== Migration Summary ===");
    console.log(`Price Lists Created: ${priceListCount[0].count}`);
    console.log(`Price List Items Created: ${priceListItemCount[0].count}`);
    console.log(`Customers Linked: ${customersWithPriceList[0].count}`);
    console.log("=========================\n");

    console.log("Price List Data Migration completed successfully!");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log("Starting Price List Data Migration Rollback...");

    // This rollback restores data to JSONB fields from normalized tables
    // WARNING: This should only be used if the migration needs to be undone
    // Any new data created after migration will be lost

    // Step 1: Restore customer pricingScheme from priceListId
    console.log("Step 1: Restoring customer pricing schemes...");

    const customersWithPriceList = await queryRunner.query(`
            SELECT c."id", c."priceListId", pl."name"
            FROM "customers" c
            LEFT JOIN "price_lists" pl ON c."priceListId" = pl."id"
            WHERE c."priceListId" IS NOT NULL
            AND c."deletedAt" IS NULL
        `);

    for (const customer of customersWithPriceList) {
      if (customer.name) {
        await queryRunner.query(
          `
                    UPDATE "customers"
                    SET "pricingScheme" = $1
                    WHERE "id" = $2
                `,
          [customer.name, customer.id],
        );
      }
    }

    console.log(
      `Restored pricing schemes for ${customersWithPriceList.length} customers`,
    );

    // Step 2: Restore product pricingTiers from price_list_items
    console.log("Step 2: Restoring product pricing tiers...");

    const priceListItems = await queryRunner.query(`
            SELECT pli."productId", pl."name" as "schemeName", pli."price"
            FROM "price_list_items" pli
            JOIN "price_lists" pl ON pli."priceListId" = pl."id"
            WHERE pli."isActive" = true
            ORDER BY pli."productId", pl."priority"
        `);

    // Group by product
    const productPricing: Map<string, any> = new Map();

    for (const item of priceListItems) {
      if (!productPricing.has(item.productId)) {
        productPricing.set(item.productId, {});
      }

      const pricingTiers = productPricing.get(item.productId);
      pricingTiers[item.schemeName] = parseFloat(item.price);
    }

    // Update products with restored pricingTiers
    for (const [productId, pricingTiers] of productPricing.entries()) {
      await queryRunner.query(
        `
                UPDATE "products"
                SET "pricingTiers" = $1
                WHERE "id" = $2
            `,
        [JSON.stringify(pricingTiers), productId],
      );
    }

    console.log(`Restored pricing tiers for ${productPricing.size} products`);

    // Step 3: Clear normalized tables (will be dropped by previous migration)
    console.log("Step 3: Clearing price list data...");

    await queryRunner.query(`DELETE FROM "price_list_items"`);
    await queryRunner.query(`DELETE FROM "price_lists"`);

    // Clear customer priceListId references
    await queryRunner.query(`UPDATE "customers" SET "priceListId" = NULL`);

    console.log("Price List Data Migration Rollback completed successfully!");
  }
}
