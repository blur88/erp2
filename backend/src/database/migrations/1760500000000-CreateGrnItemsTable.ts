import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateGrnItemsTable1760500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create goods_received_note_items table
    await queryRunner.createTable(
      new Table({
        name: 'goods_received_note_items',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'grnId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'lineNumber',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'productId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'purchaseOrderItemId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'productSku',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'productName',
            type: 'varchar',
            length: '200',
            isNullable: false,
          },
          {
            name: 'productDescription',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'unit',
            type: 'varchar',
            length: '20',
            isNullable: false,
          },
          {
            name: 'orderedQuantity',
            type: 'decimal',
            precision: 15,
            scale: 4,
            isNullable: false,
          },
          {
            name: 'receivedQuantity',
            type: 'decimal',
            precision: 15,
            scale: 4,
            isNullable: false,
          },
          {
            name: 'acceptedQuantity',
            type: 'decimal',
            precision: 15,
            scale: 4,
            default: 0,
          },
          {
            name: 'rejectedQuantity',
            type: 'decimal',
            precision: 15,
            scale: 4,
            default: 0,
          },
          {
            name: 'unitCost',
            type: 'decimal',
            precision: 15,
            scale: 4,
            isNullable: false,
          },
          {
            name: 'totalAmount',
            type: 'decimal',
            precision: 15,
            scale: 4,
            isNullable: false,
          },
          {
            name: 'condition',
            type: 'varchar',
            length: '20',
            default: "'good'",
          },
          {
            name: 'qualityNotes',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'rejectionReason',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'batchNumber',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'expiryDate',
            type: 'date',
            isNullable: true,
          },
          {
            name: 'storageLocation',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'notes',
            type: 'text',
            isNullable: true,
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
            name: 'deletedAt',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Create foreign key to goods_received_notes
    await queryRunner.createForeignKey(
      'goods_received_note_items',
      new TableForeignKey({
        columnNames: ['grnId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'goods_received_notes',
        onDelete: 'CASCADE',
      }),
    );

    // Create foreign key to products
    await queryRunner.createForeignKey(
      'goods_received_note_items',
      new TableForeignKey({
        columnNames: ['productId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'products',
        onDelete: 'RESTRICT',
      }),
    );

    // Create foreign key to purchase_order_items
    await queryRunner.createForeignKey(
      'goods_received_note_items',
      new TableForeignKey({
        columnNames: ['purchaseOrderItemId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'purchase_order_items',
        onDelete: 'SET NULL',
      }),
    );

    // Create indexes
    await queryRunner.createIndex(
      'goods_received_note_items',
      new TableIndex({
        name: 'IDX_grn_items_grnId',
        columnNames: ['grnId'],
      }),
    );

    await queryRunner.createIndex(
      'goods_received_note_items',
      new TableIndex({
        name: 'IDX_grn_items_productId',
        columnNames: ['productId'],
      }),
    );

    await queryRunner.createIndex(
      'goods_received_note_items',
      new TableIndex({
        name: 'IDX_grn_items_purchaseOrderItemId',
        columnNames: ['purchaseOrderItemId'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('goods_received_note_items');
  }
}
