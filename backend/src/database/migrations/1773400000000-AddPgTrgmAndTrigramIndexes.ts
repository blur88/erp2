import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPgTrgmAndTrigramIndexes1773400000000
  implements MigrationInterface
{
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_products_name_trgm
       ON products USING gin (name gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_products_barcode_trgm
       ON products USING gin (barcode gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_customers_name_trgm
       ON customers USING gin (name gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_customers_phone_trgm
       ON customers USING gin (phone gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_sales_orders_ordernumber_trgm
       ON sales_orders USING gin ("orderNumber" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_purchase_orders_ordernumber_trgm
       ON purchase_orders USING gin ("orderNumber" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_suppliers_companyname_trgm
       ON suppliers USING gin ("companyName" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_invoices_invoicenumber_trgm
       ON invoices USING gin ("invoiceNumber" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_payments_paymentnumber_trgm
       ON payments USING gin ("paymentNumber" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_vendor_payments_paymentnumber_trgm
       ON vendor_payments USING gin ("paymentNumber" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_vendor_payments_referencenumber_trgm
       ON vendor_payments USING gin ("referenceNumber" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_journal_entries_referencenumber_trgm
       ON journal_entries USING gin ("referenceNumber" gin_trgm_ops)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_products_name_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_products_barcode_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_customers_name_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_customers_phone_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sales_orders_ordernumber_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_purchase_orders_ordernumber_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_suppliers_companyname_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_invoices_invoicenumber_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_payments_paymentnumber_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_vendor_payments_paymentnumber_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_vendor_payments_referencenumber_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_journal_entries_referencenumber_trgm`);
  }
}
