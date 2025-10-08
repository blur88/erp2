import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddDiscountTypeToPurchaseOrderItems1759300000000 implements MigrationInterface {
  name = 'AddDiscountTypeToPurchaseOrderItems1759300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add discountType column with default 'percentage'
    await queryRunner.addColumn(
      'purchase_order_items',
      new TableColumn({
        name: 'discountType',
        type: 'varchar',
        length: '20',
        default: "'percentage'",
        comment: 'Discount type: percentage or fixed_amount',
      }),
    );

    // Update comment for discountAmount column to clarify it can be per-unit for fixed_amount type
    await queryRunner.query(`
      COMMENT ON COLUMN purchase_order_items."discountAmount" IS 'Line item discount amount (total for all units or per-unit based on discountType)'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove discountType column
    await queryRunner.dropColumn('purchase_order_items', 'discountType');

    // Restore original comment
    await queryRunner.query(`
      COMMENT ON COLUMN purchase_order_items."discountAmount" IS 'Line item discount amount'
    `);
  }
}
