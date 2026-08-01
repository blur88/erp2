import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enforces the case-insensitive name/barcode uniqueness the application already
 * implements, at the database layer (#984).
 *
 * ProductService checks uniqueness with LOWER(...) comparisons outside any lock
 * or transaction, so two concurrent creates could both pass and both insert.
 *
 * Scope decision: NO `deletedAt IS NULL` predicate. The application checks run
 * `.withDeleted()`, so a soft-deleted product already blocks reuse of its name
 * and barcode (with a distinct "previously deleted" message). A partial index
 * would let a race insert a name a soft-deleted row holds, silently changing
 * product policy beyond the race fix.
 *
 * The pre-existing case-sensitive barcode uniqueness existed in TWO forms —
 * index IDX_adfc522baf9d9b19cd7d9461b7 and table constraint
 * UQ_adfc522baf9d9b19cd7d9461b7e. Both are dropped; lower(barcode) subsumes both.
 */
export class AddProductCaseInsensitiveUniqueIndexes1785800000000
  implements MigrationInterface
{
  name = 'AddProductCaseInsensitiveUniqueIndexes1785800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: pre-flight audit, BEFORE any DDL, using the exact normalization
    // expressions the constraints will use. Across ALL rows including
    // soft-deleted, because the indexes are unfiltered.
    //
    // Deliberately NOT auto-repaired: a migration must not silently rename or
    // delete product data. Fail with actionable detail instead of letting
    // PostgreSQL emit a bare duplicate-key error.
    const nameDupes = await queryRunner.query(`
      SELECT lower("name") AS value, count(*)::int AS count, array_agg("id") AS ids
      FROM "products"
      GROUP BY lower("name")
      HAVING count(*) > 1
    `);

    const barcodeDupes = await queryRunner.query(`
      SELECT lower("barcode") AS value, count(*)::int AS count, array_agg("id") AS ids
      FROM "products"
      WHERE "barcode" IS NOT NULL
      GROUP BY lower("barcode")
      HAVING count(*) > 1
    `);

    if (nameDupes.length > 0 || barcodeDupes.length > 0) {
      const describe = (label: string, rows: any[]) =>
        rows
          .map(
            (r) =>
              `  ${label} "${r.value}" is held by ${r.count} rows: ${r.ids.join(', ')}`,
          )
          .join('\n');

      throw new Error(
        'Cannot enforce case-insensitive product uniqueness: existing rows already violate it.\n' +
          [describe('name', nameDupes), describe('barcode', barcodeDupes)]
            .filter(Boolean)
            .join('\n') +
          '\n\nRemediation: for each group, keep one row and either rename the ' +
          'others (UPDATE products SET name = ... WHERE id = ...) or hard-delete ' +
          'them if they are redundant soft-deleted records ' +
          '(DELETE FROM products WHERE id = ...). Soft-deleted rows count: they ' +
          'reserve their name and barcode by design. Re-run the migration afterwards.',
      );
    }

    // Step 2: drop BOTH pre-existing case-sensitive barcode declarations.
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_adfc522baf9d9b19cd7d9461b7"`);
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "UQ_adfc522baf9d9b19cd7d9461b7e"`,
    );

    // Step 3: enforce case-insensitive uniqueness from here on.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_products_lower_name" ON "products" (lower("name"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_products_lower_barcode" ON "products" (lower("barcode")) WHERE "barcode" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_products_lower_barcode"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_products_lower_name"`);

    // Restore both original barcode declarations.
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "UQ_adfc522baf9d9b19cd7d9461b7e" UNIQUE ("barcode")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_adfc522baf9d9b19cd7d9461b7" ON "products" ("barcode")`,
    );
  }
}
