import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCustomerSlug1778392222605 implements MigrationInterface {
    name = 'AddCustomerSlug1778392222605'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "customers" ADD "slug" character varying(255)`);
        await queryRunner.query(`
  UPDATE customers
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
  UPDATE customers SET slug = 'entity-' || SUBSTRING(id::text, 1, 8)
  WHERE slug IS NULL OR slug = '' OR slug = '-'
`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_customers_slug" ON "customers" ("slug")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_customers_slug"`);
        await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "slug"`);
    }

}
