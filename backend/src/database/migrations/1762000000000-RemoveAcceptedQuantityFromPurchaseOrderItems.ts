import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveAcceptedQuantityFromPurchaseOrderItems1762000000000 implements MigrationInterface {
  name = 'RemoveAcceptedQuantityFromPurchaseOrderItems1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "purchase_order_items"
      DROP COLUMN "acceptedQuantity"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "purchase_order_items"
      ADD COLUMN "acceptedQuantity" decimal(15,4) NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "purchase_order_items"."acceptedQuantity"
      IS 'Quantity accepted (passed quality check)'
    `);
  }
}