import { MigrationInterface, QueryRunner, TableColumn, TableIndex, TableForeignKey } from 'typeorm';

export class AddGrnToVendorPayments1761600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add grnId column to vendor_payments table
    await queryRunner.addColumn(
      'vendor_payments',
      new TableColumn({
        name: 'grnId',
        type: 'uuid',
        isNullable: true,
      }),
    );

    // Create index for grnId
    await queryRunner.createIndex(
      'vendor_payments',
      new TableIndex({
        name: 'IDX_VENDOR_PAYMENTS_GRN_ID',
        columnNames: ['grnId'],
      }),
    );

    // Create foreign key to goods_received_notes table
    await queryRunner.createForeignKey(
      'vendor_payments',
      new TableForeignKey({
        columnNames: ['grnId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'goods_received_notes',
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('vendor_payments');
    if (table) {
      // Drop foreign key
      const grnForeignKey = table.foreignKeys.find(
        (fk) => fk.columnNames.indexOf('grnId') !== -1,
      );
      if (grnForeignKey) {
        await queryRunner.dropForeignKey('vendor_payments', grnForeignKey);
      }

      // Drop index
      await queryRunner.dropIndex('vendor_payments', 'IDX_VENDOR_PAYMENTS_GRN_ID');

      // Drop column
      await queryRunner.dropColumn('vendor_payments', 'grnId');
    }
  }
}
