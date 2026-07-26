import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateExpenses1784700000000 implements MigrationInterface {
  name = 'CreateExpenses1784700000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "journal_entry_sourcetype_enum" ADD VALUE IF NOT EXISTS 'EXPENSE'`);
    await q.query(`ALTER TYPE "journal_entry_postingtype_enum" ADD VALUE IF NOT EXISTS 'EXPENSE_PAYMENT'`);
    await q.query(`ALTER TYPE "journal_entry_postingtype_enum" ADD VALUE IF NOT EXISTS 'EXPENSE_REFUND'`);

    await q.query(`CREATE TYPE "expenses_documentstatus_enum" AS ENUM ('DRAFT','CANCELLED')`);
    await q.query(`CREATE TYPE "expenses_paymentstatus_enum" AS ENUM ('UNPAID','PARTIAL','PAID')`);

    await q.query(`
      CREATE TABLE "expenses" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "expenseNumber" varchar(30) NOT NULL,
        "expenseDate" date NOT NULL,
        "payee" varchar(200),
        "description" varchar(500) NOT NULL,
        "expenseAccountId" uuid NOT NULL REFERENCES "chart_of_account"("id") ON DELETE RESTRICT,
        "totalAmount" numeric(18,4) NOT NULL,
        "paidAmount" numeric(18,4) NOT NULL DEFAULT 0,
        "balance" numeric(18,4) NOT NULL,
        "documentStatus" "expenses_documentstatus_enum" NOT NULL DEFAULT 'DRAFT',
        "paymentStatus" "expenses_paymentstatus_enum" NOT NULL DEFAULT 'UNPAID',
        "notes" text,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        CONSTRAINT "UQ_expenses_number" UNIQUE ("expenseNumber"),
        CONSTRAINT "CHK_expenses_total_positive" CHECK ("totalAmount" > 0)
      )
    `);
    await q.query(`CREATE INDEX "IDX_expenses_date" ON "expenses" ("expenseDate")`);
    await q.query(`CREATE INDEX "IDX_expenses_account" ON "expenses" ("expenseAccountId")`);
    await q.query(`CREATE INDEX "IDX_expenses_docstatus" ON "expenses" ("documentStatus")`);
    await q.query(`CREATE INDEX "IDX_expenses_paystatus" ON "expenses" ("paymentStatus")`);

    await q.query(`
      CREATE TABLE "expense_payments" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "expenseId" uuid NOT NULL REFERENCES "expenses"("id") ON DELETE CASCADE,
        "paymentMethodId" uuid NOT NULL REFERENCES "payment_methods"("id") ON DELETE RESTRICT,
        "paymentDate" date NOT NULL,
        "amount" numeric(18,4) NOT NULL,
        "reference" varchar(100),
        "sourcePaymentId" uuid REFERENCES "expense_payments"("id"),
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        CONSTRAINT "CHK_expense_payments_nonzero" CHECK ("amount" <> 0),
        CONSTRAINT "CHK_expense_payments_polarity" CHECK (
          ("sourcePaymentId" IS NULL AND "amount" > 0) OR
          ("sourcePaymentId" IS NOT NULL AND "amount" < 0)
        )
      )
    `);
    await q.query(`CREATE INDEX "IDX_expense_payments_expense" ON "expense_payments" ("expenseId")`);
    await q.query(`CREATE INDEX "IDX_expense_payments_date" ON "expense_payments" ("paymentDate")`);
    await q.query(`CREATE INDEX "IDX_expense_payments_source" ON "expense_payments" ("sourcePaymentId")`);

    await q.query(`
      CREATE UNIQUE INDEX "UQ_journal_entry_source_event"
      ON "journal_entry" ("sourceType", "sourceEventId", "postingType")
      WHERE "sourceEventId" IS NOT NULL AND "reversalOfEntryId" IS NULL
    `);

    const yy = new Date().getFullYear() % 100;
    await q.query(
      `INSERT INTO "document_number_settings" ("documentName", "prefix", "paddingDigits", "nextNumber", "lastResetYear")
       SELECT 'Expenses', 'EXP', 3, 1, $1
       WHERE NOT EXISTS (SELECT 1 FROM "document_number_settings" WHERE "documentName" = 'Expenses')`,
      [yy],
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "UQ_journal_entry_source_event"`);
    await q.query(`DROP TABLE IF EXISTS "expense_payments"`);
    await q.query(`DROP TABLE IF EXISTS "expenses"`);
    await q.query(`DROP TYPE IF EXISTS "expenses_paymentstatus_enum"`);
    await q.query(`DROP TYPE IF EXISTS "expenses_documentstatus_enum"`);
  }
}
