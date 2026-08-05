import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExpenseOverpaidStatus1785900000000 implements MigrationInterface {
  name = 'AddExpenseOverpaidStatus1785900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."expenses_paymentstatus_enum" ADD VALUE IF NOT EXISTS 'OVERPAID'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Lossy: overpaid expenses are reclassified as exactly paid.
    await queryRunner.query(
      `UPDATE "expenses" SET "paymentStatus" = 'PAID' WHERE "paymentStatus" = 'OVERPAID'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."expenses_paymentstatus_enum" RENAME TO "expenses_paymentstatus_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."expenses_paymentstatus_enum" AS ENUM('UNPAID', 'PARTIAL', 'PAID')`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses" ALTER COLUMN "paymentStatus" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses" ALTER COLUMN "paymentStatus" TYPE "public"."expenses_paymentstatus_enum" USING "paymentStatus"::text::"public"."expenses_paymentstatus_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses" ALTER COLUMN "paymentStatus" SET DEFAULT 'UNPAID'`,
    );
    await queryRunner.query(`DROP TYPE "public"."expenses_paymentstatus_enum_old"`);
  }
}
