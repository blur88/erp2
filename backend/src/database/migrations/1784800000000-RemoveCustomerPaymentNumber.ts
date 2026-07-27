import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveCustomerPaymentNumber1784800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the trigram index explicitly; dropping the column then cascades the
    // column-dependent UNIQUE constraint/index automatically.
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_payments_paymentnumber_trgm"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "paymentNumber"`);
    await queryRunner.query(
      `DELETE FROM "document_number_settings"
        WHERE "documentName" IN ('Payments', 'Goods Received')`,
    );

    // Backfill the five active types. createDefaultDocumentNumberSettings()
    // only runs when the settings table is *empty* (settings.service.ts:336,
    // :502), so a database seeded before Expenses/Journal Entries existed never
    // acquires those rows — and the page renders a row only when the API
    // returns a matching documentName. Without this, Accounting stays blank.
    const yy = new Date().getFullYear() % 100;
    await queryRunner.query(
      `INSERT INTO "document_number_settings"
        ("documentName", "prefix", "paddingDigits", "nextNumber", "lastResetYear")
       VALUES
         ('Sales Orders',     'SO',  3, 1, $1),
         ('Purchase Orders',  'PO',  3, 1, $1),
         ('Stock Adjustment', 'SA',  3, 1, $1),
         ('Expenses',         'EXP', 3, 1, $1)
       ON CONFLICT ("documentName") DO NOTHING`,
      [yy],
    );

    // Journal Entries must start past any already-issued number or the next
    // post collides with journal_entry.journalNo's UNIQUE constraint (#901).
    // Derive it from the table instead of seeding the literal 1. journal_entry
    // may not exist (accounting module absent), in which case 1 is correct.
    const jeNext = await queryRunner.query(
      `SELECT COALESCE(MAX((split_part("journalNo", '-', 3))::int), 0) + 1 AS next
         FROM journal_entry
        WHERE "journalNo" ~ ('^JE-' || $1 || '-[0-9]{1,9}$')`,
      [String(yy).padStart(2, '0')],
    ).catch((err: { code?: string }) => {
      if (err?.code === '42P01') return [{ next: 1 }]; // undefined_table
      throw err;
    });

    await queryRunner.query(
      `INSERT INTO "document_number_settings"
        ("documentName", "prefix", "paddingDigits", "nextNumber", "lastResetYear")
       VALUES ('Journal Entries', 'JE', 3, $1, $2)
       ON CONFLICT ("documentName") DO NOTHING`,
      [Number(jeNext[0]?.next ?? 1), yy],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Historical PAY-* values are not recoverable; the column returns nullable.
    await queryRunner.query(`ALTER TABLE "payments" ADD COLUMN "paymentNumber" varchar(50)`);
    await queryRunner.query(
      `ALTER TABLE "payments"
         ADD CONSTRAINT "UQ_payments_paymentNumber" UNIQUE ("paymentNumber")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_payments_paymentnumber_trgm
       ON payments USING gin ("paymentNumber" gin_trgm_ops)`,
    );
    const yy = new Date().getFullYear() % 100;
    await queryRunner.query(
      `INSERT INTO "document_number_settings"
        ("documentName", "prefix", "paddingDigits", "nextNumber", "lastResetYear")
       VALUES ('Payments', 'PAY', 3, 1, $1), ('Goods Received', 'GRN', 3, 1, $1)
       ON CONFLICT ("documentName") DO NOTHING`,
      [yy],
    );
  }
}
