import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProductSlug1778392390468 implements MigrationInterface {
    name = 'AddProductSlug1778392390468'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "products" ADD "slug" character varying(255)`);
        await queryRunner.query(`
  UPDATE products
  SET slug = LOWER(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(name, '[^a-zA-Z0-9\\s-]', '', 'g'),
        '[\\s-]+', '-', 'g'
      ),
      '^-+|-+$', '', 'g'
    )
  ) || '-' || SUBSTRING(id::text, 1, 8)
  WHERE slug IS NULL
`);
        await queryRunner.query(`
  UPDATE products SET slug = 'entity-' || SUBSTRING(id::text, 1, 8)
  WHERE slug IS NULL OR slug = '' OR slug = '-'
`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_products_slug" ON "products" ("slug")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_products_slug"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "slug"`);
    }

}
