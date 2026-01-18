import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRequiresPasswordChangeToUsers1735786800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS "requiresPasswordChange" BOOLEAN DEFAULT false NOT NULL
    `);

    // Set requiresPasswordChange to true for the default admin user
    await queryRunner.query(`
      UPDATE users
      SET "requiresPasswordChange" = true
      WHERE username = 'admin'
        AND email = 'admin@erp.com'
        AND role = 'admin'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      DROP COLUMN IF EXISTS "requiresPasswordChange"
    `);
  }
}
