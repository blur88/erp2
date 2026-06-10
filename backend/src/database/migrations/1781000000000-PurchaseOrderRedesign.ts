import { MigrationInterface, QueryRunner } from 'typeorm';

export class PurchaseOrderRedesign1781000000000 implements MigrationInterface {
  name = 'PurchaseOrderRedesign1781000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "purchase_orders"
      ADD COLUMN IF NOT EXISTS "status" varchar(20) NOT NULL DEFAULT 'DRAFT'
    `);

    await queryRunner.query(`
      ALTER TABLE "purchase_orders"
      ADD COLUMN IF NOT EXISTS "paymentStatus" varchar(20) NOT NULL DEFAULT 'UNPAID'
    `);

    await queryRunner.query(`
      UPDATE "purchase_orders" po
      SET "paymentStatus" = CASE
        WHEN COALESCE(po."paidAmount", 0) <= 0 THEN 'UNPAID'
        WHEN COALESCE(po."paidAmount", 0) < COALESCE(po."totalAmount", 0) THEN 'PARTIAL'
        WHEN COALESCE(po."paidAmount", 0) = COALESCE(po."totalAmount", 0) THEN 'PAID'
        ELSE 'OVERPAID'
      END
    `);

    await queryRunner.query(`
      UPDATE "purchase_orders" po
      SET "status" = CASE
        WHEN po."deletedAt" IS NOT NULL THEN 'CANCELLED'
        WHEN EXISTS (
          SELECT 1 FROM "purchase_order_items" poi
          WHERE poi."purchaseOrderId" = po."id"
        )
        AND NOT EXISTS (
          SELECT 1
          FROM "purchase_order_items" poi
          WHERE poi."purchaseOrderId" = po."id"
            AND COALESCE(poi."receivedQuantity", 0) < COALESCE(poi."quantity", 0)
        ) THEN 'RECEIVED'
        WHEN COALESCE(po."paidAmount", 0) >= COALESCE(po."totalAmount", 0)
          AND COALESCE(po."totalAmount", 0) > 0 THEN 'READY'
        ELSE 'DRAFT'
      END
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_purchase_orders_status" ON "purchase_orders" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_purchase_orders_paymentStatus" ON "purchase_orders" ("paymentStatus")
    `);

    await queryRunner.query(`
      ALTER TABLE "purchase_cost_history"
      ADD COLUMN IF NOT EXISTS "purchaseOrderId" uuid
    `);
    await queryRunner.query(`
      UPDATE "purchase_cost_history" pch
      SET "purchaseOrderId" = g."purchaseOrderId"
      FROM "goods_received_notes" g
      WHERE pch."grnId" = g."id"
    `);
    await queryRunner.query(`
      ALTER TABLE "purchase_cost_history"
      DROP COLUMN IF EXISTS "grnId"
    `);

    await queryRunner.query(`
      ALTER TABLE "vendor_payments"
      ADD COLUMN IF NOT EXISTS "purchaseOrderId" uuid
    `);
    await queryRunner.query(`
      UPDATE "vendor_payments" vp
      SET "purchaseOrderId" = g."purchaseOrderId"
      FROM "goods_received_notes" g
      WHERE vp."grnId" = g."id"
        AND vp."purchaseOrderId" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "vendor_payments"
      DROP COLUMN IF EXISTS "grnId"
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "goods_received_note_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "goods_received_notes"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vendor_payments"
      ADD COLUMN IF NOT EXISTS "grnId" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "purchase_cost_history"
      ADD COLUMN IF NOT EXISTS "grnId" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "purchase_cost_history"
      DROP COLUMN IF EXISTS "purchaseOrderId"
    `);

    await queryRunner.query(`
      ALTER TABLE "purchase_orders"
      DROP COLUMN IF EXISTS "paymentStatus"
    `);

    await queryRunner.query(`
      ALTER TABLE "purchase_orders"
      DROP COLUMN IF EXISTS "status"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_purchase_orders_status"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_purchase_orders_paymentStatus"
    `);
  }
}
