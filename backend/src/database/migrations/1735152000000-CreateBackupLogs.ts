import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateBackupLogs1735152000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'backup_logs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'filename',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'filepath',
            type: 'varchar',
            length: '500',
          },
          {
            name: 'backup_type',
            type: 'varchar',
            length: '20',
            default: "'manual'",
          },
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            default: "'in_progress'",
          },
          {
            name: 'size',
            type: 'bigint',
            isNullable: true,
          },
          {
            name: 'databases',
            type: 'text',
            default: "''",
          },
          {
            name: 'started_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'completed_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'created_by',
            type: 'varchar',
            length: '100',
            default: "'system'",
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'error',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'deleted_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
        ],
      }),
      true,
    );

    // Create indexes
    await queryRunner.createIndex(
      'backup_logs',
      new TableIndex({
        name: 'IDX_backup_logs_status',
        columnNames: ['status'],
      }),
    );

    await queryRunner.createIndex(
      'backup_logs',
      new TableIndex({
        name: 'IDX_backup_logs_created_at',
        columnNames: ['created_at'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('backup_logs');
  }
}
