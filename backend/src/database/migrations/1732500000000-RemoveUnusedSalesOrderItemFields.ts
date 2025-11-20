import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveUnusedSalesOrderItemFields1732500000000 implements MigrationInterface {
    name = 'RemoveUnusedSalesOrderItemFields1732500000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Drop index on status column before removing it
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sales_order_items_status"`);

        // Remove unused columns from sales_order_items table
        await queryRunner.query(`ALTER TABLE "sales_order_items" DROP COLUMN IF EXISTS "status"`);
        await queryRunner.query(`ALTER TABLE "sales_order_items" DROP COLUMN IF EXISTS "productName"`);
        await queryRunner.query(`ALTER TABLE "sales_order_items" DROP COLUMN IF EXISTS "unit"`);
        await queryRunner.query(`ALTER TABLE "sales_order_items" DROP COLUMN IF EXISTS "shippedQuantity"`);
        await queryRunner.query(`ALTER TABLE "sales_order_items" DROP COLUMN IF EXISTS "deliveredQuantity"`);
        await queryRunner.query(`ALTER TABLE "sales_order_items" DROP COLUMN IF EXISTS "attributes"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Restore columns (with defaults where necessary)
        await queryRunner.query(`ALTER TABLE "sales_order_items" ADD "attributes" json`);
        await queryRunner.query(`ALTER TABLE "sales_order_items" ADD "deliveredQuantity" numeric(15,4) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "sales_order_items" ADD "shippedQuantity" numeric(15,4) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "sales_order_items" ADD "unit" character varying(20) NOT NULL DEFAULT 'pcs'`);
        await queryRunner.query(`ALTER TABLE "sales_order_items" ADD "productName" character varying(200) NOT NULL DEFAULT ''`);
        await queryRunner.query(`ALTER TABLE "sales_order_items" ADD "status" character varying NOT NULL DEFAULT 'pending'`);

        // Restore index on status column
        await queryRunner.query(`CREATE INDEX "IDX_sales_order_items_status" ON "sales_order_items" ("status")`);
    }
}
