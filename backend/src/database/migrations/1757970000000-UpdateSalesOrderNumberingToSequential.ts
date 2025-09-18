import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateSalesOrderNumberingToSequential1757970000000 implements MigrationInterface {
    name = 'UpdateSalesOrderNumberingToSequential1757970000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Get all existing sales orders ordered by creation date
        const salesOrders = await queryRunner.query(`
            SELECT id, "orderNumber", "createdAt"
            FROM sales_orders
            ORDER BY "createdAt" ASC
        `);

        // Update each sales order with sequential numbering
        for (let i = 0; i < salesOrders.length; i++) {
            const newOrderNumber = `SO-${(i + 1).toString().padStart(6, '0')}`;
            await queryRunner.query(`
                UPDATE sales_orders
                SET "orderNumber" = $1
                WHERE id = $2
            `, [newOrderNumber, salesOrders[i].id]);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Cannot easily revert to the old format as it was timestamp-based
        // This migration is essentially irreversible for existing data
        console.log('Warning: Cannot revert sales order numbers to previous timestamp-based format');
    }
}