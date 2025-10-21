import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShippingAmountToSalesOrders1762100000000 implements MigrationInterface {
  name = 'AddShippingAmountToSalesOrders1762100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales_orders"
      ADD COLUMN IF NOT EXISTS "shippingAmount" NUMERIC(15,4) NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "sales_orders"."shippingAmount" IS 'Shipping/freight charges'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales_orders"
      DROP COLUMN "shippingAmount"
    `);
  }
}
