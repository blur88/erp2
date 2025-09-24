import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPaymentTrackingToSalesOrder1703847200000 implements MigrationInterface {
    name = 'AddPaymentTrackingToSalesOrder1703847200000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "sales_orders"
            ADD COLUMN "paidAmount" DECIMAL(15,4) NOT NULL DEFAULT 0,
            ADD COLUMN "isFulfilled" BOOLEAN NOT NULL DEFAULT false
        `);

        await queryRunner.query(`
            COMMENT ON COLUMN "sales_orders"."paidAmount" IS 'Amount received from customer'
        `);

        await queryRunner.query(`
            COMMENT ON COLUMN "sales_orders"."isFulfilled" IS 'Whether order is fulfilled (inventory deducted)'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "sales_orders"
            DROP COLUMN "paidAmount",
            DROP COLUMN "isFulfilled"
        `);
    }
}