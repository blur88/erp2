import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakePaymentRecordedByUserIdNullable1759400000000 implements MigrationInterface {
  name = 'MakePaymentRecordedByUserIdNullable1759400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Make recordedByUserId column nullable in payments table
    await queryRunner.query(`
      ALTER TABLE payments
      ALTER COLUMN "recordedByUserId" DROP NOT NULL
    `);

    // Update the foreign key constraint to SET NULL on delete
    await queryRunner.query(`
      ALTER TABLE payments
      DROP CONSTRAINT IF EXISTS "FK_payments_recordedByUserId"
    `);

    await queryRunner.query(`
      ALTER TABLE payments
      ADD CONSTRAINT "FK_payments_recordedByUserId"
      FOREIGN KEY ("recordedByUserId")
      REFERENCES users(id)
      ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove FK constraint
    await queryRunner.query(`
      ALTER TABLE payments
      DROP CONSTRAINT IF EXISTS "FK_payments_recordedByUserId"
    `);

    // Make column NOT NULL again (note: this will fail if there are NULL values)
    await queryRunner.query(`
      ALTER TABLE payments
      ALTER COLUMN "recordedByUserId" SET NOT NULL
    `);

    // Re-add FK constraint with RESTRICT
    await queryRunner.query(`
      ALTER TABLE payments
      ADD CONSTRAINT "FK_payments_recordedByUserId"
      FOREIGN KEY ("recordedByUserId")
      REFERENCES users(id)
      ON DELETE RESTRICT
    `);
  }
}
