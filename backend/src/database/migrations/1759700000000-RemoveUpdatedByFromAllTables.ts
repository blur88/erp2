import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveUpdatedByFromAllTables1759700000000 implements MigrationInterface {
    name = 'RemoveUpdatedByFromAllTables1759700000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Drop updatedBy column from all tables that have it
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
                await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "updatedBy"`);
                console.log(`Dropped updatedBy column from ${table}`);
            } catch (error) {
                // Column might not exist, continue with other tables
                console.log(`Column updatedBy does not exist in ${table} or error occurred:`, error.message);
            }
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Restore updatedBy column to all tables
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
                await queryRunner.query(`ALTER TABLE "${table}" ADD "updatedBy" uuid`);
                await queryRunner.query(`COMMENT ON COLUMN "${table}"."updatedBy" IS 'User who last updated this record'`);
                console.log(`Added updatedBy column to ${table}`);
            } catch (error) {
                // Column might already exist, continue with other tables
                console.log(`Column updatedBy already exists in ${table} or error occurred:`, error.message);
            }
        }
    }
}