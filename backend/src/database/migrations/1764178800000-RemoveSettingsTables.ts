import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveSettingsTables1764178800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop settings-related tables that are no longer needed
    await queryRunner.query(`DROP TABLE IF EXISTS "business_settings" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "global_preferences" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "settings" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "system_settings" CASCADE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Note: Down migration not implemented as table structures are unknown
    // If rollback is needed, restore from backup
    console.log(
      'Warning: Cannot restore dropped settings tables. Restore from database backup if needed.',
    );
  }
}
