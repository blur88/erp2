import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveCategorySortOrder1763655506861 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop sortOrder column from categories table
    await queryRunner.query(`
      ALTER TABLE "categories"
      DROP COLUMN IF EXISTS "sortOrder"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore sortOrder column for rollback
    await queryRunner.query(`
      ALTER TABLE "categories"
      ADD COLUMN IF NOT EXISTS "sortOrder" integer DEFAULT 0 NOT NULL
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "categories"."sortOrder" IS 'Display order for sorting'
    `);
  }
}
