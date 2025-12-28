import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddDiscountTypeAndPercentToInvoiceItems1733520000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add discountType column
    await queryRunner.addColumn(
      'invoice_items',
      new TableColumn({
        name: 'discountType',
        type: 'enum',
        enum: ['percentage', 'amount'],
        default: "'percentage'",
        isNullable: true,
        comment: 'Type of discount: percentage or fixed amount',
      }),
    );

    // Add discountPercent column
    await queryRunner.addColumn(
      'invoice_items',
      new TableColumn({
        name: 'discountPercent',
        type: 'decimal',
        precision: 5,
        scale: 2,
        default: 0,
        isNullable: true,
        comment: 'Line item discount percentage (0-100)',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove columns in reverse order
    await queryRunner.dropColumn('invoice_items', 'discountPercent');
    await queryRunner.dropColumn('invoice_items', 'discountType');
  }
}
