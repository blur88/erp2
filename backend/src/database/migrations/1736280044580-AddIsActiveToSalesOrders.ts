import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIsActiveToSalesOrders1736280044580 implements MigrationInterface {
    name = 'AddIsActiveToSalesOrders1736280044580'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add isActive column to sales_orders table to match BaseEntity structure
        await queryRunner.query(`ALTER TABLE "sales_orders" ADD "isActive" boolean NOT NULL DEFAULT true`);
        
        // Create index for performance
        await queryRunner.query(`CREATE INDEX "IDX_sales_orders_isActive" ON "sales_orders" ("isActive")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remove the index and column
        await queryRunner.query(`DROP INDEX "IDX_sales_orders_isActive"`);
        await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN "isActive"`);
    }
}