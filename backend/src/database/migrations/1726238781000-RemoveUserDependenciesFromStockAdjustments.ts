import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveUserDependenciesFromStockAdjustments1726238781000 implements MigrationInterface {
  name = 'RemoveUserDependenciesFromStockAdjustments1726238781000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key constraints first
    await queryRunner.query(`
      ALTER TABLE "stock_adjustments" 
      DROP CONSTRAINT "FK_f5f92322b940284e9309af2bfb4"
    `);
    
    await queryRunner.query(`
      ALTER TABLE "stock_adjustments" 
      DROP CONSTRAINT "FK_396bcf9ab0b743d82952b76eb77"
    `);

    // Drop the existing UUID columns
    await queryRunner.query(`
      ALTER TABLE "stock_adjustments" 
      DROP COLUMN "adjustedByUserId"
    `);
    
    await queryRunner.query(`
      ALTER TABLE "stock_adjustments" 
      DROP COLUMN "approvedByUserId"
    `);

    // Add new string columns
    await queryRunner.query(`
      ALTER TABLE "stock_adjustments" 
      ADD "adjustedBy" character varying(100) NOT NULL DEFAULT 'system'
    `);
    
    await queryRunner.query(`
      ALTER TABLE "stock_adjustments" 
      ADD "approvedBy" character varying(100)
    `);

    // Add comments
    await queryRunner.query(`
      COMMENT ON COLUMN "stock_adjustments"."adjustedBy" IS 'User who initiated the adjustment'
    `);
    
    await queryRunner.query(`
      COMMENT ON COLUMN "stock_adjustments"."approvedBy" IS 'User who approved the adjustment'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the new string columns
    await queryRunner.query(`
      ALTER TABLE "stock_adjustments" 
      DROP COLUMN "approvedBy"
    `);
    
    await queryRunner.query(`
      ALTER TABLE "stock_adjustments" 
      DROP COLUMN "adjustedBy"
    `);

    // Add back the UUID columns
    await queryRunner.query(`
      ALTER TABLE "stock_adjustments" 
      ADD "adjustedByUserId" uuid NOT NULL
    `);
    
    await queryRunner.query(`
      ALTER TABLE "stock_adjustments" 
      ADD "approvedByUserId" uuid
    `);

    // Re-add foreign key constraints
    await queryRunner.query(`
      ALTER TABLE "stock_adjustments" 
      ADD CONSTRAINT "FK_f5f92322b940284e9309af2bfb4" 
      FOREIGN KEY ("adjustedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT
    `);
    
    await queryRunner.query(`
      ALTER TABLE "stock_adjustments" 
      ADD CONSTRAINT "FK_396bcf9ab0b743d82952b76eb77" 
      FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL
    `);
  }
}