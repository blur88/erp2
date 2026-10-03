import { MigrationInterface, QueryRunner } from "typeorm";

export class AddBankStatementReconciliations1791044381374 implements MigrationInterface {
    name = 'AddBankStatementReconciliations1791044381374'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Migration gate: abort if legacy tables or any of the 5 new tables exist.
        const existingTables: Array<{ table_name: string }> = await queryRunner.query(
            `SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()`
        );
        const existingTableNames = new Set(existingTables.map((r) => r.table_name));

        const legacyNames = ['bank_reconciliations', 'reconciled_transactions'].filter((t) => existingTableNames.has(t));
        if (legacyNames.length > 0) {
            throw new Error(`AddBankStatementReconciliations aborted: legacy reconciliation tables present: ${legacyNames.join(', ')}. Resolve them through a separately reviewed plan; nothing was changed.`);
        }

        const newTableNames = [
            'bank_statement_reconciliations',
            'bank_statement_reconciliation_lines',
            'bank_statement_reconciliation_setup_marks',
            'bank_statement_reconciliation_versions',
            'bank_statement_reconciliation_version_lines',
        ];
        const unexpectedNames = newTableNames.filter((t) => existingTableNames.has(t));
        if (unexpectedNames.length > 0) {
            throw new Error(`AddBankStatementReconciliations aborted: unexpected existing tables: ${unexpectedNames.join(', ')}. Nothing was changed.`);
        }

