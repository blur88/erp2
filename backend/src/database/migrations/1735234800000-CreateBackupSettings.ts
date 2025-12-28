import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateBackupRetentionSettings1735234800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'backup_retention_settings',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'retentionDays',
            type: 'int',
            default: 30,
            comment: 'Number of days to retain backups before auto-cleanup',
          },
          {
            name: 'autoCleanupEnabled',
            type: 'boolean',
            default: true,
            comment: 'Enable automatic backup cleanup',
          },
          {
            name: 'cleanupTime',
            type: 'varchar',
            length: '10',
            default: "'02:00'",
            comment: 'Time of day to run cleanup (HH:MM)',
          },
          {
            name: 'minimumBackupsToKeep',
            type: 'int',
            default: 5,
            comment: 'Minimum number of backups to keep regardless of age',
          },
          {
            name: 'maximumBackupsToKeep',
            type: 'int',
            isNullable: true,
            comment: 'Maximum number of backups to keep (null for unlimited)',
          },
          {
            name: 'maximumTotalSize',
            type: 'bigint',
            isNullable: true,
            comment: 'Maximum total size of all backups in bytes (null for unlimited)',
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
            comment: 'Only one active settings record should exist',
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'createdBy',
            type: 'varchar',
            length: '255',
            default: "'system'",
          },
          {
            name: 'updatedBy',
            type: 'varchar',
            length: '255',
            default: "'system'",
          },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('backup_retention_settings');
  }
}
