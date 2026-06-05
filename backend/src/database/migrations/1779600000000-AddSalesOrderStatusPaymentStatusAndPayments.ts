import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSalesOrderStatusPaymentStatusAndPayments1779600000000
  implements MigrationInterface
{
  name = 'AddSalesOrderStatusPaymentStatusAndPayments1779600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales_orders"
      ADD COLUMN IF NOT EXISTS "status" varchar(20)
    `);

    await queryRunner.query(`
      ALTER TABLE "sales_orders"
      ADD COLUMN IF NOT EXISTS "paymentStatus" varchar(20)
    `);

    await queryRunner.query(`
      ALTER TABLE "sales_orders"
      ADD COLUMN IF NOT EXISTS "subtotal" decimal(15,4) NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      UPDATE "sales_orders"
      SET "status" = CASE WHEN "isFulfilled" = true THEN 'FULFILLED' ELSE 'DRAFT' END
    `);

    await queryRunner.query(`
      UPDATE "sales_orders"
      SET "paymentStatus" = CASE
        WHEN "paidAmount" = 0 THEN 'UNPAID'
        WHEN "paidAmount" > 0 AND "paidAmount" < "totalAmount" THEN 'PARTIAL'
        WHEN "paidAmount" = "totalAmount" THEN 'PAID'
        WHEN "paidAmount" > "totalAmount" THEN 'OVERPAID'
        ELSE 'UNPAID'
      END
    `);

    await queryRunner.query(`
      UPDATE "sales_orders"
      SET "subtotal" = GREATEST(0, "totalAmount" - COALESCE("shippingAmount", 0))
    `);

    await queryRunner.query(`ALTER TABLE "sales_orders" ALTER COLUMN "status" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "sales_orders" ALTER COLUMN "paymentStatus" SET NOT NULL`);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_sales_orders_status" ON "sales_orders" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_sales_orders_paymentStatus" ON "sales_orders" ("paymentStatus")`,
    );

    await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "isFulfilled"`);
    await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "fulfilledDate"`);
    await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "paidAmount"`);

    await queryRunner.query(`
      CREATE TABLE "sales_order_payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "salesOrderId" uuid NOT NULL,
        "paymentMethodId" uuid NOT NULL,
        "referenceNumber" varchar(100),
        "amount" decimal(15,4) NOT NULL,
        "paymentDate" date NOT NULL,
        "notes" text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sales_order_payments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sop_salesOrder" FOREIGN KEY ("salesOrderId")
          REFERENCES "sales_orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_sop_paymentMethod" FOREIGN KEY ("paymentMethodId")
          REFERENCES "payment_methods"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_sop_salesOrderId" ON "sales_order_payments" ("salesOrderId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_sop_paymentDate" ON "sales_order_payments" ("paymentDate")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "sales_order_payments"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sales_orders_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sales_orders_paymentStatus"`);
    await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "status"`);
    await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "paymentStatus"`);
    await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "subtotal"`);
    await queryRunner.query(
      `ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "isFulfilled" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "fulfilledDate" timestamptz`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "paidAmount" decimal(15,4) NOT NULL DEFAULT 0`,
    );
  }
}
