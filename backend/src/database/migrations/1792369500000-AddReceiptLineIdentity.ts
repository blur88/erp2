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
      `ALTER TABLE "stock_movements" ADD CONSTRAINT "FK_stock_movements_purchase_order_item" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "purchase_order_items"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_movements" ADD CONSTRAINT "CHK_stock_movement_receipt_line_occurrence" CHECK ("purchaseOrderItemId" IS NULL OR "occurrenceId" IS NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_stock_movement_occurrence_item" ON "stock_movements" ("occurrenceId", "purchaseOrderItemId") WHERE "occurrenceId" IS NOT NULL AND "purchaseOrderItemId" IS NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "purchase_cost_history" ADD "purchaseOrderItemId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_cost_history" ADD CONSTRAINT "FK_purchase_cost_history_purchase_order_item" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "purchase_order_items"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_cost_history" ADD CONSTRAINT "CHK_purchase_cost_history_receipt_line_occurrence" CHECK ("purchaseOrderItemId" IS NULL OR "occurrenceId" IS NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_purchase_cost_history_occurrence_item" ON "purchase_cost_history" ("occurrenceId", "purchaseOrderItemId") WHERE "occurrenceId" IS NOT NULL AND "purchaseOrderItemId" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."UQ_purchase_cost_history_occurrence_item"`);
    await queryRunner.query(
      `ALTER TABLE "purchase_cost_history" DROP CONSTRAINT "CHK_purchase_cost_history_receipt_line_occurrence"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_cost_history" DROP CONSTRAINT "FK_purchase_cost_history_purchase_order_item"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_cost_history" DROP COLUMN "purchaseOrderItemId"`,
    );

    await queryRunner.query(`DROP INDEX "public"."UQ_stock_movement_occurrence_item"`);
    await queryRunner.query(
      `ALTER TABLE "stock_movements" DROP CONSTRAINT "CHK_stock_movement_receipt_line_occurrence"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_movements" DROP CONSTRAINT "FK_stock_movements_purchase_order_item"`,
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
