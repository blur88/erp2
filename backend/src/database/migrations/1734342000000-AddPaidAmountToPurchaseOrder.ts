import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPaidAmountToPurchaseOrder1734342000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE purchase_orders
      ADD COLUMN IF NOT EXISTS "paidAmount" DECIMAL(15,4) DEFAULT 0 NOT NULL
    `);

    // Update existing records to calculate paidAmount from vendor payments
    await queryRunner.query(`
      UPDATE purchase_orders po
      SET "paidAmount" = COALESCE((
        SELECT SUM(amount)
        FROM vendor_payments vp
        WHERE vp."purchaseOrderId" = po.id
          AND vp."deletedAt" IS NULL
      ), 0)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE purchase_orders
      DROP COLUMN IF EXISTS "paidAmount"
    `);
  }
}
