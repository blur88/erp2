import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveAdjustedByUserIdFromStockAdjustments1732302000000 implements MigrationInterface {
  name = "RemoveAdjustedByUserIdFromStockAdjustments1732302000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the index on adjustedByUserId before dropping the column
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_stock_adjustments_adjustedByUserId"`,
    );

    // Drop the foreign key constraint first
    await queryRunner.query(
      `ALTER TABLE "stock_adjustments" DROP CONSTRAINT IF EXISTS "FK_stock_adjustments_adjustedByUserId"`,
    );

    // Remove the adjustedByUserId column from stock_adjustments table
    await queryRunner.query(
      `ALTER TABLE "stock_adjustments" DROP COLUMN IF EXISTS "adjustedByUserId"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Add the column back
    await queryRunner.query(
      `ALTER TABLE "stock_adjustments" ADD "adjustedByUserId" uuid`,
    );

    // Recreate the foreign key constraint
    await queryRunner.query(
      `ALTER TABLE "stock_adjustments" ADD CONSTRAINT "FK_stock_adjustments_adjustedByUserId" FOREIGN KEY ("adjustedByUserId") REFERENCES "users"("id") ON DELETE SET NULL`,
    );

    // Recreate the index
    await queryRunner.query(
      `CREATE INDEX "IDX_stock_adjustments_adjustedByUserId" ON "stock_adjustments" ("adjustedByUserId")`,
    );
  }
}
