import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Guarantees the database holds AT MOST ONE default price list (#968).
 *
 * The application layer (PriceListDefaultService + PriceListsSeederService)
 * guarantees AT LEAST ONE ACTIVE default. Together: exactly one.
 *
 * Soft-deleted rows are deliberately outside the index. A soft-deleted row may
 * still carry isDefault = true; it sits outside the governed set until restored.
 */
export class AddSingleDefaultPriceListConstraint1785600000000
  implements MigrationInterface
{
  name = 'AddSingleDefaultPriceListConstraint1785600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: demote pre-existing duplicates. The index below cannot be created
    // against a table that already violates it. Survivor is chosen
    // deterministically: active before inactive, then oldest createdAt, then
    // lowest id as a stable tie-breaker.
    //
    // If no ACTIVE default exists, the oldest inactive one is retained
    // temporarily; PriceListsSeederService establishes an active default on the
    // next boot through its normal reconciliation path.
    await queryRunner.query(`
      UPDATE "price_lists"
      SET "isDefault" = false
      WHERE "isDefault" = true
        AND "deletedAt" IS NULL
        AND "id" <> (
          SELECT "id" FROM "price_lists"
          WHERE "isDefault" = true AND "deletedAt" IS NULL
          ORDER BY "isActive" DESC, "createdAt" ASC, "id" ASC
          LIMIT 1
        )
    `);

    // Step 2: enforce it from here on.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_price_lists_single_default"
        ON "price_lists" ("isDefault")
        WHERE "isDefault" = true AND "deletedAt" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Only the index is reversible. The demotions in `up` are a one-time repair
    // of state that predates the invariant; the rows that were demoted are not
    // recorded anywhere, and re-promoting them would recreate the duplicates
    // this migration exists to remove.
    await queryRunner.query(`DROP INDEX "UQ_price_lists_single_default"`);
  }
}
