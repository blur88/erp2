import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class AddPurchaseCostHistory1745129600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create purchase_cost_history table
    await queryRunner.createTable(
      new Table({
        name: 'purchase_cost_history',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'productId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'grnId',
            type: 'uuid',
            isNullable: true,
            comment: 'GRN ID or special UUID for opening balance',
          },
          {
            name: 'unitCost',
            type: 'decimal',
            precision: 15,
            scale: 4,
            isNullable: false,
            comment: 'Purchase unit cost (excluding shipping)',
          },
          {
            name: 'shippingPerUnit',
            type: 'decimal',
            precision: 15,
            scale: 4,
            default: 0,
            comment: 'Allocated shipping cost per unit (BY VALUE)',
          },
          {
            name: 'landedCost',
            type: 'decimal',
            precision: 15,
            scale: 4,
            isNullable: false,
            comment: 'Total landed cost per unit (unitCost + shippingPerUnit)',
          },
          {
            name: 'receivedQuantity',
            type: 'decimal',
            precision: 15,
            scale: 4,
            isNullable: false,
            comment: 'Original quantity received',
          },
          {
            name: 'remainingQuantity',
            type: 'decimal',
            precision: 15,
            scale: 4,
            isNullable: false,
            comment: 'Current quantity remaining in stock (for weighted average)',
          },
          {
            name: 'receivedDate',
            type: 'timestamp',
            isNullable: false,
            comment: 'Date goods were received',
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()',
          },
        ],
        foreignKeys: [
          {
            name: 'FK_purchase_cost_history_product',
            columnNames: ['productId'],
            referencedTableName: 'products',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );

    // Create indexes for performance
    await queryRunner.createIndex(
      'purchase_cost_history',
      new TableIndex({
        name: 'IDX_purchase_cost_product_remaining',
        columnNames: ['productId', 'remainingQuantity'],
      }),
    );

    await queryRunner.createIndex(
      'purchase_cost_history',
      new TableIndex({
        name: 'IDX_purchase_cost_product_date',
        columnNames: ['productId', 'receivedDate'],
      }),
    );

    // Add includeShippingInCost field to products table (if not exists)
    await queryRunner.query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS "includeShippingInCost" BOOLEAN DEFAULT true
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN products."includeShippingInCost" IS 'Whether to include shipping in base cost calculation'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove field from products
    await queryRunner.query(`
      ALTER TABLE products
      DROP COLUMN "includeShippingInCost"
    `);

    // Drop indexes
    await queryRunner.dropIndex(
      'purchase_cost_history',
      'IDX_purchase_cost_product_date',
    );
    await queryRunner.dropIndex(
      'purchase_cost_history',
      'IDX_purchase_cost_product_remaining',
    );

    // Drop table
    await queryRunner.dropTable('purchase_cost_history');
  }
}
