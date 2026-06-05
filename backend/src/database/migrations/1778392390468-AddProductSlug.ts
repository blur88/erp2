import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProductSlug1778392390468 implements MigrationInterface {
  name = "AddProductSlug1778392390468";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "products" ADD "slug" character varying(255)`,
    );

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
    FROM products
  ),
  ranked AS (
    SELECT
      id,
      base_slug,
      ROW_NUMBER() OVER (PARTITION BY base_slug ORDER BY id) AS rn
    FROM base_slugs
  )
  UPDATE products
  SET slug = CASE
    WHEN ranked.rn = 1 THEN ranked.base_slug
    ELSE ranked.base_slug || '-' || SUBSTRING(products.id::text, 1, 8)
  END
  FROM ranked
  WHERE products.id = ranked.id
`);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_products_slug" ON "products" ("slug")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_products_slug"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "slug"`);
  }
}
