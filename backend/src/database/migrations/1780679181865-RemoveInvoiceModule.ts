import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveInvoiceModule1780679181865 implements MigrationInterface {
  name = 'RemoveInvoiceModule1780679181865';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Backfill payment.salesOrderId from invoice link.
    await queryRunner.query(`
      UPDATE "payments" p
      SET "salesOrderId" = i."salesOrderId"
      FROM "invoices" i
      WHERE p."invoiceId" = i."id" AND p."salesOrderId" IS NULL
    `);

    // 2. Guard: no payment with an invoice may be left without a salesOrder.
    const orphans: Array<{ count: string }> = await queryRunner.query(`
      SELECT COUNT(*)::text AS count FROM "payments"
      WHERE "invoiceId" IS NOT NULL AND "salesOrderId" IS NULL
    `);
    if (parseInt(orphans[0].count, 10) > 0) {
      throw new Error(
        `RemoveInvoiceModule: ${orphans[0].count} payment(s) have invoiceId but no resolvable salesOrderId -- aborting.`,
      );
    }

    // 3. Backfill sales_order.fulfilledAt for already-fulfilled orders.
    await queryRunner.query(`
      UPDATE "sales_orders" so
      SET "fulfilledAt" = COALESCE(
        (SELECT i."invoiceDate" FROM "invoices" i WHERE i."salesOrderId" = so."id" ORDER BY i."invoiceDate" ASC LIMIT 1),
        so."updatedAt"
      )
      WHERE so."status" = 'FULFILLED' AND so."fulfilledAt" IS NULL
    `);

    // 4. Drop payment.invoiceId (FK constraint name resolved dynamically).
    await queryRunner.query(`
      DO $$
      DECLARE fk_name text;
      BEGIN
        SELECT con.conname INTO fk_name
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
        WHERE rel.relname = 'payments' AND att.attname = 'invoiceId' AND con.contype = 'f'
        LIMIT 1;
        IF fk_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE "payments" DROP CONSTRAINT %I', fk_name);
        END IF;
      END $$;
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payments_invoiceId"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "invoiceId"`);

    // 5. Drop invoice tables (child first).
    await queryRunner.query(`DROP TABLE IF EXISTS "invoice_items" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "invoices" CASCADE`);
  }

  public async down(): Promise<void> {
    throw new Error(
      'RemoveInvoiceModule is not reversible: invoice/invoice_item tables and payment->invoice links were dropped.',
    );
  }
}
