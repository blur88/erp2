import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropApplicationBackupTables1795618818000 implements MigrationInterface {
  name = 'DropApplicationBackupTables1795618818000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // RESTRICT makes PostgreSQL reject dependencies as part of the drop.
    // TypeORM rolls back the transaction if any of the tables cannot be dropped.
    await queryRunner.query('DROP TABLE "backup_logs" RESTRICT');
    await queryRunner.query('DROP TABLE "backup_schedules" RESTRICT');
    await queryRunner.query('DROP TABLE "backup_retention_settings" RESTRICT');
  }

  async down(): Promise<void> {
    throw new Error(
      'The backup tables cannot be restored by reverting this Migration. ' +
        'Recover from a pre-migration database backup using docs/deployment/POSTGRES_19_MAJOR_UPGRADE_RUNBOOK.md.',
    );
  }
}
