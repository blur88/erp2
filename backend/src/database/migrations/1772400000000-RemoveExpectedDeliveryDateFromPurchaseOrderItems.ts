import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveExpectedDeliveryDateFromPurchaseOrderItems1772400000000 implements MigrationInterface {
  name = 'RemoveExpectedDeliveryDateFromPurchaseOrderItems1772400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the expectedDeliveryDate column from purchase_order_items table
    await queryRunner.query(`ALTER TABLE "purchase_order_items" DROP COLUMN "expectedDeliveryDate"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add the expectedDeliveryDate column if rollback is needed
    await queryRunner.query(`ALTER TABLE "purchase_order_items" ADD "expectedDeliveryDate" date NULL`);
  }
}