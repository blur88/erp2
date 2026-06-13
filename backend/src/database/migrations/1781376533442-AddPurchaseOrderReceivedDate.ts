import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPurchaseOrderReceivedDate1781376533442 implements MigrationInterface {
  name = 'AddPurchaseOrderReceivedDate1781376533442';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "purchase_orders"
      ADD COLUMN IF NOT EXISTS "receivedDate" date
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "purchase_orders"."receivedDate"
      IS 'Date goods were received (set on RECEIVED transition)'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "purchase_orders"
      DROP COLUMN IF EXISTS "receivedDate"
    `);
  }
}
