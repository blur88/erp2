import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveDeletedByFromAllTables1759800000000 implements MigrationInterface {
    name = 'RemoveDeletedByFromAllTables1759800000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Drop deletedBy column from all tables that have it
        const tables = [
            'categories',
            'products',
            'customers',
            'suppliers',
            'users',
            'sales_orders',
            'purchase_orders',
            'invoices',
            'payments',
            'stock_movements',
            'sales_order_items',
            'purchase_order_items',
            'goods_received_notes',
            'supplier_invoices',
            'supplier_invoice_items',
            'purchase_requisitions',
            'purchase_requisition_items',
            'plugins'
        ];

        for (const table of tables) {
            try {
                await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "deletedBy"`);
                console.log(`Dropped deletedBy column from ${table}`);
            } catch (error) {
                // Column might not exist, continue with other tables
                console.log(`Column deletedBy does not exist in ${table} or error occurred:`, error.message);
            }
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Restore deletedBy column to all tables
        const tables = [
            'categories',
            'products',
            'customers',
            'suppliers',
            'users',
            'sales_orders',
            'purchase_orders',
            'invoices',
            'payments',
            'stock_movements',
            'sales_order_items',
            'purchase_order_items',
            'goods_received_notes',
            'supplier_invoices',
            'supplier_invoice_items',
            'purchase_requisitions',
            'purchase_requisition_items',
            'plugins'
        ];

        for (const table of tables) {
            try {
                await queryRunner.query(`ALTER TABLE "${table}" ADD "deletedBy" uuid`);
                await queryRunner.query(`COMMENT ON COLUMN "${table}"."deletedBy" IS 'User who deleted this record'`);
                console.log(`Added deletedBy column to ${table}`);
            } catch (error) {
                // Column might already exist, continue with other tables
                console.log(`Column deletedBy already exists in ${table} or error occurred:`, error.message);
            }
        }
    }
}