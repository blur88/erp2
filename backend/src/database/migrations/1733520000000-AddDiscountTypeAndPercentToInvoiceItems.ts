import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddDiscountTypeAndPercentToInvoiceItems1733520000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if discountType column already exists
    const discountTypeExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'invoice_items' AND column_name = 'discountType'
      ) as exists
    `);

    if (!discountTypeExists[0].exists) {
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
    } else {
      console.log('discountType column already exists, skipping');
    }

    // Check if discountPercent column already exists
    const discountPercentExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'invoice_items' AND column_name = 'discountPercent'
      ) as exists
    `);

    if (!discountPercentExists[0].exists) {
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
    } else {
      console.log('discountPercent column already exists, skipping');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove columns in reverse order
    await queryRunner.dropColumn('invoice_items', 'discountPercent');
    await queryRunner.dropColumn('invoice_items', 'discountType');
  }
}
