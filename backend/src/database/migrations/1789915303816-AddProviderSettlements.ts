import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProviderSettlements1789915303816 implements MigrationInterface {
    name = 'AddProviderSettlements1789915303816'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Generated with `migration:generate`, then hand-trimmed: schema:sync
        // drift unrelated to provider settlements (the migration-only partial
        // index UQ_price_lists_single_default, a journal-entry index recreation,
        // and expenses/redis column defaults) was removed from the output. This
        // migration owns only the provider-settlement schema and its doc series.
        //
        // The two ALTER TYPE ... ADD VALUE statements append last, matching the
        // enum declaration order in common/accounting-posting/enums.ts — the
        // migrated schema and the schema:sync reference must agree on order.
        // Nothing below reads the appended value, so adding it inside this
        // migration's transaction is safe: Postgres forbids USING a value added
        // in the same transaction, not adding one.
        await queryRunner.query(`ALTER TYPE "public"."journal_entry_sourcetype_enum" ADD VALUE 'PROVIDER_SETTLEMENT'`);
        await queryRunner.query(`ALTER TYPE "public"."journal_entry_postingtype_enum" ADD VALUE 'PROVIDER_SETTLEMENT'`);
        await queryRunner.query(`CREATE TYPE "public"."provider_settlements_status_enum" AS ENUM('DRAFT', 'POSTED', 'REVERSED')`);
        await queryRunner.query(`CREATE TABLE "provider_settlements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "referenceNumber" character varying(30) NOT NULL, "providerPaymentMethodId" uuid NOT NULL, "clearingAccountId" uuid NOT NULL, "bankAccountId" uuid NOT NULL, "settlementDate" date NOT NULL, "providerReference" character varying(200), "settlementAmount" numeric(18,4) NOT NULL, "status" "public"."provider_settlements_status_enum" NOT NULL DEFAULT 'DRAFT', "journalEntryId" uuid, "reversalJournalEntryId" uuid, "postedAt" TIMESTAMP WITH TIME ZONE, "postedBy" character varying(120), "reversedAt" TIMESTAMP WITH TIME ZONE, "reversedBy" character varying(120), CONSTRAINT "UQ_ec3eb8029ebf9bb2517c3315054" UNIQUE ("referenceNumber"), CONSTRAINT "CHK_ps_amount_positive" CHECK ("settlementAmount" > 0), CONSTRAINT "CHK_ps_reversed_shape" CHECK (status <> 'REVERSED' OR ("journalEntryId" IS NOT NULL AND "postedAt" IS NOT NULL AND "postedBy" IS NOT NULL AND "reversalJournalEntryId" IS NOT NULL AND "reversedAt" IS NOT NULL AND "reversedBy" IS NOT NULL)), CONSTRAINT "CHK_ps_posted_shape" CHECK (status <> 'POSTED' OR ("journalEntryId" IS NOT NULL AND "postedAt" IS NOT NULL AND "postedBy" IS NOT NULL AND "reversalJournalEntryId" IS NULL AND "reversedAt" IS NULL AND "reversedBy" IS NULL)), CONSTRAINT "CHK_ps_draft_shape" CHECK (status <> 'DRAFT' OR ("journalEntryId" IS NULL AND "postedAt" IS NULL AND "postedBy" IS NULL AND "reversalJournalEntryId" IS NULL AND "reversedAt" IS NULL AND "reversedBy" IS NULL)), CONSTRAINT "PK_f3fc5c525a99fad937b63791da6" PRIMARY KEY ("id")); COMMENT ON COLUMN "provider_settlements"."isActive" IS 'Soft delete flag for performance queries'`);
        await queryRunner.query(`CREATE INDEX "IDX_8e600ce3ab76929227f2d95a7f" ON "provider_settlements"  ("providerReference") `);
        await queryRunner.query(`CREATE INDEX "IDX_4c093b8ddc63db01095ac54424" ON "provider_settlements"  ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_c7abe75ed482923648bb42abb9" ON "provider_settlements"  ("providerPaymentMethodId") `);
        await queryRunner.query(`CREATE INDEX "IDX_3e40c9665c3cea878f31088d71" ON "provider_settlements"  ("settlementDate") `);
        await queryRunner.query(`CREATE TABLE "provider_settlement_lines" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "settlementId" uuid NOT NULL, "salesOrderPaymentId" uuid NOT NULL, "amount" numeric(18,4) NOT NULL, "releasedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_db5f259660bb2d269901fd4c78f" PRIMARY KEY ("id")); COMMENT ON COLUMN "provider_settlement_lines"."isActive" IS 'Soft delete flag for performance queries'`);
        await queryRunner.query(`CREATE INDEX "IDX_19586a60d6e2f5a2d5e90d8e47" ON "provider_settlement_lines"  ("settlementId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_886b6f559ab60cc5167ca3896b" ON "provider_settlement_lines"  ("salesOrderPaymentId") WHERE "releasedAt" IS NULL`);
        // 7 FKs below are all provider-settlement-owned; ON DELETE choices come
        // from the entities (RESTRICT for ledger/account/payment references,
        // CASCADE for the line's parent settlement).
        await queryRunner.query(`ALTER TABLE "provider_settlements" ADD CONSTRAINT "FK_c7abe75ed482923648bb42abb9b" FOREIGN KEY ("providerPaymentMethodId") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "provider_settlements" ADD CONSTRAINT "FK_0421e790ee1370d6ecd4cd7c0f3" FOREIGN KEY ("clearingAccountId") REFERENCES "chart_of_account"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "provider_settlements" ADD CONSTRAINT "FK_a635e97501d70911e0fb8d1bc02" FOREIGN KEY ("bankAccountId") REFERENCES "chart_of_account"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "provider_settlements" ADD CONSTRAINT "FK_3a7c0e2378332927111a4a70fb6" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entry"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "provider_settlements" ADD CONSTRAINT "FK_4c1485171fe5f88a0ea71727f52" FOREIGN KEY ("reversalJournalEntryId") REFERENCES "journal_entry"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "provider_settlement_lines" ADD CONSTRAINT "FK_19586a60d6e2f5a2d5e90d8e474" FOREIGN KEY ("settlementId") REFERENCES "provider_settlements"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "provider_settlement_lines" ADD CONSTRAINT "FK_e3170f1c64120b99fe9d08f2245" FOREIGN KEY ("salesOrderPaymentId") REFERENCES "sales_order_payments"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);

        // Idempotent PS document-number row — REQUIRED for existing installs.
        // createDefaultDocumentNumberSettings() only runs on an empty table, so
        // without this generateDocumentNumber('Provider Settlements') throws on
        // upgrade. Same guard as the EQ row in 1786862759868-AddOwnerEquity.
        await queryRunner.query(`
          INSERT INTO document_number_settings ("documentName", prefix, "paddingDigits", "nextNumber", "lastResetYear")
          SELECT 'Provider Settlements', 'PS', 3, 1, EXTRACT(YEAR FROM CURRENT_DATE)::int % 100
          WHERE NOT EXISTS (
            SELECT 1 FROM document_number_settings WHERE "documentName" = 'Provider Settlements')
        `);
    }

    /**
     * Deliberately irreversible — it aborts before mutating anything.
     *
     * The generator emitted a destructive down() that dropped both tables and
     * restored the old enums by recreating them. That unwind is a lie:
     *
     * 1. `ALTER TYPE ... ADD VALUE` cannot be undone — PostgreSQL has no
     *    ALTER TYPE ... DROP VALUE. 'PROVIDER_SETTLEMENT' survives any revert,
     *    so the recreated enum definitions would not match this migration's
     *    starting state either.
     * 2. Once a settlement has posted, its journal entries reference
     *    provider_settlements.id. Dropping the tables orphans those entries in
     *    the ledger instead of reversing them.
     * 3. The document_number_settings PS row would be left behind pointing at a
     *    table that no longer exists.
     *
     * A down() that appears to work while leaving the database inconsistent is
     * worse than one that refuses. To unwind, restore from a backup taken
     * before this migration ran. Same policy as 1786862759868-AddOwnerEquity.
     */
    public async down(): Promise<void> {
        throw new Error(
            'AddProviderSettlements is irreversible: appended enum values cannot be dropped ' +
            'in PostgreSQL, and posted settlements own journal entries that would be orphaned. ' +
            'Restore from a pre-migration backup instead.',
        );
    }

}
