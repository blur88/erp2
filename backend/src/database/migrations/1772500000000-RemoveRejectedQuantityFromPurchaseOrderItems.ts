import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class RemoveRejectedQuantityFromPurchaseOrderItems1772500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove rejectedQuantity column from purchase_order_items table
    await queryRunner.dropColumn('purchase_order_items', 'rejectedQuantity');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Add rejectedQuantity column back for rollback
    await queryRunner.addColumn(
      'purchase_order_items',
      new TableColumn({
        name: 'rejectedQuantity',
        type: 'decimal',
        precision: 15,
        scale: 4,
        default: 0,
        comment: 'Quantity rejected (failed quality check)',
      }),
    );
  }
}