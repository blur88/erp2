import { MigrationInterface, QueryRunner } from "typeorm";

export class AccountingEntities1770109818000 implements MigrationInterface {
  name = "AccountingEntities1770109818000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Safety check: Verify no existing journal entries to prevent data loss
    const jeCount = await queryRunner.query(
      `SELECT COUNT(*) as count FROM journal_entries`,
    );
    if (jeCount[0].count > 0) {
      throw new Error(
        "Cannot run migration: journal_entries table contains data. Manual migration required.",
      );
    }

    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_payments_paymentMethodId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" DROP CONSTRAINT "FK_41891020be5293d0fd305c52574"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" DROP CONSTRAINT "FK_c38a2267c628a599f96918eb413"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entry_lines" DROP CONSTRAINT "FK_34d5d6a407b7724da2e2766b15e"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_payments_paymentMethodId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4b3b30432878ce7cc7882e919b"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5e7b3e25b716f194c94ab29e5a"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_aed83d24e3c81f085fa6bf0f9f"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a60ea60964189a5a56f07dc8dc"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d8a220c5fede561df32d0fe082"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."fiscal_periods_status_enum" AS ENUM('OPEN', 'CLOSED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "fiscal_periods" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "code" character varying(50) NOT NULL, "name" character varying(255) NOT NULL, "startDate" date NOT NULL, "endDate" date NOT NULL, "status" "public"."fiscal_periods_status_enum" NOT NULL DEFAULT 'OPEN', CONSTRAINT "UQ_073ccfb53e60976af707e0e141a" UNIQUE ("code"), CONSTRAINT "PK_9bb1e4e84a0d820b943e116888d" PRIMARY KEY ("id")); COMMENT ON COLUMN "fiscal_periods"."isActive" IS 'Soft delete flag for performance queries'; COMMENT ON COLUMN "fiscal_periods"."code" IS 'Unique period code (e.g., "2026-01", "Q1-2026")'; COMMENT ON COLUMN "fiscal_periods"."name" IS 'Period name (e.g., "January 2026")'; COMMENT ON COLUMN "fiscal_periods"."startDate" IS 'Period start date'; COMMENT ON COLUMN "fiscal_periods"."endDate" IS 'Period end date'; COMMENT ON COLUMN "fiscal_periods"."status" IS 'Period status (OPEN or CLOSED)'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_acf265b0e823b68f8dbdd0f137" ON "fiscal_periods" ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_14aa5e6aff66df3b6cc72763f4" ON "fiscal_periods" ("endDate") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_192d3370278bf36540741a5d98" ON "fiscal_periods" ("startDate") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_073ccfb53e60976af707e0e141" ON "fiscal_periods" ("code") `,
    );
    await queryRunner.query(
      `CREATE TABLE "account_mappings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "mappingKey" character varying(100) NOT NULL, "accountId" uuid NOT NULL, "description" text NOT NULL, CONSTRAINT "UQ_8d7d4d92229f957c449da63dad4" UNIQUE ("mappingKey"), CONSTRAINT "PK_564623d7f786d686e3b834f047a" PRIMARY KEY ("id")); COMMENT ON COLUMN "account_mappings"."isActive" IS 'Soft delete flag for performance queries'; COMMENT ON COLUMN "account_mappings"."mappingKey" IS 'Unique mapping key (e.g., "SALES_REVENUE", "ACCOUNTS_RECEIVABLE")'; COMMENT ON COLUMN "account_mappings"."accountId" IS 'Chart of account ID to post to'; COMMENT ON COLUMN "account_mappings"."description" IS 'Description of what this mapping is for'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7f4f8d0f398d70cd8a6485f586" ON "account_mappings" ("accountId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_8d7d4d92229f957c449da63dad" ON "account_mappings" ("mappingKey") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."chart_of_accounts_type_enum" AS ENUM('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "chart_of_accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "code" character varying(50) NOT NULL, "name" character varying(255) NOT NULL, "type" "public"."chart_of_accounts_type_enum" NOT NULL, "parentId" uuid, CONSTRAINT "UQ_e739f9fb242a95d501aedde46c8" UNIQUE ("code"), CONSTRAINT "PK_467c08a2efc78393c647da32bac" PRIMARY KEY ("id")); COMMENT ON COLUMN "chart_of_accounts"."isActive" IS 'Soft delete flag for performance queries'; COMMENT ON COLUMN "chart_of_accounts"."code" IS 'Unique account code (e.g., "1000", "4000")'; COMMENT ON COLUMN "chart_of_accounts"."name" IS 'Account name (e.g., "Cash", "Sales Revenue")'; COMMENT ON COLUMN "chart_of_accounts"."type" IS 'Account type (ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE)'; COMMENT ON COLUMN "chart_of_accounts"."parentId" IS 'Parent account ID for hierarchical accounts'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_058afd524e65941c204f41eaa4" ON "chart_of_accounts" ("isActive") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_696136b16d41cbf47ff3db72f7" ON "chart_of_accounts" ("parentId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_68fc27572002de8c634ceaa1d8" ON "chart_of_accounts" ("type") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_e739f9fb242a95d501aedde46c" ON "chart_of_accounts" ("code") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."bank_reconciliations_status_enum" AS ENUM('IN_PROGRESS', 'COMPLETED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "bank_reconciliations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "reconciliationDate" date NOT NULL, "accountId" uuid NOT NULL, "fiscalPeriodId" uuid NOT NULL, "statementBalance" numeric(15,4) NOT NULL DEFAULT '0', "bookBalance" numeric(15,4) NOT NULL DEFAULT '0', "difference" numeric(15,4) NOT NULL DEFAULT '0', "status" "public"."bank_reconciliations_status_enum" NOT NULL DEFAULT 'IN_PROGRESS', CONSTRAINT "PK_2616ee3f2acfae424b545a9d3be" PRIMARY KEY ("id")); COMMENT ON COLUMN "bank_reconciliations"."isActive" IS 'Soft delete flag for performance queries'; COMMENT ON COLUMN "bank_reconciliations"."reconciliationDate" IS 'Date of reconciliation'; COMMENT ON COLUMN "bank_reconciliations"."accountId" IS 'Bank account (Chart of Account ID)'; COMMENT ON COLUMN "bank_reconciliations"."fiscalPeriodId" IS 'Fiscal period ID'; COMMENT ON COLUMN "bank_reconciliations"."statementBalance" IS 'Balance per bank statement'; COMMENT ON COLUMN "bank_reconciliations"."bookBalance" IS 'Balance per books (general ledger)'; COMMENT ON COLUMN "bank_reconciliations"."difference" IS 'Difference between statement and book balance'; COMMENT ON COLUMN "bank_reconciliations"."status" IS 'Reconciliation status'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d986293bf95810bf040998c10e" ON "bank_reconciliations" ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8112253f7319beba850e26b566" ON "bank_reconciliations" ("reconciliationDate") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_caee9aad9b9c7f8270ef9918a3" ON "bank_reconciliations" ("fiscalPeriodId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_33754532ff1b69b02628d42fd2" ON "bank_reconciliations" ("accountId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "reconciled_transactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "reconciliationId" uuid NOT NULL, "journalEntryLineId" uuid NOT NULL, "cleared" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_cfd0bc17522a3c22971f18aa334" PRIMARY KEY ("id")); COMMENT ON COLUMN "reconciled_transactions"."isActive" IS 'Soft delete flag for performance queries'; COMMENT ON COLUMN "reconciled_transactions"."reconciliationId" IS 'Bank reconciliation ID'; COMMENT ON COLUMN "reconciled_transactions"."journalEntryLineId" IS 'Journal entry line ID being reconciled'; COMMENT ON COLUMN "reconciled_transactions"."cleared" IS 'Whether the transaction has cleared the bank'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3b9ea1846e8e1be0c1c82d2531" ON "reconciled_transactions" ("cleared") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_11744dd1514afba38f5f8b3122" ON "reconciled_transactions" ("journalEntryLineId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9a3e7b0b468ed724ab5a0d359e" ON "reconciled_transactions" ("reconciliationId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP COLUMN "paymentMethodId"`,
    );
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "currency"`);
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "currency"`);
    await queryRunner.query(
      `ALTER TABLE "purchase_orders" DROP COLUMN "currency"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_payments" DROP COLUMN "currency"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" DROP CONSTRAINT "UQ_journal_entries_entry_number"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" DROP COLUMN "entryNumber"`,
    );
    await queryRunner.query(`ALTER TABLE "journal_entries" DROP COLUMN "date"`);
    await queryRunner.query(
      `ALTER TABLE "journal_entries" DROP COLUMN "exchangeRate"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" DROP COLUMN "isLocked"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" DROP COLUMN "isReversed"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" DROP COLUMN "reversalEntryId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" DROP COLUMN "reversedEntryId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" DROP COLUMN "postedAt"`,
    );
    await queryRunner.query(`ALTER TABLE "journal_entries" DROP COLUMN "type"`);
    await queryRunner.query(`DROP TYPE "public"."journal_entries_type_enum"`);
    await queryRunner.query(
      `ALTER TABLE "journal_entries" DROP COLUMN "currency"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" DROP COLUMN "postedBy"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" DROP COLUMN "baseCurrency"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" DROP COLUMN "sourceEvent"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" DROP CONSTRAINT "UQ_journal_entries_reference"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" DROP COLUMN "reference"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entry_lines" DROP COLUMN "debit"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entry_lines" DROP COLUMN "credit"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entry_lines" DROP COLUMN "debitBase"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entry_lines" DROP COLUMN "creditBase"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entry_lines" DROP COLUMN "description"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ADD "entryDate" date NOT NULL`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "journal_entries"."entryDate" IS 'Transaction entry date'`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ADD "referenceNumber" character varying(50) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ADD CONSTRAINT "UQ_3a09ba418783bff10fd3e1fa7ee" UNIQUE ("referenceNumber")`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "journal_entries"."referenceNumber" IS 'Unique reference number (e.g., "JE-2026-001")'`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ADD "fiscalPeriodId" uuid NOT NULL`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "journal_entries"."fiscalPeriodId" IS 'Fiscal period ID'`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ADD "reversalOfId" uuid`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "journal_entries"."reversalOfId" IS 'ID of the entry being reversed (if this is a reversal entry)'`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ADD "reversedById" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ADD CONSTRAINT "UQ_67b6901e1a3997882a47cf14822" UNIQUE ("reversedById")`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "journal_entries"."reversedById" IS 'ID of the reversing entry (if this entry was reversed)'`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ADD "sourceType" character varying(100)`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "journal_entries"."sourceType" IS 'Source transaction type (e.g., "SALES_ORDER", "PAYMENT")'`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ADD "sourceId" uuid`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "journal_entries"."sourceId" IS 'Source transaction ID (references originating transaction)'`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entry_lines" ADD "debitAmount" numeric(15,4) NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "journal_entry_lines"."debitAmount" IS 'Debit amount'`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entry_lines" ADD "creditAmount" numeric(15,4) NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "journal_entry_lines"."creditAmount" IS 'Credit amount'`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entry_lines" ADD "memo" text`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "journal_entry_lines"."memo" IS 'Line item memo/description'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."payments_paymentmethod_enum" RENAME TO "payments_paymentmethod_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payments_paymentmethod_enum" AS ENUM('cash')`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ALTER COLUMN "paymentMethod" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ALTER COLUMN "paymentMethod" TYPE "public"."payments_paymentmethod_enum" USING "paymentMethod"::"text"::"public"."payments_paymentmethod_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ALTER COLUMN "paymentMethod" SET DEFAULT 'cash'`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."payments_paymentmethod_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_payments" DROP COLUMN "paymentMethod"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."vendor_payments_paymentmethod_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_payments" ADD "paymentMethod" character varying(50) NOT NULL`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d6ee2d4bf901675877bb94977c"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."users_role_enum" RENAME TO "users_role_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'manager', 'sales_staff', 'inventory_staff', 'procurement_staff')`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" TYPE "public"."users_role_enum" USING "role"::"text"::"public"."users_role_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'sales_staff'`,
    );
    await queryRunner.query(`DROP TYPE "public"."users_role_enum_old"`);
    await queryRunner.query(
      `COMMENT ON COLUMN "journal_entries"."description" IS 'Journal entry description'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."journal_entries_status_enum" RENAME TO "journal_entries_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."journal_entries_status_enum" AS ENUM('DRAFT', 'POSTED', 'REVERSED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ALTER COLUMN "status" TYPE "public"."journal_entries_status_enum" USING "status"::"text"::"public"."journal_entries_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ALTER COLUMN "status" SET DEFAULT 'DRAFT'`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."journal_entries_status_enum_old"`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "journal_entries"."status" IS 'Entry status (DRAFT, POSTED, REVERSED)'`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entry_lines" DROP CONSTRAINT "FK_b06b5322d679be6e2559132857d"`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "journal_entry_lines"."journalEntryId" IS 'Journal entry ID'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "journal_entry_lines"."accountId" IS 'Chart of account ID'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d6ee2d4bf901675877bb94977c" ON "users" ("role", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9bd874dcd57eb61f322d9cf70f" ON "journal_entries" ("sourceType", "sourceId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ffe2f0d3a4f6993bcbee7f7096" ON "journal_entries" ("fiscalPeriodId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_978357e1d466f860772b13ee8b" ON "journal_entries" ("entryDate") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_3a09ba418783bff10fd3e1fa7e" ON "journal_entries" ("referenceNumber") `,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ADD CONSTRAINT "FK_ffe2f0d3a4f6993bcbee7f7096e" FOREIGN KEY ("fiscalPeriodId") REFERENCES "fiscal_periods"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ADD CONSTRAINT "FK_156f9981f7138309954206a850e" FOREIGN KEY ("reversalOfId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ADD CONSTRAINT "FK_67b6901e1a3997882a47cf14822" FOREIGN KEY ("reversedById") REFERENCES "journal_entries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "FK_b06b5322d679be6e2559132857d" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "FK_34d5d6a407b7724da2e2766b15e" FOREIGN KEY ("accountId") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "account_mappings" ADD CONSTRAINT "FK_7f4f8d0f398d70cd8a6485f586d" FOREIGN KEY ("accountId") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "FK_696136b16d41cbf47ff3db72f75" FOREIGN KEY ("parentId") REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "FK_33754532ff1b69b02628d42fd24" FOREIGN KEY ("accountId") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "FK_caee9aad9b9c7f8270ef9918a31" FOREIGN KEY ("fiscalPeriodId") REFERENCES "fiscal_periods"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reconciled_transactions" ADD CONSTRAINT "FK_9a3e7b0b468ed724ab5a0d359e8" FOREIGN KEY ("reconciliationId") REFERENCES "bank_reconciliations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reconciled_transactions" ADD CONSTRAINT "FK_11744dd1514afba38f5f8b3122a" FOREIGN KEY ("journalEntryLineId") REFERENCES "journal_entry_lines"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    // Add check constraints for journal entry lines
    await queryRunner.query(
      `ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "CHK_journal_entry_lines_debit_credit" CHECK (("debitAmount" > 0 AND "creditAmount" = 0) OR ("creditAmount" > 0 AND "debitAmount" = 0))`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "CHK_journal_entry_lines_amounts_non_negative" CHECK ("debitAmount" >= 0 AND "creditAmount" >= 0)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // WARNING: Rolling back this migration will permanently delete all accounting data
    // including journal entries, fiscal periods, and bank reconciliations.
    // Ensure you have a database backup before running this rollback.

    await queryRunner.query(
      `ALTER TABLE "reconciled_transactions" DROP CONSTRAINT "FK_11744dd1514afba38f5f8b3122a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reconciled_transactions" DROP CONSTRAINT "FK_9a3e7b0b468ed724ab5a0d359e8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bank_reconciliations" DROP CONSTRAINT "FK_caee9aad9b9c7f8270ef9918a31"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bank_reconciliations" DROP CONSTRAINT "FK_33754532ff1b69b02628d42fd24"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chart_of_accounts" DROP CONSTRAINT "FK_696136b16d41cbf47ff3db72f75"`,
    );
    await queryRunner.query(
      `ALTER TABLE "account_mappings" DROP CONSTRAINT "FK_7f4f8d0f398d70cd8a6485f586d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entry_lines" DROP CONSTRAINT "FK_34d5d6a407b7724da2e2766b15e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entry_lines" DROP CONSTRAINT "FK_b06b5322d679be6e2559132857d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" DROP CONSTRAINT "FK_67b6901e1a3997882a47cf14822"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" DROP CONSTRAINT "FK_156f9981f7138309954206a850e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" DROP CONSTRAINT "FK_ffe2f0d3a4f6993bcbee7f7096e"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3a09ba418783bff10fd3e1fa7e"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_978357e1d466f860772b13ee8b"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ffe2f0d3a4f6993bcbee7f7096"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9bd874dcd57eb61f322d9cf70f"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d6ee2d4bf901675877bb94977c"`,
    );

    // Drop check constraints
    await queryRunner.query(
      `ALTER TABLE "journal_entry_lines" DROP CONSTRAINT IF EXISTS "CHK_journal_entry_lines_debit_credit"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entry_lines" DROP CONSTRAINT IF EXISTS "CHK_journal_entry_lines_amounts_non_negative"`,
    );

    await queryRunner.query(
      `COMMENT ON COLUMN "journal_entry_lines"."accountId" IS NULL`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "journal_entry_lines"."journalEntryId" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "FK_b06b5322d679be6e2559132857d" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "journal_entries"."status" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."journal_entries_status_enum_old" AS ENUM('DRAFT', 'POSTED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ALTER COLUMN "status" TYPE "public"."journal_entries_status_enum_old" USING "status"::"text"::"public"."journal_entries_status_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ALTER COLUMN "status" SET DEFAULT 'DRAFT'`,
    );
    await queryRunner.query(`DROP TYPE "public"."journal_entries_status_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."journal_entries_status_enum_old" RENAME TO "journal_entries_status_enum"`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "journal_entries"."description" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum_old" AS ENUM('admin', 'manager', 'sales_staff', 'inventory_staff', 'procurement_staff', 'accountant', 'auditor', 'cfo')`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" TYPE "public"."users_role_enum_old" USING "role"::"text"::"public"."users_role_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'sales_staff'`,
    );
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."users_role_enum_old" RENAME TO "users_role_enum"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d6ee2d4bf901675877bb94977c" ON "users" ("role", "status") `,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_payments" DROP COLUMN "paymentMethod"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."vendor_payments_paymentmethod_enum" AS ENUM('CASH', 'CHECK', 'BANK_TRANSFER', 'CREDIT_CARD', 'OTHER')`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_payments" ADD "paymentMethod" "public"."vendor_payments_paymentmethod_enum" NOT NULL DEFAULT 'CASH'`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payments_paymentmethod_enum_old" AS ENUM('CASH', 'CHECK', 'BANK_TRANSFER', 'CREDIT_CARD', 'OTHER')`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ALTER COLUMN "paymentMethod" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ALTER COLUMN "paymentMethod" TYPE "public"."payments_paymentmethod_enum_old" USING "paymentMethod"::"text"::"public"."payments_paymentmethod_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ALTER COLUMN "paymentMethod" SET DEFAULT 'CASH'`,
    );
    await queryRunner.query(`DROP TYPE "public"."payments_paymentmethod_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."payments_paymentmethod_enum_old" RENAME TO "payments_paymentmethod_enum"`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "journal_entry_lines"."memo" IS 'Line item memo/description'`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entry_lines" DROP COLUMN "memo"`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "journal_entry_lines"."creditAmount" IS 'Credit amount'`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entry_lines" DROP COLUMN "creditAmount"`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "journal_entry_lines"."debitAmount" IS 'Debit amount'`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entry_lines" DROP COLUMN "debitAmount"`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "journal_entries"."sourceId" IS 'Source transaction ID (references originating transaction)'`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" DROP COLUMN "sourceId"`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "journal_entries"."sourceType" IS 'Source transaction type (e.g., "SALES_ORDER", "PAYMENT")'`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" DROP COLUMN "sourceType"`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "journal_entries"."reversedById" IS 'ID of the reversing entry (if this entry was reversed)'`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" DROP CONSTRAINT "UQ_67b6901e1a3997882a47cf14822"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" DROP COLUMN "reversedById"`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "journal_entries"."reversalOfId" IS 'ID of the entry being reversed (if this is a reversal entry)'`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" DROP COLUMN "reversalOfId"`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "journal_entries"."fiscalPeriodId" IS 'Fiscal period ID'`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" DROP COLUMN "fiscalPeriodId"`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "journal_entries"."referenceNumber" IS 'Unique reference number (e.g., "JE-2026-001")'`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" DROP CONSTRAINT "UQ_3a09ba418783bff10fd3e1fa7ee"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" DROP COLUMN "referenceNumber"`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "journal_entries"."entryDate" IS 'Transaction entry date'`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" DROP COLUMN "entryDate"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entry_lines" ADD "description" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entry_lines" ADD "creditBase" numeric(15,4)`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entry_lines" ADD "debitBase" numeric(15,4)`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entry_lines" ADD "credit" numeric(15,4) NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entry_lines" ADD "debit" numeric(15,4) NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ADD "reference" character varying(255) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ADD CONSTRAINT "UQ_journal_entries_reference" UNIQUE ("reference")`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ADD "sourceEvent" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ADD "baseCurrency" character varying(3)`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ADD "postedBy" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ADD "currency" character varying(3) NOT NULL DEFAULT 'USD'`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."journal_entries_type_enum" AS ENUM('STANDARD', 'OPENING', 'CLOSING', 'ADJUSTMENT', 'REVERSAL')`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ADD "type" "public"."journal_entries_type_enum" NOT NULL DEFAULT 'STANDARD'`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ADD "postedAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ADD "reversedEntryId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ADD "reversalEntryId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ADD "isReversed" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ADD "isLocked" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ADD "exchangeRate" numeric(12,6) NOT NULL DEFAULT '1'`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ADD "date" date NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ADD "entryNumber" SERIAL NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ADD CONSTRAINT "UQ_journal_entries_entry_number" UNIQUE ("entryNumber")`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_payments" ADD "currency" character varying(3) NOT NULL DEFAULT 'USD'`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_orders" ADD "currency" character varying(3) NOT NULL DEFAULT 'USD'`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD "currency" character varying(3) NOT NULL DEFAULT 'USD'`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD "currency" character varying(3) NOT NULL DEFAULT 'USD'`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD "paymentMethodId" uuid`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9a3e7b0b468ed724ab5a0d359e"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_11744dd1514afba38f5f8b3122"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3b9ea1846e8e1be0c1c82d2531"`,
    );
    await queryRunner.query(`DROP TABLE "reconciled_transactions"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_33754532ff1b69b02628d42fd2"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_caee9aad9b9c7f8270ef9918a3"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8112253f7319beba850e26b566"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d986293bf95810bf040998c10e"`,
    );
    await queryRunner.query(`DROP TABLE "bank_reconciliations"`);
    await queryRunner.query(
      `DROP TYPE "public"."bank_reconciliations_status_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e739f9fb242a95d501aedde46c"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_68fc27572002de8c634ceaa1d8"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_696136b16d41cbf47ff3db72f7"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_058afd524e65941c204f41eaa4"`,
    );
    await queryRunner.query(`DROP TABLE "chart_of_accounts"`);
    await queryRunner.query(`DROP TYPE "public"."chart_of_accounts_type_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8d7d4d92229f957c449da63dad"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7f4f8d0f398d70cd8a6485f586"`,
    );
    await queryRunner.query(`DROP TABLE "account_mappings"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_073ccfb53e60976af707e0e141"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_192d3370278bf36540741a5d98"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_14aa5e6aff66df3b6cc72763f4"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_acf265b0e823b68f8dbdd0f137"`,
    );
    await queryRunner.query(`DROP TABLE "fiscal_periods"`);
    await queryRunner.query(`DROP TYPE "public"."fiscal_periods_status_enum"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_d8a220c5fede561df32d0fe082" ON "journal_entry_lines" ("accountId", "journalEntryId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a60ea60964189a5a56f07dc8dc" ON "journal_entries" ("date") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_aed83d24e3c81f085fa6bf0f9f" ON "journal_entries" ("reference") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5e7b3e25b716f194c94ab29e5a" ON "journal_entries" ("date", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4b3b30432878ce7cc7882e919b" ON "journal_entries" ("entryNumber") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payments_paymentMethodId" ON "payments" ("paymentMethodId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "FK_34d5d6a407b7724da2e2766b15e" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ADD CONSTRAINT "FK_c38a2267c628a599f96918eb413" FOREIGN KEY ("reversedEntryId") REFERENCES "journal_entries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ADD CONSTRAINT "FK_41891020be5293d0fd305c52574" FOREIGN KEY ("reversalEntryId") REFERENCES "journal_entries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_payments_paymentMethodId" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }
}
