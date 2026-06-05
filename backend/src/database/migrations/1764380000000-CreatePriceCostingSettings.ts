import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreatePriceCostingSettings1764380000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'price_costing_settings',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'currency',
            type: 'varchar',
            length: '10',
            default: "'USD'",
            isNullable: false,
          },
          {
            name: 'costingMethod',
            type: 'varchar',
            length: '50',
            default: "'AVERAGE'",
            isNullable: false,
          },
          {
            name: 'customerPricingSchemes',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
            isNullable: false,
          },
          {
            name: 'createdAt',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updatedAt',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
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

    // Create index on isActive for performance
    await queryRunner.query(
      `CREATE INDEX "IDX_price_costing_settings_is_active" ON "price_costing_settings" ("isActive")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('price_costing_settings');
  }
}
