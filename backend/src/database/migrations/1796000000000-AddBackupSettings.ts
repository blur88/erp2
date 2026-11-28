import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Singleton Backup settings (#2112). Holds only the scheduling interval and the
 * retention tier counts. The row is seeded with the spec defaults so a fresh
 * install schedules at 30 minutes; nothing is reset later.
 */
export class AddBackupSettings1796000000000 implements MigrationInterface {
  name = 'AddBackupSettings1796000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "backup_settings" ("id" boolean NOT NULL DEFAULT true, "intervalMinutes" integer NOT NULL DEFAULT '30', "retentionWindowHours" integer NOT NULL DEFAULT '24', "retentionDailyCount" integer NOT NULL DEFAULT '7', "retentionWeeklyCount" integer NOT NULL DEFAULT '4', "retentionMonthlyCount" integer NOT NULL DEFAULT '12', "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_backup_settings_singleton" CHECK ("id" = true), CONSTRAINT "PK_backup_settings" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`INSERT INTO "backup_settings" ("id") VALUES (true)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "backup_settings"`);
  }
}
