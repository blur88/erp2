import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemovePaymentTypeField1771100000000 implements MigrationInterface {
  name = 'RemovePaymentTypeField1771100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if type column exists before dropping it
    const typeColumnExists = await queryRunner.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'payments' AND column_name = 'type'
    `);

    if (typeColumnExists.length > 0) {
      // Drop the type column from payments table
      await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "type"`);

      // Drop the enum type
      await queryRunner.query(`DROP TYPE "payments_type_enum"`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Check if type column doesn't exist before adding it
    const typeColumnExists = await queryRunner.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'payments' AND column_name = 'type'
    `);

    if (typeColumnExists.length === 0) {
      // Re-create the enum type
      await queryRunner.query(`CREATE TYPE "payments_type_enum" AS ENUM('payment')`);

      // Re-add the type column
      await queryRunner.query(`ALTER TABLE "payments" ADD "type" "payments_type_enum" NOT NULL DEFAULT 'payment'`);
    }
  }
}