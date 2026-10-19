import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReceiptLineIdentity1792369500000 implements MigrationInterface {
  name = 'AddReceiptLineIdentity1792369500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stock_occurrences" ADD "receiptEvidenceVersion" smallint`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_occurrences" ADD CONSTRAINT "CHK_stock_occurrence_receipt_evidence_version" CHECK ("receiptEvidenceVersion" IS NULL OR ("kind" = 'receipt' AND "receiptEvidenceVersion" >= 1))`,
    );

    await queryRunner.query(
      `ALTER TABLE "stock_movements" ADD "purchaseOrderItemId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_movements" ADD CONSTRAINT "FK_060822dfc7623d639b8c187bdda" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "purchase_order_items"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_movements" ADD CONSTRAINT "CHK_stock_movement_receipt_line_occurrence" CHECK ("purchaseOrderItemId" IS NULL OR "occurrenceId" IS NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_stock_movement_occurrence_item" ON "stock_movements" ("occurrenceId", "purchaseOrderItemId") WHERE "occurrenceId" IS NOT NULL AND "purchaseOrderItemId" IS NOT NULL`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "stock_movements"."purchaseOrderItemId" IS 'Stable purchase-order item identity for receipt and reversal movements'`,
    );

    await queryRunner.query(
      `ALTER TABLE "purchase_cost_history" ADD "purchaseOrderItemId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_cost_history" ADD CONSTRAINT "FK_54f778f185d6a7cec057169ce19" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "purchase_order_items"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_cost_history" ADD CONSTRAINT "CHK_purchase_cost_history_receipt_line_occurrence" CHECK ("purchaseOrderItemId" IS NULL OR "occurrenceId" IS NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_purchase_cost_history_occurrence_item" ON "purchase_cost_history" ("occurrenceId", "purchaseOrderItemId") WHERE "occurrenceId" IS NOT NULL AND "purchaseOrderItemId" IS NOT NULL`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "purchase_cost_history"."purchaseOrderItemId" IS 'Stable purchase-order item identity for the receipt cost batch'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "stock_occurrences"."receiptEvidenceVersion" IS 'Receipt evidence version; null identifies receipts recorded before stable PO-line identity'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const evidence: {
      movement_line_count: string;
      batch_line_count: string;
      versioned_receipt_count: string;
    }[] = await queryRunner.query(`
      SELECT
        (SELECT count(*)::text FROM "stock_movements" WHERE "purchaseOrderItemId" IS NOT NULL) AS movement_line_count,
        (SELECT count(*)::text FROM "purchase_cost_history" WHERE "purchaseOrderItemId" IS NOT NULL) AS batch_line_count,
        (SELECT count(*)::text FROM "stock_occurrences" WHERE "receiptEvidenceVersion" IS NOT NULL) AS versioned_receipt_count
    `);
    const counts = evidence[0];
    if (
      BigInt(counts.movement_line_count) > 0n ||
      BigInt(counts.batch_line_count) > 0n ||
      BigInt(counts.versioned_receipt_count) > 0n
    ) {
      throw new Error(
        'Cannot revert AddReceiptLineIdentity: receipt-line identity evidence would be lost.',
      );
    }

    await queryRunner.query(`DROP INDEX "public"."UQ_purchase_cost_history_occurrence_item"`);
    await queryRunner.query(
      `ALTER TABLE "purchase_cost_history" DROP CONSTRAINT "CHK_purchase_cost_history_receipt_line_occurrence"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_cost_history" DROP CONSTRAINT "FK_54f778f185d6a7cec057169ce19"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_cost_history" DROP COLUMN "purchaseOrderItemId"`,
    );

    await queryRunner.query(`DROP INDEX "public"."UQ_stock_movement_occurrence_item"`);
    await queryRunner.query(
      `ALTER TABLE "stock_movements" DROP CONSTRAINT "CHK_stock_movement_receipt_line_occurrence"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_movements" DROP CONSTRAINT "FK_060822dfc7623d639b8c187bdda"`,
    );
    await queryRunner.query(`ALTER TABLE "stock_movements" DROP COLUMN "purchaseOrderItemId"`);

    await queryRunner.query(
      `ALTER TABLE "stock_occurrences" DROP CONSTRAINT "CHK_stock_occurrence_receipt_evidence_version"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_occurrences" DROP COLUMN "receiptEvidenceVersion"`,
    );
  }
}
