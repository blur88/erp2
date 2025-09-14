import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissingBaseEntityColumnsToStockAdjustments1726293800000 implements MigrationInterface {
  name = 'AddMissingBaseEntityColumnsToStockAdjustments1726293800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add missing BaseEntity columns to stock_adjustments table
    await queryRunner.query(`
      ALTER TABLE "stock_adjustments" 
      ADD COLUMN IF NOT EXISTS "deletedBy" uuid NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "stock_adjustments" 
      ADD COLUMN IF NOT EXISTS "isActive" boolean NOT NULL DEFAULT true
    `);

    await queryRunner.query(`
      ALTER TABLE "stock_adjustments" 
      ADD COLUMN IF NOT EXISTS "auditHash" varchar(256) NULL
    `);

    // Add comment for new columns
    await queryRunner.query(`
      COMMENT ON COLUMN "stock_adjustments"."deletedBy" IS 'User who deleted this record'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "stock_adjustments"."isActive" IS 'Soft delete flag for performance queries'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "stock_adjustments"."auditHash" IS 'SHA-256 hash for audit trail integrity'
    `);

    // Set existing records to active
    await queryRunner.query(`
      UPDATE "stock_adjustments" 
      SET "isActive" = true 
      WHERE "isActive" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove added columns
    await queryRunner.query(`ALTER TABLE "stock_adjustments" DROP COLUMN IF EXISTS "auditHash"`);
    await queryRunner.query(`ALTER TABLE "stock_adjustments" DROP COLUMN IF EXISTS "isActive"`);
    await queryRunner.query(`ALTER TABLE "stock_adjustments" DROP COLUMN IF EXISTS "deletedBy"`);
  }
}