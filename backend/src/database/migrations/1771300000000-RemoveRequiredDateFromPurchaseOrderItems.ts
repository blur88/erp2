import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveRequiredDateFromPurchaseOrderItems1771300000000 implements MigrationInterface {
  name = 'RemoveRequiredDateFromPurchaseOrderItems1771300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove requiredDate column from purchase_order_items table
    await queryRunner.query(`ALTER TABLE "purchase_order_items" DROP COLUMN "requiredDate"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add requiredDate column if rollback is needed
    await queryRunner.query(`ALTER TABLE "purchase_order_items" ADD "requiredDate" date`);
  }
}