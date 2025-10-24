import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveDeliveredDateFromPurchaseOrderItems1772400000001 implements MigrationInterface {
  name = 'RemoveDeliveredDateFromPurchaseOrderItems1772400000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the deliveredDate column from purchase_order_items table
    await queryRunner.query(`ALTER TABLE "purchase_order_items" DROP COLUMN "deliveredDate"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add the deliveredDate column if rollback is needed
    await queryRunner.query(`ALTER TABLE "purchase_order_items" ADD "deliveredDate" date NULL`);
  }
}