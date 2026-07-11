import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAccountingChannelToPaymentMethods1783700000000 implements MigrationInterface {
  name = 'AddAccountingChannelToPaymentMethods1783700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment_methods" ADD COLUMN "accountingChannel" character varying(4) NOT NULL DEFAULT 'BANK'`,
    );
    await queryRunner.query(
      `UPDATE "payment_methods" SET "accountingChannel" = 'CASH' WHERE upper("code") = 'CASH'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment_methods" DROP COLUMN IF EXISTS "accountingChannel"`,
    );
  }
}
