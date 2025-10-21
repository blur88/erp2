import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemovePaymentTypeField1771100000000 implements MigrationInterface {
  name = 'RemovePaymentTypeField1771100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the type column from payments table
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "type"`);

    // Drop the enum type
    await queryRunner.query(`DROP TYPE "payments_type_enum"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-create the enum type
    await queryRunner.query(`CREATE TYPE "payments_type_enum" AS ENUM('payment')`);

    // Re-add the type column
    await queryRunner.query(`ALTER TABLE "payments" ADD "type" "payments_type_enum" NOT NULL DEFAULT 'payment'`);
  }
}