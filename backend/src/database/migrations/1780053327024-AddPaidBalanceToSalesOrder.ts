import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPaidBalanceToSalesOrder1780053327024 implements MigrationInterface {
  name = "AddPaidBalanceToSalesOrder1780053327024";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales_orders"
      ADD COLUMN IF NOT EXISTS "paidAmount" decimal(15,4) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "sales_orders"
      ADD COLUMN IF NOT EXISTS "balanceDue" decimal(15,4) NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      UPDATE "sales_orders" o SET
        "paidAmount" = COALESCE(
          (SELECT SUM(p."amount") FROM "sales_order_payments" p WHERE p."salesOrderId" = o."id"), 0),
        "balanceDue" = o."totalAmount" - COALESCE(
          (SELECT SUM(p."amount") FROM "sales_order_payments" p WHERE p."salesOrderId" = o."id"), 0)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "balanceDue"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "paidAmount"`,
    );
  }
}
