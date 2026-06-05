import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateRefreshTokenTable1735434000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create refresh_tokens table
    await queryRunner.createTable(
      new Table({
        name: 'refresh_tokens',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'tokenHash',
            type: 'varchar',
            length: '255',
            isUnique: true,
            isNullable: false,
            comment: 'SHA-256 hash of the refresh token',
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: false,
            comment: 'Foreign key to users table',
          },
          {
            name: 'expiresAt',
            type: 'timestamptz',
            isNullable: false,
            comment: 'Token expiration timestamp',
          },
          {
            name: 'deviceInfo',
            type: 'text',
            isNullable: true,
            comment: 'Device user agent for audit tracking',
          },
          {
            name: 'ipAddress',
            type: 'varchar',
            length: '45',
            isNullable: true,
            comment: 'IP address for audit tracking',
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
            comment: 'Soft delete flag for performance queries',
          },
          {
            name: 'createdAt',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'deletedAt',
            type: 'timestamptz',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Create foreign key to users table
    await queryRunner.createForeignKey(
      'refresh_tokens',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        name: 'FK_refresh_tokens_userId',
      }),
    );

    // Create index on tokenHash for fast lookups
    await queryRunner.createIndex(
      'refresh_tokens',
      new TableIndex({
        name: 'IDX_refresh_tokens_tokenHash',
        columnNames: ['tokenHash'],
        isUnique: true,
      }),
    );

    // Create index on userId for user token queries
    await queryRunner.createIndex(
      'refresh_tokens',
      new TableIndex({
        name: 'IDX_refresh_tokens_userId',
        columnNames: ['userId'],
      }),
    );

    // Create index on expiresAt for cleanup queries
    await queryRunner.createIndex(
      'refresh_tokens',
      new TableIndex({
        name: 'IDX_refresh_tokens_expiresAt',
        columnNames: ['expiresAt'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.dropIndex('refresh_tokens', 'IDX_refresh_tokens_expiresAt');
    await queryRunner.dropIndex('refresh_tokens', 'IDX_refresh_tokens_userId');
    await queryRunner.dropIndex('refresh_tokens', 'IDX_refresh_tokens_tokenHash');

    // Drop foreign key
    await queryRunner.dropForeignKey('refresh_tokens', 'FK_refresh_tokens_userId');

    // Drop table
    await queryRunner.dropTable('refresh_tokens');
  }
}
