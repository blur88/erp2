import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateBackupSchedules1735153000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'backup_schedules',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '100',
            isUnique: true,
          },
          {
            name: 'frequency',
            type: 'varchar',
            length: '20',
            default: "'daily'",
          },
          {
            name: 'cron_expression',
            type: 'varchar',
            length: '20',
            isNullable: true,
          },
          {
            name: 'time',
            type: 'varchar',
            length: '5',
            default: "'02:00'",
          },
          {
            name: 'day_of_week',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'day_of_month',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'databases',
            type: 'text',
            default: "'postgresql,redis'",
          },
          {
            name: 'include_settings',
            type: 'boolean',
            default: true,
          },
          {
            name: 'retention_days',
            type: 'int',
            default: 30,
          },
          {
            name: 'enabled',
            type: 'boolean',
            default: false,
          },
          {
            name: 'last_run_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'next_run_at',
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
            name: 'notifications',
            type: 'jsonb',
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('backup_schedules');
  }
}
