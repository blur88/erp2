import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveOrderSummaryFields1756954892909 implements MigrationInterface {
    name = 'RemoveOrderSummaryFields1756954892909'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Remove subtotal, discount, tax, and shipping related fields from sales_orders table
        await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "subtotal"`);
        await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "discount_percent"`);
        await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "discount_amount"`);
        await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "tax_percent"`);
        await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "tax_amount"`);
        await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "shipping_amount"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Add back the removed fields in case we need to rollback
        await queryRunner.query(`ALTER TABLE "sales_orders" ADD "subtotal" NUMERIC(15,4) DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "sales_orders" ADD "discount_percent" NUMERIC(5,2) DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "sales_orders" ADD "discount_amount" NUMERIC(15,4) DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "sales_orders" ADD "tax_percent" NUMERIC(5,2) DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "sales_orders" ADD "tax_amount" NUMERIC(15,4) DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "sales_orders" ADD "shipping_amount" NUMERIC(15,4) DEFAULT '0'`);
    }
}