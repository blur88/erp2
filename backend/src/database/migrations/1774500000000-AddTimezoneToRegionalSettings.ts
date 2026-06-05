import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTimezoneToRegionalSettings1774500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE price_costing_settings
      ADD COLUMN IF NOT EXISTS timezone varchar(100) NOT NULL DEFAULT 'Asia/Kuala_Lumpur'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE price_costing_settings
      DROP COLUMN IF EXISTS timezone
    `);
  }
}
