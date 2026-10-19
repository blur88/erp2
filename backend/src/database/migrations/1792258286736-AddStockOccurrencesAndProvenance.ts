import { MigrationInterface, QueryRunner } from "typeorm";

export class AddStockOccurrencesAndProvenance1792258286736 implements MigrationInterface {
    name = 'AddStockOccurrencesAndProvenance1792258286736'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "purchase_cost_history" DROP CONSTRAINT "FK_a200937c3bef6072ce44d760fe3"`);
        await queryRunner.query(`CREATE TYPE "public"."stock_occurrences_kind_enum" AS ENUM('receipt', 'fulfilment', 'receipt_reversal', 'fulfilment_reversal')`);
        await queryRunner.query(`CREATE TABLE "stock_occurrences" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "kind" "public"."stock_occurrences_kind_enum" NOT NULL, "documentType" character varying(30) NOT NULL, "documentId" uuid NOT NULL, "occurredAt" TIMESTAMP WITH TIME ZONE NOT NULL, "actorUserId" uuid, "actorUsername" character varying(255), "reversesOccurrenceId" uuid, "postedAmount" numeric(15,2), "isLegacy" boolean NOT NULL DEFAULT false, "legacyJournalEntryId" uuid, "reason" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_bbb531cb0d4aea5ed2b2d4604eb" PRIMARY KEY ("id")); COMMENT ON COLUMN "stock_occurrences"."kind" IS 'Kind of stock occurrence'; COMMENT ON COLUMN "stock_occurrences"."documentType" IS 'Source document type (''purchase_order'' | ''sales_order'')'; COMMENT ON COLUMN "stock_occurrences"."documentId" IS 'Source document id'; COMMENT ON COLUMN "stock_occurrences"."occurredAt" IS 'When the occurrence happened'; COMMENT ON COLUMN "stock_occurrences"."actorUserId" IS 'Actor user id'; COMMENT ON COLUMN "stock_occurrences"."actorUsername" IS 'Actor username'; COMMENT ON COLUMN "stock_occurrences"."reversesOccurrenceId" IS 'The occurrence this one reverses'; COMMENT ON COLUMN "stock_occurrences"."postedAmount" IS 'Posted amount in currency units'; COMMENT ON COLUMN "stock_occurrences"."isLegacy" IS 'Whether this occurrence refers to pre-deploy (legacy) data'; COMMENT ON COLUMN "stock_occurrences"."legacyJournalEntryId" IS 'Legacy journal entry id (when isLegacy)'; COMMENT ON COLUMN "stock_occurrences"."reason" IS 'Reason for a reversal occurrence'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_stock_occurrence_reverses" ON "stock_occurrences"  ("reversesOccurrenceId") WHERE "reversesOccurrenceId" IS NOT NULL`);
        await queryRunner.query(`CREATE TABLE "stock_batch_consumptions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "movementId" uuid NOT NULL, "batchId" uuid NOT NULL, "quantity" numeric(15,4) NOT NULL, "unitCost" numeric(15,4) NOT NULL, "valueScale8" numeric(24,8) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_7e6732fdb13b50ec7cc84409be3" PRIMARY KEY ("id")); COMMENT ON COLUMN "stock_batch_consumptions"."movementId" IS 'Stock movement id'; COMMENT ON COLUMN "stock_batch_consumptions"."batchId" IS 'Purchase cost history (batch) id'; COMMENT ON COLUMN "stock_batch_consumptions"."quantity" IS 'Quantity consumed from this batch (scale-4)'; COMMENT ON COLUMN "stock_batch_consumptions"."unitCost" IS 'Landed unit cost at consumption (scale-4)'; COMMENT ON COLUMN "stock_batch_consumptions"."valueScale8" IS 'Unrounded value (scale-8)'`);
        await queryRunner.query(`ALTER TABLE "purchase_cost_history" ADD "occurrenceId" uuid`);
        await queryRunner.query(`COMMENT ON COLUMN "purchase_cost_history"."occurrenceId" IS 'Stock occurrence id'`);
        await queryRunner.query(`ALTER TABLE "purchase_cost_history" ADD "reversedAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`COMMENT ON COLUMN "purchase_cost_history"."reversedAt" IS 'When this batch was reversed'`);
        await queryRunner.query(`ALTER TABLE "purchase_cost_history" ADD "reversedByOccurrenceId" uuid`);
        await queryRunner.query(`COMMENT ON COLUMN "purchase_cost_history"."reversedByOccurrenceId" IS 'Reversal occurrence id'`);
        await queryRunner.query(`ALTER TABLE "stock_movements" ADD "occurrenceId" uuid`);
        await queryRunner.query(`COMMENT ON COLUMN "stock_movements"."occurrenceId" IS 'Stock occurrence id'`);
        await queryRunner.query(`ALTER TABLE "stock_movements" ADD "actorUserId" uuid`);
        await queryRunner.query(`COMMENT ON COLUMN "stock_movements"."actorUserId" IS 'Actor user id'`);
        await queryRunner.query(`ALTER TABLE "stock_movements" ADD "reversesMovementId" uuid`);
        await queryRunner.query(`COMMENT ON COLUMN "stock_movements"."reversesMovementId" IS 'The movement this one reverses'`);
        await queryRunner.query(`ALTER TABLE "stock_movements" ADD "productSequence" bigint`);
        await queryRunner.query(`COMMENT ON COLUMN "stock_movements"."productSequence" IS 'Per-product sequence assigned under the product lock'`);
        await queryRunner.query(`ALTER TYPE "public"."stock_movements_movementtype_enum" ADD VALUE IF NOT EXISTS 'purchase_receipt_reversal'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_stock_movement_reverses" ON "stock_movements"  ("reversesMovementId") WHERE "reversesMovementId" IS NOT NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_stock_movement_product_sequence" ON "stock_movements"  ("productId", "productSequence") WHERE "productSequence" IS NOT NULL`);
        await queryRunner.query(`ALTER TABLE "purchase_cost_history" ADD CONSTRAINT "CHK_purchase_cost_history_reversed" CHECK (("reversedAt" IS NULL) = ("reversedByOccurrenceId" IS NULL))`);
        await queryRunner.query(`ALTER TABLE "stock_occurrences" ADD CONSTRAINT "CHK_stock_occurrence_reversal_reason_length" CHECK ("kind" NOT IN ('receipt_reversal', 'fulfilment_reversal') OR ("reason" IS NOT NULL AND char_length(btrim("reason")) BETWEEN 3 AND 500))`);
        await queryRunner.query(`ALTER TABLE "stock_batch_consumptions" ADD CONSTRAINT "CHK_stock_batch_consumptions_quantity_positive" CHECK ("quantity" > 0)`);
        await queryRunner.query(`ALTER TABLE "purchase_cost_history" ADD CONSTRAINT "FK_a200937c3bef6072ce44d760fe3" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "stock_occurrences" ADD CONSTRAINT "FK_stock_occurrences_legacy_journal" FOREIGN KEY ("legacyJournalEntryId") REFERENCES "journal_entry"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "purchase_cost_history" ADD CONSTRAINT "FK_purchase_cost_history_occurrence" FOREIGN KEY ("occurrenceId") REFERENCES "stock_occurrences"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "purchase_cost_history" ADD CONSTRAINT "FK_5c780823d6beebab76e469e2e17" FOREIGN KEY ("reversedByOccurrenceId") REFERENCES "stock_occurrences"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "stock_movements" ADD CONSTRAINT "FK_6e87ea9ab16010d08671f12b633" FOREIGN KEY ("reversesMovementId") REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "stock_movements" ADD CONSTRAINT "FK_ac607027d537535d292b28f3854" FOREIGN KEY ("occurrenceId") REFERENCES "stock_occurrences"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "stock_occurrences" ADD CONSTRAINT "FK_a803b54b23d2fb8c0fe7f5389f9" FOREIGN KEY ("reversesOccurrenceId") REFERENCES "stock_occurrences"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "stock_batch_consumptions" ADD CONSTRAINT "FK_7a90005ab332be99fb12c7d6c84" FOREIGN KEY ("movementId") REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "stock_batch_consumptions" ADD CONSTRAINT "FK_51f795684690dbcdee919a915f2" FOREIGN KEY ("batchId") REFERENCES "purchase_cost_history"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const evidence: {
            occurrence_count: string;
            allocation_count: string;
            movement_occurrence_count: string;
            reversal_movement_count: string;
            batch_occurrence_count: string;
            reversed_batch_count: string;
        }[] = await queryRunner.query(`
          SELECT
            (SELECT count(*)::text FROM "stock_occurrences") AS occurrence_count,
            (SELECT count(*)::text FROM "stock_batch_consumptions") AS allocation_count,
            (SELECT count(*)::text FROM "stock_movements" WHERE "occurrenceId" IS NOT NULL) AS movement_occurrence_count,
            (SELECT count(*)::text FROM "stock_movements"
              WHERE "reversesMovementId" IS NOT NULL
                 OR "movementType"::text = 'purchase_receipt_reversal') AS reversal_movement_count,
            (SELECT count(*)::text FROM "purchase_cost_history" WHERE "occurrenceId" IS NOT NULL) AS batch_occurrence_count,
            (SELECT count(*)::text FROM "purchase_cost_history"
              WHERE "reversedAt" IS NOT NULL OR "reversedByOccurrenceId" IS NOT NULL) AS reversed_batch_count
        `);
        const populated = Object.values(evidence[0]).some((count) => BigInt(count) > 0n);
        if (populated) {
            throw new Error(
                'Cannot revert AddStockOccurrencesAndProvenance: occurrence, allocation, or reversal evidence would be lost.',
            );
        }

        await queryRunner.query(`ALTER TABLE "stock_batch_consumptions" DROP CONSTRAINT "FK_51f795684690dbcdee919a915f2"`);
        await queryRunner.query(`ALTER TABLE "stock_batch_consumptions" DROP CONSTRAINT "FK_7a90005ab332be99fb12c7d6c84"`);
        await queryRunner.query(`ALTER TABLE "stock_occurrences" DROP CONSTRAINT "FK_a803b54b23d2fb8c0fe7f5389f9"`);
        await queryRunner.query(`ALTER TABLE "stock_movements" DROP CONSTRAINT "FK_ac607027d537535d292b28f3854"`);
        await queryRunner.query(`ALTER TABLE "stock_movements" DROP CONSTRAINT "FK_6e87ea9ab16010d08671f12b633"`);
        await queryRunner.query(`ALTER TABLE "purchase_cost_history" DROP CONSTRAINT "FK_5c780823d6beebab76e469e2e17"`);
        await queryRunner.query(`ALTER TABLE "stock_occurrences" DROP CONSTRAINT "FK_stock_occurrences_legacy_journal"`);
        await queryRunner.query(`ALTER TABLE "purchase_cost_history" DROP CONSTRAINT "FK_purchase_cost_history_occurrence"`);
        await queryRunner.query(`ALTER TABLE "purchase_cost_history" DROP CONSTRAINT "FK_a200937c3bef6072ce44d760fe3"`);
        await queryRunner.query(`ALTER TABLE "purchase_cost_history" DROP CONSTRAINT "CHK_purchase_cost_history_reversed"`);
        await queryRunner.query(`ALTER TABLE "stock_occurrences" DROP CONSTRAINT "CHK_stock_occurrence_reversal_reason_length"`);
        await queryRunner.query(`ALTER TABLE "stock_batch_consumptions" DROP CONSTRAINT "CHK_stock_batch_consumptions_quantity_positive"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_stock_movement_product_sequence"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_stock_movement_reverses"`);
        // PostgreSQL enum members cannot be removed safely. Keep the additive
        // purchase_receipt_reversal value rather than rewriting business rows.
        await queryRunner.query(`COMMENT ON COLUMN "stock_movements"."productSequence" IS 'Per-product sequence assigned under the product lock'`);
        await queryRunner.query(`ALTER TABLE "stock_movements" DROP COLUMN "productSequence"`);
        await queryRunner.query(`COMMENT ON COLUMN "stock_movements"."reversesMovementId" IS 'The movement this one reverses'`);
        await queryRunner.query(`ALTER TABLE "stock_movements" DROP COLUMN "reversesMovementId"`);
        await queryRunner.query(`COMMENT ON COLUMN "stock_movements"."actorUserId" IS 'Actor user id'`);
        await queryRunner.query(`ALTER TABLE "stock_movements" DROP COLUMN "actorUserId"`);
        await queryRunner.query(`COMMENT ON COLUMN "stock_movements"."occurrenceId" IS 'Stock occurrence id'`);
        await queryRunner.query(`ALTER TABLE "stock_movements" DROP COLUMN "occurrenceId"`);
        await queryRunner.query(`COMMENT ON COLUMN "purchase_cost_history"."reversedByOccurrenceId" IS 'Reversal occurrence id'`);
        await queryRunner.query(`ALTER TABLE "purchase_cost_history" DROP COLUMN "reversedByOccurrenceId"`);
        await queryRunner.query(`COMMENT ON COLUMN "purchase_cost_history"."reversedAt" IS 'When this batch was reversed'`);
        await queryRunner.query(`ALTER TABLE "purchase_cost_history" DROP COLUMN "reversedAt"`);
        await queryRunner.query(`COMMENT ON COLUMN "purchase_cost_history"."occurrenceId" IS 'Stock occurrence id'`);
        await queryRunner.query(`ALTER TABLE "purchase_cost_history" DROP COLUMN "occurrenceId"`);
        await queryRunner.query(`DROP TABLE "stock_batch_consumptions"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_stock_occurrence_reverses"`);
        await queryRunner.query(`DROP TABLE "stock_occurrences"`);
        await queryRunner.query(`DROP TYPE "public"."stock_occurrences_kind_enum"`);
        await queryRunner.query(`ALTER TABLE "purchase_cost_history" ADD CONSTRAINT "FK_a200937c3bef6072ce44d760fe3" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
