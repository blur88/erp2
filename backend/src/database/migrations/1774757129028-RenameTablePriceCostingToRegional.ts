import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameTablePriceCostingToRegional1774757129028 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "price_costing_settings" RENAME TO "regional_settings"`);
    await queryRunner.query(
      `ALTER INDEX "IDX_price_costing_settings_is_active" RENAME TO "IDX_regional_settings_is_active"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "regional_settings" RENAME TO "price_costing_settings"`);
    await queryRunner.query(
      `ALTER INDEX "IDX_regional_settings_is_active" RENAME TO "IDX_price_costing_settings_is_active"`,
    );
  }
}
