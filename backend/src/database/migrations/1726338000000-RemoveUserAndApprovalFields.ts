import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveUserAndApprovalFields1726338000000 implements MigrationInterface {
  name = 'RemoveUserAndApprovalFields1726338000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove approval-related columns from stock_adjustments table
    await queryRunner.query(`
      ALTER TABLE "stock_adjustments" 
      DROP COLUMN IF EXISTS "approvedDate"
    `);
    
    await queryRunner.query(`
      ALTER TABLE "stock_adjustments" 
      DROP COLUMN IF EXISTS "approvalNotes"
    `);
    
    // Remove user-related columns
    await queryRunner.query(`
      ALTER TABLE "stock_adjustments" 
      DROP COLUMN IF EXISTS "adjustedBy"
    `);
    
    await queryRunner.query(`
      ALTER TABLE "stock_adjustments" 
      DROP COLUMN IF EXISTS "approvedBy"
    `);

    // Update status enum to remove approval statuses
    await queryRunner.query(`
      ALTER TABLE "stock_adjustments" 
      ALTER COLUMN "status" TYPE VARCHAR(50)
    `);

    // Create new enum type
    await queryRunner.query(`
      CREATE TYPE "stock_adjustment_status_enum_new" AS ENUM('draft', 'completed', 'cancelled')
    `);

    // Update the column to use new enum
    await queryRunner.query(`
      ALTER TABLE "stock_adjustments" 
      ALTER COLUMN "status" TYPE "stock_adjustment_status_enum_new" 
      USING "status"::text::"stock_adjustment_status_enum_new"
    `);

    // Drop old enum
    await queryRunner.query(`
      DROP TYPE IF EXISTS "stock_adjustment_status_enum"
    `);

    // Rename new enum
    await queryRunner.query(`
      ALTER TYPE "stock_adjustment_status_enum_new" RENAME TO "stock_adjustment_status_enum"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore user-related columns
    await queryRunner.query(`
      ALTER TABLE "stock_adjustments" 
      ADD "adjustedBy" character varying(100) NOT NULL DEFAULT 'system'
    `);
    
    await queryRunner.query(`
      ALTER TABLE "stock_adjustments" 
      ADD "approvedBy" character varying(100)
    `);

    // Restore approval-related columns
    await queryRunner.query(`
      ALTER TABLE "stock_adjustments" 
      ADD "approvedDate" date
    `);
    
    await queryRunner.query(`
      ALTER TABLE "stock_adjustments" 
      ADD "approvalNotes" text
    `);

    // Restore original enum with approval statuses
    await queryRunner.query(`
      CREATE TYPE "stock_adjustment_status_enum_old" AS ENUM(
        'draft', 'pending_approval', 'approved', 'completed', 'cancelled', 'rejected'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "stock_adjustments" 
      ALTER COLUMN "status" TYPE "stock_adjustment_status_enum_old" 
      USING "status"::text::"stock_adjustment_status_enum_old"
    `);

    await queryRunner.query(`
      DROP TYPE "stock_adjustment_status_enum"
    `);

    await queryRunner.query(`
      ALTER TYPE "stock_adjustment_status_enum_old" RENAME TO "stock_adjustment_status_enum"
    `);

    // Add comments
    await queryRunner.query(`
      COMMENT ON COLUMN "stock_adjustments"."adjustedBy" IS 'User who initiated the adjustment'
    `);
    
    await queryRunner.query(`
      COMMENT ON COLUMN "stock_adjustments"."approvedBy" IS 'User who approved the adjustment'
    `);
  }
}