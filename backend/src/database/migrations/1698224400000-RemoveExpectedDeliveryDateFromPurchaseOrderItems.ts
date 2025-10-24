import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveExpectedDeliveryDateFromPurchaseOrderItems1698224400000 implements MigrationInterface {
  name = 'RemoveExpectedDeliveryDateFromPurchaseOrderItems1698224400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Column already removed manually - marking migration as complete
    // The expectedDeliveryDate column has been removed from purchase_order_items table
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add the expectedDeliveryDate column if rollback is needed
    await queryRunner.query(`ALTER TABLE "purchase_order_items" ADD "expectedDeliveryDate" date NULL`);
  }
}