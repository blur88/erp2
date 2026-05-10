import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSupplierSlug1778392306686 implements MigrationInterface {
    name = 'AddSupplierSlug1778392306686'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "suppliers" ADD "slug" character varying(255)`);
        await queryRunner.query(`
  UPDATE suppliers
  SET slug = LOWER(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE("companyName", '[^a-zA-Z0-9\\s-]', '', 'g'),
        '[\\s-]+', '-', 'g'
      ),
      '^-+|-+$', '', 'g'
    )
  ) || '-' || SUBSTRING(id::text, 1, 8)
  WHERE slug IS NULL
`);
        await queryRunner.query(`
  UPDATE suppliers SET slug = 'entity-' || SUBSTRING(id::text, 1, 8)
  WHERE slug IS NULL OR slug = '' OR slug = '-'
`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_suppliers_slug" ON "suppliers" ("slug")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_suppliers_slug"`);
        await queryRunner.query(`ALTER TABLE "suppliers" DROP COLUMN "slug"`);
    }

}
