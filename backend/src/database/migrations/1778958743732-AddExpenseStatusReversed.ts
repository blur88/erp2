import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExpenseStatusReversed1778958743732 implements MigrationInterface {
  name = 'AddExpenseStatusReversed1778958743732';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "public"."expenses_status_enum" ADD VALUE 'reversed'`);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values; down is intentionally a no-op.
  }
}
