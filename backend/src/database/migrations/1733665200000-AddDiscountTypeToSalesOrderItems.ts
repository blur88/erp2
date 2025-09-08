import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddDiscountTypeToSalesOrderItems1733665200000 implements MigrationInterface {
  name = 'AddDiscountTypeToSalesOrderItems1733665200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add discount_type column to sales_order_items table
    await queryRunner.addColumn(
      'sales_order_items',
      new TableColumn({
        name: 'discount_type',
        type: 'enum',
        enum: ['percentage', 'amount'],
        default: "'percentage'",
        comment: 'Type of discount: percentage or fixed amount',
      })
    );

    // Update the comment for discountAmount column to reflect it can be fixed amount or calculated
    await queryRunner.query(
      `COMMENT ON COLUMN sales_order_items.discount_amount IS 'Line item discount amount (fixed amount or calculated from percentage)'`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove discount_type column
    await queryRunner.dropColumn('sales_order_items', 'discount_type');

    // Restore original comment for discountAmount column
    await queryRunner.query(
      `COMMENT ON COLUMN sales_order_items.discount_amount IS 'Line item discount amount'`
    );
  }
}