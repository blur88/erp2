import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserTokenVersion1793358000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE users ADD COLUMN "tokenVersion" integer NOT NULL DEFAULT 0',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE users DROP COLUMN "tokenVersion"');
  }
}
