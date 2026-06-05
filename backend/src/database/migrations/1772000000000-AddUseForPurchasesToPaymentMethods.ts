import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUseForPurchasesToPaymentMethods1772000000000 implements MigrationInterface {
  name = 'AddUseForPurchasesToPaymentMethods1772000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payment_methods"
      ADD COLUMN IF NOT EXISTS "useForPurchases" boolean NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payment_methods"
      DROP COLUMN "useForPurchases"
    `);
  }
}