        // 2. DDL for the 5 bank reconciliation tables, enums, indexes and foreign keys.
        await queryRunner.query(`CREATE TYPE "public"."bank_statement_reconciliations_status_enum" AS ENUM('DRAFT', 'COMPLETED')`);
        await queryRunner.query(`CREATE TABLE "bank_statement_reconciliations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "reconciliationNo" character varying(30) NOT NULL, "bankAccountId" uuid NOT NULL, "sequenceNo" integer NOT NULL, "periodFrom" date NOT NULL, "periodTo" date NOT NULL, "openingBalance" numeric(18,4) NOT NULL, "closingBalance" numeric(18,4) NOT NULL, "status" "public"."bank_statement_reconciliations_status_enum" NOT NULL DEFAULT 'DRAFT', "currentVersionNo" integer, "lockVersion" integer NOT NULL DEFAULT '1', "completedAt" TIMESTAMP WITH TIME ZONE, "completedBy" character varying(120), "reopenedAt" TIMESTAMP WITH TIME ZONE, "reopenedBy" character varying(120), CONSTRAINT "UQ_9effc1dc31680d834988418f49f" UNIQUE ("reconciliationNo"), CONSTRAINT "CHK_bsr_completed_shape" CHECK (status <> 'COMPLETED' OR ("currentVersionNo" IS NOT NULL AND "reopenedAt" IS NULL AND "reopenedBy" IS NULL)), CONSTRAINT "CHK_bsr_period" CHECK ("periodFrom" <= "periodTo"), CONSTRAINT "PK_5dc16c92d536712e8d37d82eab1" PRIMARY KEY ("id")); COMMENT ON COLUMN "bank_statement_reconciliations"."isActive" IS 'Soft delete flag for performance queries'`);
        await queryRunner.query(`CREATE INDEX "IDX_1054c0ac84fcc435556eb6d097" ON "bank_statement_reconciliations"  ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_5590c4f310132c98a05c454630" ON "bank_statement_reconciliations"  ("periodTo") `);
        await queryRunner.query(`CREATE INDEX "IDX_2f4dc0ba113c6e4ba2cda27055" ON "bank_statement_reconciliations"  ("bankAccountId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_bsr_account_sequence" ON "bank_statement_reconciliations"  ("bankAccountId", "sequenceNo") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_bsr_one_draft_per_account" ON "bank_statement_reconciliations"  ("bankAccountId") WHERE status = 'DRAFT'`);
        await queryRunner.query(`CREATE TYPE "public"."bank_statement_reconciliation_lines_kind_enum" AS ENUM('MATCHED', 'OPENING_CLEARED')`);
        await queryRunner.query(`CREATE TABLE "bank_statement_reconciliation_lines" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "reconciliationId" uuid NOT NULL, "journalEntryLineId" uuid NOT NULL, "kind" "public"."bank_statement_reconciliation_lines_kind_enum" NOT NULL, "addedBy" character varying(120) NOT NULL, "addedAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_9c554c29ec052f2e6688879eedb" PRIMARY KEY ("id")); COMMENT ON COLUMN "bank_statement_reconciliation_lines"."isActive" IS 'Soft delete flag for performance queries'`);
        await queryRunner.query(`CREATE INDEX "IDX_cb1a72da1f157afbc398d5c77a" ON "bank_statement_reconciliation_lines"  ("reconciliationId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_bsr_line_journal_line" ON "bank_statement_reconciliation_lines"  ("journalEntryLineId") `);
        await queryRunner.query(`CREATE TABLE "bank_statement_reconciliation_setup_marks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "reconciliationId" uuid NOT NULL, "journalEntryLineId" uuid NOT NULL, "markedBy" character varying(120) NOT NULL, "markedAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_5e1d34a25b2e9e480f78da2c8e3" PRIMARY KEY ("id")); COMMENT ON COLUMN "bank_statement_reconciliation_setup_marks"."isActive" IS 'Soft delete flag for performance queries'`);
        await queryRunner.query(`CREATE INDEX "IDX_3e667c80a964fcc1e79be68a80" ON "bank_statement_reconciliation_setup_marks"  ("journalEntryLineId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_bsr_mark" ON "bank_statement_reconciliation_setup_marks"  ("reconciliationId", "journalEntryLineId") `);
        await queryRunner.query(`CREATE TABLE "bank_statement_reconciliation_versions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "reconciliationId" uuid NOT NULL, "versionNo" integer NOT NULL, "reconciliationNo" character varying(30) NOT NULL, "sequenceNo" integer NOT NULL, "bankAccountId" uuid NOT NULL, "bankAccountCode" character varying(50) NOT NULL, "bankAccountName" character varying(200) NOT NULL, "periodFrom" date NOT NULL, "periodTo" date NOT NULL, "openingBalance" numeric(18,4) NOT NULL, "closingBalance" numeric(18,4) NOT NULL, "moneyInTotal" numeric(18,4), "moneyOutTotal" numeric(18,4), "calculatedClosingBalance" numeric(18,4), "difference" numeric(18,4), "openingClearedNet" numeric(18,4), "openingBalanceDifference" numeric(18,4), "completedBy" character varying(120), "completedAt" TIMESTAMP WITH TIME ZONE, "sealedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_c274358a6f019a659d90a7e12e9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c37b68ba4562dcc4fa026cf91f" ON "bank_statement_reconciliation_versions"  ("bankAccountId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_bsr_version_no" ON "bank_statement_reconciliation_versions"  ("reconciliationId", "versionNo") `);
        await queryRunner.query(`CREATE TYPE "public"."bank_statement_reconciliation_version_lines_role_enum" AS ENUM('MATCHED', 'OUTSTANDING', 'OPENING_CLEARED')`);
        await queryRunner.query(`CREATE TABLE "bank_statement_reconciliation_version_lines" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "versionId" uuid NOT NULL, "journalEntryLineId" uuid NOT NULL, "role" "public"."bank_statement_reconciliation_version_lines_role_enum" NOT NULL, "entryDate" date NOT NULL, "journalEntryId" uuid NOT NULL, "journalNo" character varying(50) NOT NULL, "sourceType" character varying(50) NOT NULL, "sourceDocumentId" uuid, "sourceRef" character varying(100), "description" text, "moneyIn" numeric(18,4) NOT NULL, "moneyOut" numeric(18,4) NOT NULL, "addedBy" character varying(120), "addedAt" TIMESTAMP WITH TIME ZONE, "setupMarked" boolean NOT NULL DEFAULT false, "setupMarkedBy" character varying(120), "setupMarkedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "CHK_bsr_vline_cleared_unmarked" CHECK (role <> 'OPENING_CLEARED' OR "setupMarked" = false), CONSTRAINT "PK_09aea794fec26ce6427305d12a1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_85326b3d6654db2471c1c124ef" ON "bank_statement_reconciliation_version_lines"  ("journalEntryLineId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_bsr_version_line" ON "bank_statement_reconciliation_version_lines"  ("versionId", "journalEntryLineId") `);
        await queryRunner.query(`ALTER TABLE "bank_statement_reconciliations" ADD CONSTRAINT "FK_2f4dc0ba113c6e4ba2cda27055a" FOREIGN KEY ("bankAccountId") REFERENCES "chart_of_account"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bank_statement_reconciliation_lines" ADD CONSTRAINT "FK_cb1a72da1f157afbc398d5c77a0" FOREIGN KEY ("reconciliationId") REFERENCES "bank_statement_reconciliations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bank_statement_reconciliation_lines" ADD CONSTRAINT "FK_738d25d520fc505e0277b5eff2c" FOREIGN KEY ("journalEntryLineId") REFERENCES "journal_entry_line"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bank_statement_reconciliation_setup_marks" ADD CONSTRAINT "FK_26f8bf9639b802241838e6bbd3b" FOREIGN KEY ("reconciliationId") REFERENCES "bank_statement_reconciliations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bank_statement_reconciliation_setup_marks" ADD CONSTRAINT "FK_3e667c80a964fcc1e79be68a808" FOREIGN KEY ("journalEntryLineId") REFERENCES "journal_entry_line"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bank_statement_reconciliation_versions" ADD CONSTRAINT "FK_9f0a0f02668e3b7fe8a3b5d01a5" FOREIGN KEY ("reconciliationId") REFERENCES "bank_statement_reconciliations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bank_statement_reconciliation_versions" ADD CONSTRAINT "FK_c37b68ba4562dcc4fa026cf91f6" FOREIGN KEY ("bankAccountId") REFERENCES "chart_of_account"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bank_statement_reconciliation_version_lines" ADD CONSTRAINT "FK_f4f641540beb7d3f91d50f571ca" FOREIGN KEY ("versionId") REFERENCES "bank_statement_reconciliation_versions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bank_statement_reconciliation_version_lines" ADD CONSTRAINT "FK_85326b3d6654db2471c1c124efc" FOREIGN KEY ("journalEntryLineId") REFERENCES "journal_entry_line"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);

        // 3. Idempotent document_number_settings insert for Bank Reconciliations.
        await queryRunner.query(`
          INSERT INTO document_number_settings ("documentName", prefix, "paddingDigits", "nextNumber", "lastResetYear")
          SELECT 'Bank Reconciliations', 'BR', 3, 1, EXTRACT(YEAR FROM CURRENT_DATE)::int % 100
          WHERE NOT EXISTS (
            SELECT 1 FROM document_number_settings WHERE "documentName" = 'Bank Reconciliations')
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Refuse down if any version rows exist
        const tableCheck = await queryRunner.query(
            `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'bank_statement_reconciliation_versions'`
        );
        if (tableCheck.length > 0) {
            const versionsCountResult = await queryRunner.query(
                `SELECT COUNT(*)::int AS count FROM "bank_statement_reconciliation_versions"`
            );
            const count = versionsCountResult[0]?.count ?? 0;
            if (count > 0) {
                throw new Error(`AddBankStatementReconciliations cannot be reverted: completion history exists (${count} versions).`);
            }
        }

        // Drop triggers if exist (added in Task 2)
        await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_bsr_current_version_sealed" ON "bank_statement_reconciliations"`);
        await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_bsr_version_sealed_at_commit" ON "bank_statement_reconciliation_versions"`);
        await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_bsr_version_line_guard" ON "bank_statement_reconciliation_version_lines"`);
        await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_bsr_version_guard" ON "bank_statement_reconciliation_versions"`);
        await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_bsr_mark_immutable_ids" ON "bank_statement_reconciliation_setup_marks"`);
        await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_bsr_line_immutable_ids" ON "bank_statement_reconciliation_lines"`);
        await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_bsr_mark_classification" ON "bank_statement_reconciliation_setup_marks"`);
        await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_bsr_line_classification" ON "bank_statement_reconciliation_lines"`);

        // Drop functions if exist (added in Task 2)
        await queryRunner.query(`DROP FUNCTION IF EXISTS "bsr_guard_current_version"() CASCADE`);
        await queryRunner.query(`DROP FUNCTION IF EXISTS "bsr_assert_version_sealed"() CASCADE`);
        await queryRunner.query(`DROP FUNCTION IF EXISTS "bsr_guard_version_line"() CASCADE`);
        await queryRunner.query(`DROP FUNCTION IF EXISTS "bsr_guard_version"() CASCADE`);
        await queryRunner.query(`DROP FUNCTION IF EXISTS "bsr_guard_immutable_ids"() CASCADE`);
        await queryRunner.query(`DROP FUNCTION IF EXISTS "bsr_guard_classification"() CASCADE`);

        // Drop migration-only FK if exists (added in Task 2)
        await queryRunner.query(`ALTER TABLE "bank_statement_reconciliations" DROP CONSTRAINT IF EXISTS "FK_bsr_current_version"`);

        // Drop foreign keys
        await queryRunner.query(`ALTER TABLE "bank_statement_reconciliation_version_lines" DROP CONSTRAINT IF EXISTS "FK_85326b3d6654db2471c1c124efc"`);
        await queryRunner.query(`ALTER TABLE "bank_statement_reconciliation_version_lines" DROP CONSTRAINT IF EXISTS "FK_f4f641540beb7d3f91d50f571ca"`);
        await queryRunner.query(`ALTER TABLE "bank_statement_reconciliation_versions" DROP CONSTRAINT IF EXISTS "FK_c37b68ba4562dcc4fa026cf91f6"`);
        await queryRunner.query(`ALTER TABLE "bank_statement_reconciliation_versions" DROP CONSTRAINT IF EXISTS "FK_9f0a0f02668e3b7fe8a3b5d01a5"`);
        await queryRunner.query(`ALTER TABLE "bank_statement_reconciliation_setup_marks" DROP CONSTRAINT IF EXISTS "FK_3e667c80a964fcc1e79be68a808"`);
        await queryRunner.query(`ALTER TABLE "bank_statement_reconciliation_setup_marks" DROP CONSTRAINT IF EXISTS "FK_26f8bf9639b802241838e6bbd3b"`);
        await queryRunner.query(`ALTER TABLE "bank_statement_reconciliation_lines" DROP CONSTRAINT IF EXISTS "FK_738d25d520fc505e0277b5eff2c"`);
        await queryRunner.query(`ALTER TABLE "bank_statement_reconciliation_lines" DROP CONSTRAINT IF EXISTS "FK_cb1a72da1f157afbc398d5c77a0"`);
        await queryRunner.query(`ALTER TABLE "bank_statement_reconciliations" DROP CONSTRAINT IF EXISTS "FK_2f4dc0ba113c6e4ba2cda27055a"`);

        // Drop indexes and tables
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."UQ_bsr_version_line"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_85326b3d6654db2471c1c124ef"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "bank_statement_reconciliation_version_lines"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."bank_statement_reconciliation_version_lines_role_enum"`);

        await queryRunner.query(`DROP INDEX IF EXISTS "public"."UQ_bsr_version_no"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_c37b68ba4562dcc4fa026cf91f"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "bank_statement_reconciliation_versions"`);

        await queryRunner.query(`DROP INDEX IF EXISTS "public"."UQ_bsr_mark"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_3e667c80a964fcc1e79be68a80"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "bank_statement_reconciliation_setup_marks"`);

        await queryRunner.query(`DROP INDEX IF EXISTS "public"."UQ_bsr_line_journal_line"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_cb1a72da1f157afbc398d5c77a"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "bank_statement_reconciliation_lines"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."bank_statement_reconciliation_lines_kind_enum"`);

        await queryRunner.query(`DROP INDEX IF EXISTS "public"."UQ_bsr_one_draft_per_account"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."UQ_bsr_account_sequence"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_2f4dc0ba113c6e4ba2cda27055"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_5590c4f310132c98a05c454630"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_1054c0ac84fcc435556eb6d097"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "bank_statement_reconciliations"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."bank_statement_reconciliations_status_enum"`);

        // Delete document_number_settings row
        await queryRunner.query(`DELETE FROM document_number_settings WHERE "documentName" = 'Bank Reconciliations'`);
    }
}
