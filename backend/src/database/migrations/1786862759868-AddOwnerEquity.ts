import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOwnerEquity1786862759868 implements MigrationInterface {
    name = 'AddOwnerEquity1786862759868'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Enum alterations. Type names verified against
        //    1785238045705-InitialSchema.ts — do not re-derive them.
        //    Values are lowercase for stock movements (that enum's convention) and
        //    SCREAMING_CASE for the journal enums (theirs). Match each enum's existing
        //    style; a mismatch here is silently accepted by Postgres and only surfaces
        //    as rows that never match a query.
        await queryRunner.query(`ALTER TYPE "public"."stock_movements_movementtype_enum" ADD VALUE IF NOT EXISTS 'owner_drawing'`);
        await queryRunner.query(`ALTER TYPE "public"."stock_movements_movementtype_enum" ADD VALUE IF NOT EXISTS 'owner_drawing_reversal'`);

        await queryRunner.query(`ALTER TYPE "public"."journal_entry_postingtype_enum" ADD VALUE IF NOT EXISTS 'OWNER_CAPITAL_INJECTION'`);
        await queryRunner.query(`ALTER TYPE "public"."journal_entry_postingtype_enum" ADD VALUE IF NOT EXISTS 'OWNER_CAPITAL_INJECTION_REFUND'`);
        await queryRunner.query(`ALTER TYPE "public"."journal_entry_postingtype_enum" ADD VALUE IF NOT EXISTS 'OWNER_CASH_DRAWING'`);
        await queryRunner.query(`ALTER TYPE "public"."journal_entry_postingtype_enum" ADD VALUE IF NOT EXISTS 'OWNER_CASH_DRAWING_REFUND'`);
        await queryRunner.query(`ALTER TYPE "public"."journal_entry_postingtype_enum" ADD VALUE IF NOT EXISTS 'OWNER_STOCK_DRAWING'`);

        await queryRunner.query(`ALTER TYPE "public"."journal_entry_sourcetype_enum" ADD VALUE IF NOT EXISTS 'OWNER_EQUITY'`);

        // PostgreSQL disallows ALTER TYPE ... ADD VALUE inside a transaction block on
        // some versions when the new value is used in the SAME transaction. These
        // statements only add values; nothing below reads them, so this is safe. Do not
        // insert a row using a new enum value in this same migration.

        // 2. Seed COA 3300 (idempotent), parented to 3000. On fresh installs the
        //    genesis already created the row (1785238045705 was extended in lockstep
        //    with the entity), so this only inserts on older installs.
        await queryRunner.query(`
          INSERT INTO chart_of_account (code, name, type, "parentId", "isSystem", "isPostable")
          SELECT '3300', 'Owner Drawings', 'Equity', p.id, true, true
          FROM chart_of_account p WHERE p.code = '3000'
          AND NOT EXISTS (SELECT 1 FROM chart_of_account WHERE code = '3300')
        `);

        // 3. Settings columns — nullable first (table is populated, columns are NOT
        //    NULL). ADD COLUMN IF NOT EXISTS: the genesis now creates these columns
        //    directly, so this is a no-op on fresh installs and only does real work
        //    on existing ones.
        await queryRunner.query(`ALTER TABLE accounting_settings ADD COLUMN IF NOT EXISTS "ownerCapitalAccountId" uuid`);
        await queryRunner.query(`ALTER TABLE accounting_settings ADD COLUMN IF NOT EXISTS "ownerDrawingsAccountId" uuid`);

        // 4. Backfill by CODE, never by hardcoded uuid.
        await queryRunner.query(`
          UPDATE accounting_settings SET
            "ownerCapitalAccountId"  = (SELECT id FROM chart_of_account WHERE code = '3100'),
            "ownerDrawingsAccountId" = (SELECT id FROM chart_of_account WHERE code = '3300')
        `);

        // 5. Fail loudly if either lookup missed, rather than letting step 6 throw opaquely.
        const bad = await queryRunner.query(`
          SELECT 1 FROM accounting_settings
          WHERE "ownerCapitalAccountId" IS NULL OR "ownerDrawingsAccountId" IS NULL LIMIT 1
        `);
        if (bad.length) {
          throw new Error('Owner equity migration: COA 3100/3300 not found; cannot set NOT NULL');
        }

        // 6. NOT NULL. No-op on fresh installs (genesis already created the columns
        //    as NOT NULL); the real transition on existing installs.
        await queryRunner.query(`ALTER TABLE accounting_settings ALTER COLUMN "ownerCapitalAccountId" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE accounting_settings ALTER COLUMN "ownerDrawingsAccountId" SET NOT NULL`);

        // 7. CREATE the three new enum types, both tables, and their indexes.
        //    Constraint/index names are TypeORM's generated hashes, matching what
        //    schema:sync emits from the entity declarations (verify-baseline.sh
        //    compares names exactly). Keep them — do not rename to friendly names.
        await queryRunner.query(`CREATE TYPE "public"."owner_equity_documents_type_enum" AS ENUM('CAPITAL_INJECTION', 'CASH_DRAWING', 'STOCK_DRAWING')`);
        await queryRunner.query(`CREATE TYPE "public"."owner_equity_documents_documentstatus_enum" AS ENUM('DRAFT', 'READY', 'COMPLETED', 'CANCELLED')`);
        await queryRunner.query(`CREATE TYPE "public"."owner_equity_documents_settlementstatus_enum" AS ENUM('UNSETTLED', 'PARTIAL', 'SETTLED', 'OVERSETTLED')`);
        await queryRunner.query(`CREATE TABLE "owner_equity_settlements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "equityDocumentId" uuid NOT NULL, "paymentMethodId" uuid NOT NULL, "settlementDate" date NOT NULL, "amount" numeric(18,4) NOT NULL, "reference" character varying(200), "sourceSettlementId" uuid, CONSTRAINT "PK_7694bda633c3c608016291668f7" PRIMARY KEY ("id")); COMMENT ON COLUMN "owner_equity_settlements"."isActive" IS 'Soft delete flag for performance queries'`);
        await queryRunner.query(`CREATE INDEX "IDX_848072a5d194df5db72332d3ee" ON "owner_equity_settlements"  ("sourceSettlementId") `);
        await queryRunner.query(`CREATE INDEX "IDX_4d07dfd32e05923f733aeb0709" ON "owner_equity_settlements"  ("equityDocumentId") `);
        await queryRunner.query(`CREATE TABLE "owner_equity_documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "referenceNumber" character varying(30) NOT NULL, "equityDate" date NOT NULL, "type" "public"."owner_equity_documents_type_enum" NOT NULL, "description" character varying(500) NOT NULL, "notes" text, "documentStatus" "public"."owner_equity_documents_documentstatus_enum" NOT NULL DEFAULT 'DRAFT', "settlementStatus" "public"."owner_equity_documents_settlementstatus_enum", "totalAmount" numeric(18,4), "settledAmount" numeric(18,4), "balance" numeric(18,4), "productId" uuid, "quantity" numeric(15,4), "unitCost" numeric(18,4), "totalCost" numeric(18,4), "completedAt" TIMESTAMP WITH TIME ZONE, "completedBy" character varying(120), CONSTRAINT "UQ_9948b41df60005ef7ec38537a14" UNIQUE ("referenceNumber"), CONSTRAINT "CHK_oe_values" CHECK (("totalAmount" IS NULL OR "totalAmount" > 0) AND (quantity IS NULL OR quantity > 0) AND ("unitCost" IS NULL OR "unitCost" >= 0) AND ("totalCost" IS NULL OR "totalCost" >= 0)), CONSTRAINT "CHK_oe_completion_metadata" CHECK (("documentStatus" = 'COMPLETED' AND "completedAt" IS NOT NULL AND "completedBy" IS NOT NULL) OR ("documentStatus" <> 'COMPLETED' AND "completedAt" IS NULL AND "completedBy" IS NULL)), CONSTRAINT "CHK_oe_stock_no_ready" CHECK (type <> 'STOCK_DRAWING' OR "documentStatus" <> 'READY'), CONSTRAINT "CHK_oe_stock_cost_on_complete" CHECK (type <> 'STOCK_DRAWING' OR "documentStatus" <> 'COMPLETED' OR ("unitCost" IS NOT NULL AND "totalCost" IS NOT NULL)), CONSTRAINT "CHK_oe_stock_shape" CHECK (type <> 'STOCK_DRAWING' OR ("productId" IS NOT NULL AND quantity IS NOT NULL AND "totalAmount" IS NULL AND "settledAmount" IS NULL AND balance IS NULL AND "settlementStatus" IS NULL)), CONSTRAINT "CHK_oe_monetary_shape" CHECK (type = 'STOCK_DRAWING' OR ("totalAmount" IS NOT NULL AND "settledAmount" IS NOT NULL AND balance IS NOT NULL AND "settlementStatus" IS NOT NULL AND "productId" IS NULL AND quantity IS NULL AND "unitCost" IS NULL AND "totalCost" IS NULL)), CONSTRAINT "PK_6250790aaf6c4c8ac282c78f7d6" PRIMARY KEY ("id")); COMMENT ON COLUMN "owner_equity_documents"."isActive" IS 'Soft delete flag for performance queries'`);
        await queryRunner.query(`CREATE INDEX "IDX_b1b1e562831bbbab5743bb54c2" ON "owner_equity_documents"  ("productId") `);
        await queryRunner.query(`CREATE INDEX "IDX_cd2a016f083d534b9a640aae51" ON "owner_equity_documents"  ("settlementStatus") `);
        await queryRunner.query(`CREATE INDEX "IDX_5e99f0e4d43c62ee9e1fc48358" ON "owner_equity_documents"  ("documentStatus") `);
        await queryRunner.query(`CREATE INDEX "IDX_449645f28147580b96d8ef8d96" ON "owner_equity_documents"  ("type") `);
        await queryRunner.query(`CREATE INDEX "IDX_8a37f14a2cd232afd2bb397439" ON "owner_equity_documents"  ("equityDate") `);
        await queryRunner.query(`ALTER TABLE "owner_equity_settlements" ADD CONSTRAINT "FK_4d07dfd32e05923f733aeb0709d" FOREIGN KEY ("equityDocumentId") REFERENCES "owner_equity_documents"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "owner_equity_settlements" ADD CONSTRAINT "FK_bbd6e14dc4271b412554e8a40af" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "owner_equity_settlements" ADD CONSTRAINT "FK_848072a5d194df5db72332d3ee2" FOREIGN KEY ("sourceSettlementId") REFERENCES "owner_equity_settlements"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "owner_equity_documents" ADD CONSTRAINT "FK_b1b1e562831bbbab5743bb54c2e" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);

        // 8. Idempotent EQ document-number row — REQUIRED for existing installs.
        //    createDefaultDocumentNumberSettings() only runs on an empty table, so
        //    without this generateDocumentNumber('Owner Equity') throws on upgrade.
        await queryRunner.query(`
          INSERT INTO document_number_settings ("documentName", prefix, "paddingDigits", "nextNumber", "lastResetYear")
          SELECT 'Owner Equity', 'EQ', 3, 1, EXTRACT(YEAR FROM CURRENT_DATE)::int % 100
          WHERE NOT EXISTS (SELECT 1 FROM document_number_settings WHERE "documentName" = 'Owner Equity')
        `);

        // 9. CHECK constraints were declared on the OwnerEquityDocument entity via
        //    @Check(name, expression) and created inline above (CHK_oe_*), matching
        //    what schema:sync emits from the entity. See spec §3.2 for the full table.
    }

    /**
     * Deliberately irreversible — it aborts before mutating anything.
     *
     * A partial revert here produces a schema that neither migration can
     * rebuild, which is strictly worse than refusing:
     *
     * 1. `accounting_settings.ownerCapitalAccountId` / `ownerDrawingsAccountId`
     *    are created by 1785238045705-InitialSchema (the genesis migration owns
     *    them, see its CREATE TABLE). Dropping them here would remove columns
     *    this migration does not own, leaving genesis' schema incomplete while
     *    genesis still believes it created them.
     * 2. `ALTER TYPE ... ADD VALUE` cannot be undone — PostgreSQL has no
     *    ALTER TYPE ... DROP VALUE. The appended members (owner_drawing,
     *    owner_drawing_reversal, the five OWNER_* posting types and
     *    OWNER_EQUITY) survive any revert.
     * 3. Journal entries and stock movements written against those values
     *    remain in `journal_entry` and `stock_movements` after the owner-equity
     *    tables are dropped, so the ledger would reference documents that no
     *    longer exist.
     *
     * To unwind Owner Equity, restore from a backup taken before this migration
     * ran. See CLAUDE.md on the migration baseline: the chain runs from the
     * genesis migration and migration failure is fatal by design.
     */
    public async down(): Promise<void> {
        throw new Error(
            'AddOwnerEquity is irreversible: accounting_settings owner columns belong to InitialSchema, ' +
            'appended enum values cannot be dropped in PostgreSQL, and journal/stock history would be ' +
            'orphaned. Restore from a pre-migration backup instead.',
        );
    }

}
