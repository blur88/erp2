import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRegionalSettingsToPriceCostingSettings1771700000000 implements MigrationInterface {
  name = "AddRegionalSettingsToPriceCostingSettings1771700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "price_costing_settings"
        ADD COLUMN IF NOT EXISTS "dateFormat" character varying(20) NOT NULL DEFAULT 'DD/MM/YYYY',
        ADD COLUMN IF NOT EXISTS "timeFormat" character varying(10) NOT NULL DEFAULT '24h',
        ADD COLUMN IF NOT EXISTS "numberFormat" character varying(20) NOT NULL DEFAULT '1,234.56'
    `);
    // Update default currency to MYR if it's still the old default 'USD'
    await queryRunner.query(`
      UPDATE "price_costing_settings" SET "currency" = 'MYR' WHERE "currency" = 'USD'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "price_costing_settings"
        DROP COLUMN IF EXISTS "dateFormat",
        DROP COLUMN IF EXISTS "timeFormat",
        DROP COLUMN IF EXISTS "numberFormat"
    `);
  }
}
