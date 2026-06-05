import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveReferenceNumberFromStockMovements1732650000000 implements MigrationInterface {
  name = 'RemoveReferenceNumberFromStockMovements1732650000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the referenceNumber column from stock_movements table
    await queryRunner.query(`ALTER TABLE "stock_movements" DROP COLUMN IF EXISTS "referenceNumber"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add the referenceNumber column
    await queryRunner.query(`
      ALTER TABLE "stock_movements"
      ADD COLUMN "referenceNumber" varchar(100)
    `);
  }
}
