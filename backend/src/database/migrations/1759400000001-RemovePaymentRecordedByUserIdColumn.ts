import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemovePaymentRecordedByUserIdColumn1759400000001 implements MigrationInterface {
  name = 'RemovePaymentRecordedByUserIdColumn1759400000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the index first
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_909d658ec42a933f6a4a053d25"
    `);

    // Drop the foreign key constraint
    await queryRunner.query(`
      ALTER TABLE payments
      DROP CONSTRAINT IF EXISTS "FK_909d658ec42a933f6a4a053d25d"
    `);

    // Drop the column
    await queryRunner.query(`
      ALTER TABLE payments
      DROP COLUMN IF EXISTS "recordedByUserId"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add the column
    await queryRunner.query(`
      ALTER TABLE payments
      ADD COLUMN "recordedByUserId" UUID
    `);

    // Re-add the foreign key constraint
    await queryRunner.query(`
      ALTER TABLE payments
      ADD CONSTRAINT "FK_909d658ec42a933f6a4a053d25d"
      FOREIGN KEY ("recordedByUserId")
      REFERENCES users(id)
      ON DELETE SET NULL
    `);

    // Re-add the index
    await queryRunner.query(`
      CREATE INDEX "IDX_909d658ec42a933f6a4a053d25"
      ON payments("recordedByUserId")
    `);
  }
}