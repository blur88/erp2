import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveTaxStatusPriorityFromPurchaseOrders1759200000000 implements MigrationInterface {
    name = 'RemoveTaxStatusPriorityFromPurchaseOrders1759200000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Remove status, priority, and tax fields from purchase_orders table
        // These fields are being removed to simplify the purchase order system

        // Drop indexes first
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_purchase_orders_status"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_purchase_orders_priority"`);

        // Remove columns
        await queryRunner.query(`ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "status"`);
        await queryRunner.query(`ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "priority"`);
        await queryRunner.query(`ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "taxPercent"`);
        await queryRunner.query(`ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "taxAmount"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Add back the removed fields in case we need to rollback
        await queryRunner.query(`ALTER TABLE "purchase_orders" ADD "status" VARCHAR DEFAULT 'draft'`);
        await queryRunner.query(`ALTER TABLE "purchase_orders" ADD "priority" VARCHAR DEFAULT 'normal'`);
        await queryRunner.query(`ALTER TABLE "purchase_orders" ADD "taxPercent" NUMERIC(5,2) DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "purchase_orders" ADD "taxAmount" NUMERIC(15,4) DEFAULT '0'`);

        // Recreate indexes
        await queryRunner.query(`CREATE INDEX "IDX_purchase_orders_status" ON "purchase_orders" ("status")`);
        await queryRunner.query(`CREATE INDEX "IDX_purchase_orders_priority" ON "purchase_orders" ("priority")`);
    }
}
