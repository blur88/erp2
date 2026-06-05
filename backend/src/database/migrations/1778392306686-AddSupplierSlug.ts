import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSupplierSlug1778392306686 implements MigrationInterface {
  name = "AddSupplierSlug1778392306686";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "suppliers" ADD "slug" character varying(255)`,
    );

    await queryRunner.query(`
  WITH base_slugs AS (
    SELECT
      id,
      CASE
        WHEN REGEXP_REPLACE(
               REGEXP_REPLACE(
                 REGEXP_REPLACE(LOWER("companyName"), '[^a-z0-9\\s-]', '', 'g'),
                 '[\\s-]+', '-', 'g'
               ),
               '^-+|-+$', '', 'g'
             ) = ''
        THEN 'entity'
        ELSE REGEXP_REPLACE(
               REGEXP_REPLACE(
                 REGEXP_REPLACE(LOWER("companyName"), '[^a-z0-9\\s-]', '', 'g'),
                 '[\\s-]+', '-', 'g'
               ),
               '^-+|-+$', '', 'g'
             )
      END AS base_slug
    FROM suppliers
  ),
  ranked AS (
    SELECT
      id,
      base_slug,
      ROW_NUMBER() OVER (PARTITION BY base_slug ORDER BY id) AS rn
    FROM base_slugs
  )
  UPDATE suppliers
  SET slug = CASE
    WHEN ranked.rn = 1 THEN ranked.base_slug
    ELSE ranked.base_slug || '-' || SUBSTRING(suppliers.id::text, 1, 8)
  END
  FROM ranked
  WHERE suppliers.id = ranked.id
`);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_suppliers_slug" ON "suppliers" ("slug")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_suppliers_slug"`);
    await queryRunner.query(`ALTER TABLE "suppliers" DROP COLUMN "slug"`);
  }
}
