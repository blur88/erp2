import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateVendorPaymentsTable1729028400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'vendor_payments',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'paymentNumber',
            type: 'varchar',
            length: '50',
            isUnique: true,
          },
          {
            name: 'supplierId',
            type: 'uuid',
          },
          {
            name: 'purchaseOrderId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'amount',
            type: 'decimal',
            precision: 12,
            scale: 4,
            default: 0,
          },
          {
            name: 'paymentDate',
            type: 'date',
          },
          {
            name: 'paymentMethod',
            type: 'varchar',
            length: '50',
          },
          {
            name: 'referenceNumber',
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
            name: 'status',
            type: 'varchar',
            length: '20',
            default: "'pending'",
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
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
          {
            name: 'createdBy',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'updatedBy',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Create indexes
    await queryRunner.createIndex(
      'vendor_payments',
      new TableIndex({
        name: 'IDX_VENDOR_PAYMENTS_SUPPLIER_STATUS',
        columnNames: ['supplierId', 'status'],
      }),
    );

    await queryRunner.createIndex(
      'vendor_payments',
      new TableIndex({
        name: 'IDX_VENDOR_PAYMENTS_PAYMENT_DATE',
        columnNames: ['paymentDate'],
      }),
    );

    // Create foreign keys
    await queryRunner.createForeignKey(
      'vendor_payments',
      new TableForeignKey({
        columnNames: ['supplierId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'suppliers',
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'vendor_payments',
      new TableForeignKey({
        columnNames: ['purchaseOrderId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'purchase_orders',
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('vendor_payments');
    if (table) {
      // Drop foreign keys
      const supplierForeignKey = table.foreignKeys.find(
        (fk) => fk.columnNames.indexOf('supplierId') !== -1,
      );
      if (supplierForeignKey) {
        await queryRunner.dropForeignKey('vendor_payments', supplierForeignKey);
      }

      const purchaseOrderForeignKey = table.foreignKeys.find(
        (fk) => fk.columnNames.indexOf('purchaseOrderId') !== -1,
      );
      if (purchaseOrderForeignKey) {
        await queryRunner.dropForeignKey('vendor_payments', purchaseOrderForeignKey);
      }

      // Drop indexes
      await queryRunner.dropIndex('vendor_payments', 'IDX_VENDOR_PAYMENTS_SUPPLIER_STATUS');
      await queryRunner.dropIndex('vendor_payments', 'IDX_VENDOR_PAYMENTS_PAYMENT_DATE');

      // Drop table
      await queryRunner.dropTable('vendor_payments');
    }
  }
}
