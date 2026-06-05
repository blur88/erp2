import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandPaymentNumberLength1779100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payments" ALTER COLUMN "paymentNumber" TYPE varchar(50)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payments" ALTER COLUMN "paymentNumber" TYPE varchar(30)`,
    );
  }
}
