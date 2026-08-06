import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExpenseCompletedStatus1786000000000 implements MigrationInterface {
  name = 'AddExpenseCompletedStatus1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."expenses_documentstatus_enum" ADD VALUE IF NOT EXISTS 'COMPLETED'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Lossy: any remaining COMPLETED row is reclassified as DRAFT so the
    // narrowed enum can be applied.
    await queryRunner.query(
      `UPDATE "expenses" SET "documentStatus" = 'DRAFT' WHERE "documentStatus" = 'COMPLETED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."expenses_documentstatus_enum" RENAME TO "expenses_documentstatus_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."expenses_documentstatus_enum" AS ENUM('DRAFT', 'CANCELLED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses" ALTER COLUMN "documentStatus" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses" ALTER COLUMN "documentStatus" TYPE "public"."expenses_documentstatus_enum" USING "documentStatus"::text::"public"."expenses_documentstatus_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses" ALTER COLUMN "documentStatus" SET DEFAULT 'DRAFT'`,
    );
    await queryRunner.query(`DROP TYPE "public"."expenses_documentstatus_enum_old"`);
  }
}
