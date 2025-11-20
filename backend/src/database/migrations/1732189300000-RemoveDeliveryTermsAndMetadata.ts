import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class RemoveDeliveryTermsAndMetadata1732189300000 implements MigrationInterface {
  name = 'RemoveDeliveryTermsAndMetadata1732189300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop columns
    await queryRunner.dropColumn('purchase_orders', 'deliveryTerms');
    await queryRunner.dropColumn('purchase_orders', 'metadata');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recreate columns in reverse order
    await queryRunner.addColumn(
      'purchase_orders',
      new TableColumn({
        name: 'metadata',
        type: 'json',
        isNullable: true,
        comment: 'Additional order metadata',
      }),
    );

    await queryRunner.addColumn(
      'purchase_orders',
      new TableColumn({
        name: 'deliveryTerms',
        type: 'text',
        isNullable: true,
        comment: 'Delivery terms (FOB, CIF, etc.)',
      }),
    );
  }
}
