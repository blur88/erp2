import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Remove auditHash column from all tables
 * This feature was not being used and was adding unnecessary overhead
 */
export class RemoveAuditHashFromAllTables1760375561000 implements MigrationInterface {
  name = 'RemoveAuditHashFromAllTables1760375561000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop auditHash column from all tables that have it
    const tables = [
      'suppliers',
      'plugins',
      'customers',
      'payments',
      'invoices',
      'users',
      'sales_orders',
      'products',
      'categories',
      'purchase_orders',
      'purchase_order_items',
      'stock_movements',
      'sales_order_items',
      'goods_received_notes',
      'supplier_invoice_items',
      'supplier_invoices',
      'purchase_requisition_items',
      'purchase_requisitions'
    ];

    for (const table of tables) {
      try {
        await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "auditHash"`);
        console.log(`Dropped auditHash column from ${table}`);
      } catch (error) {
        // Column might not exist in some tables, continue with others
        console.log(`auditHash column not found in ${table} or already dropped`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add auditHash column to all tables if rollback is needed
    const tables = [
      'suppliers',
      'plugins',
      'customers',
      'payments',
      'invoices',
      'users',
      'sales_orders',
      'products',
      'categories',
      'purchase_orders',
      'purchase_order_items',
      'stock_movements',
      'sales_order_items',
      'goods_received_notes',
      'supplier_invoice_items',
      'supplier_invoices',
      'purchase_requisition_items',
      'purchase_requisitions'
    ];

    for (const table of tables) {
      try {
        await queryRunner.query(`
          ALTER TABLE "${table}"
          ADD COLUMN "auditHash" varchar(256) NULL
        `);
        console.log(`Added auditHash column back to ${table}`);
      } catch (error) {
        console.log(`Failed to add auditHash column back to ${table}: ${error.message}`);
      }
    }
  }
}