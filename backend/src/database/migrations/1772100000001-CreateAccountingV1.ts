import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAccountingV11772100000001 implements MigrationInterface {
  name = 'CreateAccountingV11772100000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- Baseline: own these objects. Drop any sync-created versions first, then create cleanly.
    await queryRunner.query(`DROP TABLE IF EXISTS "journal_entry_line" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "journal_entry" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "accounting_settings" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chart_of_account" CASCADE`);
    await queryRunner.query(`DROP TYPE IF EXISTS "journal_entry_postingtype_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "journal_entry_sourcetype_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "chart_of_account_type_enum"`);

    // --- enums (owned CREATE, no defensive guard) ---
    await queryRunner.query(`CREATE TYPE "chart_of_account_type_enum" AS ENUM ('Asset','Liability','Equity','Income','Expense')`);
    await queryRunner.query(`CREATE TYPE "journal_entry_sourcetype_enum" AS ENUM ('SALES_ORDER','PURCHASE_ORDER','STOCK_ADJUSTMENT','OPENING_BALANCE')`);
    await queryRunner.query(`CREATE TYPE "journal_entry_postingtype_enum" AS ENUM ('OPENING_BALANCE','SALES_PAYMENT','SALES_FULFILLMENT_REVENUE','SALES_FULFILLMENT_COGS','SALES_REFUND','PURCHASE_PAYMENT','PURCHASE_RECEIVE','PURCHASE_REFUND','STOCK_ADJUSTMENT')`);

    // --- chart_of_account (BaseEntity cols: id, createdAt, updatedAt, deletedAt, isActive; + createdBy explicit) ---
    await queryRunner.query(`CREATE TABLE "chart_of_account" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "deletedAt" timestamptz,
      "isActive" boolean NOT NULL DEFAULT true,
      "createdBy" varchar(120),
      "code" varchar(20) NOT NULL,
      "name" varchar(120) NOT NULL,
      "type" "chart_of_account_type_enum" NOT NULL,
      "parentId" uuid,
      "description" text,
      "isSystem" boolean NOT NULL DEFAULT false,
      "isPostable" boolean NOT NULL DEFAULT true,
      "openingBalance" numeric(18,4) NOT NULL DEFAULT 0,
      CONSTRAINT "PK_chart_of_account" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_chart_of_account_code" UNIQUE ("code"),
      CONSTRAINT "FK_chart_of_account_parent" FOREIGN KEY ("parentId") REFERENCES "chart_of_account"("id")
    )`);

    // --- seed preset COA FIRST (settings + JE-line FKs reference these rows). Idempotent on code. ---
    const groups: Array<[string, string, string]> = [
      ['1000','Assets','Asset'], ['2000','Liabilities','Liability'],
      ['3000','Equity','Equity'], ['4000','Income','Income'],
      ['5000','Cost of Sales','Expense'], ['6000','Expenses','Expense'],
    ];
    for (const [code, name, type] of groups) {
      await queryRunner.query(
        `INSERT INTO "chart_of_account" ("code","name","type","isSystem","isPostable")
         VALUES ($1,$2,$3::"chart_of_account_type_enum",true,false)
         ON CONFLICT ("code") DO NOTHING`, [code, name, type]);
    }
    const children: Array<[string, string, string, string]> = [
      ['1100','Cash','Asset','1000'], ['1200','Bank','Asset','1000'],
      ['1300','Inventory','Asset','1000'], ['1400','Supplier Deposit','Asset','1000'],
      ['2100','Customer Deposit','Liability','2000'],
      ['3100','Owner Capital','Equity','3000'], ['3200','Opening Balance Equity','Equity','3000'],
      ['4100','Sales Revenue','Income','4000'],
      ['5100','Cost of Goods Sold','Expense','5000'],
      ['6990','Other Expenses','Expense','6000'],
    ];
    for (const [code, name, type, parentCode] of children) {
      await queryRunner.query(
        `INSERT INTO "chart_of_account" ("code","name","type","parentId","isSystem","isPostable")
         VALUES ($1,$2,$3::"chart_of_account_type_enum",
                 (SELECT "id" FROM "chart_of_account" WHERE "code"=$4), true, true)
         ON CONFLICT ("code") DO NOTHING`, [code, name, type, parentCode]);
    }

    // --- accounting_settings (singleton). 9 mappings NOT NULL + RESTRICT FKs to COA. ---
    await queryRunner.query(`CREATE TABLE "accounting_settings" (
      "id" boolean NOT NULL DEFAULT true,
      "cashAccountId" uuid NOT NULL,
      "bankAccountId" uuid NOT NULL,
      "inventoryAccountId" uuid NOT NULL,
      "supplierDepositAccountId" uuid NOT NULL,
      "customerDepositAccountId" uuid NOT NULL,
      "openingBalanceEquityAccountId" uuid NOT NULL,
      "salesRevenueAccountId" uuid NOT NULL,
      "cogsAccountId" uuid NOT NULL,
      "defaultExpenseAccountId" uuid NOT NULL,
      CONSTRAINT "PK_accounting_settings" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_accounting_settings_singleton" CHECK ("id" = true),
      CONSTRAINT "FK_settings_cash"          FOREIGN KEY ("cashAccountId")                REFERENCES "chart_of_account"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_settings_bank"          FOREIGN KEY ("bankAccountId")                REFERENCES "chart_of_account"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_settings_inventory"     FOREIGN KEY ("inventoryAccountId")           REFERENCES "chart_of_account"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_settings_supplier_dep"  FOREIGN KEY ("supplierDepositAccountId")     REFERENCES "chart_of_account"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_settings_customer_dep"  FOREIGN KEY ("customerDepositAccountId")     REFERENCES "chart_of_account"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_settings_obe"           FOREIGN KEY ("openingBalanceEquityAccountId")REFERENCES "chart_of_account"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_settings_revenue"       FOREIGN KEY ("salesRevenueAccountId")        REFERENCES "chart_of_account"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_settings_cogs"          FOREIGN KEY ("cogsAccountId")                REFERENCES "chart_of_account"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_settings_expense"       FOREIGN KEY ("defaultExpenseAccountId")      REFERENCES "chart_of_account"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(`
      INSERT INTO "accounting_settings"
        ("id","cashAccountId","bankAccountId","inventoryAccountId","supplierDepositAccountId",
         "customerDepositAccountId","openingBalanceEquityAccountId","salesRevenueAccountId",
         "cogsAccountId","defaultExpenseAccountId")
      SELECT true,
        (SELECT id FROM chart_of_account WHERE code='1100'),
        (SELECT id FROM chart_of_account WHERE code='1200'),
        (SELECT id FROM chart_of_account WHERE code='1300'),
        (SELECT id FROM chart_of_account WHERE code='1400'),
        (SELECT id FROM chart_of_account WHERE code='2100'),
        (SELECT id FROM chart_of_account WHERE code='3200'),
        (SELECT id FROM chart_of_account WHERE code='4100'),
        (SELECT id FROM chart_of_account WHERE code='5100'),
        (SELECT id FROM chart_of_account WHERE code='6990')
      ON CONFLICT ("id") DO NOTHING`);

    // --- journal_entry (createdBy explicit; reversalOfEntryId self-FK + UNIQUE) ---
    await queryRunner.query(`CREATE TABLE "journal_entry" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "deletedAt" timestamptz,
      "isActive" boolean NOT NULL DEFAULT true,
      "createdBy" varchar(120),
      "journalNo" varchar(40) NOT NULL,
      "entryDate" date NOT NULL,
      "sourceType" "journal_entry_sourcetype_enum" NOT NULL,
      "sourceDocumentId" uuid,
      "sourceEventId" uuid,
      "sourceRef" varchar(60),
      "postingType" "journal_entry_postingtype_enum" NOT NULL,
      "description" text,
      "reversalOfEntryId" uuid,
      CONSTRAINT "PK_journal_entry" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_journal_entry_journalNo" UNIQUE ("journalNo"),
      CONSTRAINT "UQ_journal_entry_reversalOf" UNIQUE ("reversalOfEntryId"),
      CONSTRAINT "FK_journal_entry_reversal" FOREIGN KEY ("reversalOfEntryId") REFERENCES "journal_entry"("id") ON DELETE RESTRICT
    )`);

    // --- journal_entry_line (no createdBy; isActive from BaseEntity) ---
    await queryRunner.query(`CREATE TABLE "journal_entry_line" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "deletedAt" timestamptz,
      "isActive" boolean NOT NULL DEFAULT true,
      "entryId" uuid NOT NULL,
      "accountId" uuid NOT NULL,
      "debit" numeric(18,4) NOT NULL DEFAULT 0,
      "credit" numeric(18,4) NOT NULL DEFAULT 0,
      CONSTRAINT "PK_journal_entry_line" PRIMARY KEY ("id"),
      CONSTRAINT "FK_jel_entry" FOREIGN KEY ("entryId") REFERENCES "journal_entry"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_jel_account" FOREIGN KEY ("accountId") REFERENCES "chart_of_account"("id") ON DELETE RESTRICT,
      CONSTRAINT "CHK_jel_nonneg" CHECK ("debit" >= 0 AND "credit" >= 0),
      CONSTRAINT "CHK_jel_one_side" CHECK (("debit" > 0) <> ("credit" > 0))
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_jel_entryId" ON "journal_entry_line" ("entryId")`);
    await queryRunner.query(`CREATE INDEX "IDX_jel_accountId" ON "journal_entry_line" ("accountId")`);

    // NOTE: the 'Journal Entries' document_number_settings row is already seeded by
    // 1772100000000-NormalizeDocumentNumberSettings.ts — do NOT insert it here.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop only what this migration created. Do NOT touch document_number_settings
    // (its 'Journal Entries' row is owned by an earlier migration).
    await queryRunner.query(`DROP TABLE IF EXISTS "journal_entry_line" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "journal_entry" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "accounting_settings" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chart_of_account" CASCADE`);
    await queryRunner.query(`DROP TYPE IF EXISTS "journal_entry_postingtype_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "journal_entry_sourcetype_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "chart_of_account_type_enum"`);
  }
}
