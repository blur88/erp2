import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCustomerSlug1778392222605 implements MigrationInterface {
    name = 'AddCustomerSlug1778392222605'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "customers" ADD "slug" character varying(255)`);

        // Compute base slug per row, then assign clean slug to first occurrence of each base,
        // UUID-suffixed slug to duplicates — matching the application-level generateUniqueSlug behaviour.
        await queryRunner.query(`
  WITH base_slugs AS (
    SELECT
      id,
      CASE
        WHEN REGEXP_REPLACE(
               REGEXP_REPLACE(
                 REGEXP_REPLACE(LOWER(name), '[^a-z0-9\\s-]', '', 'g'),
                 '[\\s-]+', '-', 'g'
               ),
               '^-+|-+$', '', 'g'
             ) = ''
        THEN 'entity'
        ELSE REGEXP_REPLACE(
               REGEXP_REPLACE(
                 REGEXP_REPLACE(LOWER(name), '[^a-z0-9\\s-]', '', 'g'),
                 '[\\s-]+', '-', 'g'
               ),
               '^-+|-+$', '', 'g'
             )
      END AS base_slug
    FROM customers
  ),
  ranked AS (
    SELECT
      id,
      base_slug,
      ROW_NUMBER() OVER (PARTITION BY base_slug ORDER BY id) AS rn
    FROM base_slugs
  )
  UPDATE customers
  SET slug = CASE
    WHEN ranked.rn = 1 THEN ranked.base_slug
    ELSE ranked.base_slug || '-' || SUBSTRING(customers.id::text, 1, 8)
  END
  FROM ranked
  WHERE customers.id = ranked.id
`);

        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_customers_slug" ON "customers" ("slug")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_customers_slug"`);
        await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "slug"`);
    }

}
