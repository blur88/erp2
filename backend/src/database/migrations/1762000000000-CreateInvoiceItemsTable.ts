import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateInvoiceItemsTable1762000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create invoice_items table
    await queryRunner.createTable(
      new Table({
        name: 'invoice_items',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'lineNumber',
            type: 'int',
            comment: 'Line item sequence number within the invoice',
          },
          {
            name: 'productSku',
            type: 'varchar',
            length: '50',
            comment: 'Product SKU at time of invoice',
          },
          {
            name: 'productName',
            type: 'varchar',
            length: '200',
            comment: 'Product name at time of invoice',
          },
          {
            name: 'productDescription',
            type: 'text',
            isNullable: true,
            comment: 'Product description at time of invoice',
          },
          {
            name: 'quantity',
            type: 'decimal',
            precision: 15,
            scale: 4,
            comment: 'Invoiced quantity',
          },
          {
            name: 'unitPrice',
            type: 'decimal',
            precision: 15,
            scale: 4,
            comment: 'Unit price at time of invoice',
          },
          {
            name: 'discount',
            type: 'decimal',
            precision: 15,
            scale: 4,
            default: 0,
            comment: 'Line item discount amount',
          },
          {
            name: 'totalAmount',
            type: 'decimal',
            precision: 15,
            scale: 4,
            default: 0,
            comment: 'Line item total amount (after discount)',
          },
          {
            name: 'notes',
            type: 'text',
            isNullable: true,
            comment: 'Special notes for this item',
          },
          {
            name: 'invoiceId',
            type: 'uuid',
            comment: 'Invoice ID',
          },
          {
            name: 'productId',
            type: 'uuid',
            comment: 'Product ID',
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
          {
            name: 'deletedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
          },
        ],
      }),
      true,
    );

    // Create indexes
    await queryRunner.createIndex(
      'invoice_items',
      new TableIndex({
        name: 'IDX_invoice_items_invoiceId',
        columnNames: ['invoiceId'],
      }),
    );

    await queryRunner.createIndex(
      'invoice_items',
      new TableIndex({
        name: 'IDX_invoice_items_productId',
        columnNames: ['productId'],
      }),
    );

    // Create foreign keys
    await queryRunner.createForeignKey(
      'invoice_items',
      new TableForeignKey({
        name: 'FK_invoice_items_invoice',
        columnNames: ['invoiceId'],
        referencedTableName: 'invoices',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'invoice_items',
      new TableForeignKey({
        name: 'FK_invoice_items_product',
        columnNames: ['productId'],
        referencedTableName: 'products',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys
    await queryRunner.dropForeignKey('invoice_items', 'FK_invoice_items_product');
    await queryRunner.dropForeignKey('invoice_items', 'FK_invoice_items_invoice');

    // Drop indexes
    await queryRunner.dropIndex('invoice_items', 'IDX_invoice_items_productId');
    await queryRunner.dropIndex('invoice_items', 'IDX_invoice_items_invoiceId');

    // Drop table
    await queryRunner.dropTable('invoice_items');
  }
}
