import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateAccountMappings1738779600000 implements MigrationInterface {
  name = 'CreateAccountMappings1738779600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create account_mappings table
    await queryRunner.createTable(
      new Table({
        name: 'account_mappings',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'mappingType',
            type: 'enum',
            enum: [
              'sales_revenue',
              'sales_ar',
              'sales_cogs',
              'sales_inventory',
              'purchase_inventory',
              'purchase_ap',
              'payment_cash',
              'payment_ar',
              'vendor_payment_cash',
              'vendor_payment_ap',
              'inventory_asset',
              'inventory_adjustment_gain',
              'inventory_adjustment_loss',
            ],
            isUnique: true,
            comment: 'Mapping type (e.g., SALES_REVENUE, SALES_AR)',
          },
          {
            name: 'accountId',
            type: 'uuid',
            comment: 'Chart of account ID to post to',
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
            comment: 'Description of what this mapping is for',
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
            comment: 'Whether the mapping is active',
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

    // Create index on mappingType (unique)
    await queryRunner.createIndex(
      'account_mappings',
      new TableIndex({
        name: 'IDX_account_mappings_mapping_type',
        columnNames: ['mappingType'],
        isUnique: true,
      }),
    );

    // Create index on accountId
    await queryRunner.createIndex(
      'account_mappings',
      new TableIndex({
        name: 'IDX_account_mappings_account_id',
        columnNames: ['accountId'],
      }),
    );

    // Create foreign key to chart_of_accounts
    await queryRunner.createForeignKey(
      'account_mappings',
      new TableForeignKey({
        name: 'FK_account_mappings_account_id',
        columnNames: ['accountId'],
        referencedTableName: 'chart_of_accounts',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key
    await queryRunner.dropForeignKey(
      'account_mappings',
      'FK_account_mappings_account_id',
    );

    // Drop indexes
    await queryRunner.dropIndex(
      'account_mappings',
      'IDX_account_mappings_account_id',
    );
    await queryRunner.dropIndex(
      'account_mappings',
      'IDX_account_mappings_mapping_type',
    );

    // Drop table
    await queryRunner.dropTable('account_mappings');
  }
}
