import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPgTrgmAndTrigramIndexes1785500000000 implements MigrationInterface {
  name = 'AddPgTrgmAndTrigramIndexes1785500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pg_trgm"`);

    await queryRunner.query(
      `CREATE INDEX "idx_products_name_trgm" ON "products" USING GIN ("name" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_products_barcode_trgm" ON "products" USING GIN ("barcode" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_customers_name_trgm" ON "customers" USING GIN ("name" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_customers_phone_trgm" ON "customers" USING GIN ("phone" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_suppliers_companyname_trgm" ON "suppliers" USING GIN ("companyName" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sales_orders_ordernumber_trgm" ON "sales_orders" USING GIN ("orderNumber" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_purchase_orders_ordernumber_trgm" ON "purchase_orders" USING GIN ("orderNumber" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_vendor_payments_referencenumber_trgm" ON "vendor_payments" USING GIN ("referenceNumber" gin_trgm_ops)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Indexes only, in reverse order. pg_trgm is deliberately NOT dropped:
    // `up` uses CREATE EXTENSION IF NOT EXISTS and therefore cannot know whether
    // it created the extension. Dropping a pre-existing database-level extension
    // would destroy state this migration never owned. The genesis migration
    // likewise leaves uuid-ossp installed on rollback.
    await queryRunner.query(`DROP INDEX "idx_vendor_payments_referencenumber_trgm"`);
    await queryRunner.query(`DROP INDEX "idx_purchase_orders_ordernumber_trgm"`);
    await queryRunner.query(`DROP INDEX "idx_sales_orders_ordernumber_trgm"`);
    await queryRunner.query(`DROP INDEX "idx_suppliers_companyname_trgm"`);
    await queryRunner.query(`DROP INDEX "idx_customers_phone_trgm"`);
    await queryRunner.query(`DROP INDEX "idx_customers_name_trgm"`);
    await queryRunner.query(`DROP INDEX "idx_products_barcode_trgm"`);
    await queryRunner.query(`DROP INDEX "idx_products_name_trgm"`);
  }
}
