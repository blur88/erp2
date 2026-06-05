import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class RemoveUnusedPurchaseOrderFields1732189200000 implements MigrationInterface {
  name = 'RemoveUnusedPurchaseOrderFields1732189200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes that reference columns being removed
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_purchase_orders_requiredDate"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_purchase_orders_createdByUserId"`);

    // Drop columns using raw SQL with IF EXISTS
    await queryRunner.query(`ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "requiredDate"`);
    await queryRunner.query(`ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "sentDate"`);
    await queryRunner.query(`ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "acknowledgedDate"`);
    await queryRunner.query(`ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "expectedDeliveryDate"`);
    await queryRunner.query(`ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "deliveredDate"`);
    await queryRunner.query(`ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "deliveryAddress"`);
    await queryRunner.query(`ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "deliveryCity"`);
    await queryRunner.query(`ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "deliveryState"`);
    await queryRunner.query(`ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "deliveryPostalCode"`);
    await queryRunner.query(`ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "deliveryCountry"`);
    await queryRunner.query(`ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "deliveryContact"`);
    await queryRunner.query(`ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "deliveryPhone"`);
    await queryRunner.query(`ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "paymentTermsDays"`);
    await queryRunner.query(`ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "paymentTerms"`);
    await queryRunner.query(`ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "internalNotes"`);
    await queryRunner.query(`ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "supplierQuoteRef"`);
    await queryRunner.query(`ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "createdByUserId"`);
    await queryRunner.query(`ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "approvedByUserId"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recreate columns in reverse order
    await queryRunner.addColumn(
      'purchase_orders',
      new TableColumn({
        name: 'approvedByUserId',
        type: 'uuid',
        isNullable: true,
        comment: 'User who approved the order',
      }),
    );

    await queryRunner.addColumn(
      'purchase_orders',
      new TableColumn({
        name: 'createdByUserId',
        type: 'uuid',
        isNullable: true,
        comment: 'User who created the order',
      }),
    );

    await queryRunner.addColumn(
      'purchase_orders',
      new TableColumn({
        name: 'supplierQuoteRef',
        type: 'varchar',
        length: '50',
        isNullable: true,
        comment: 'Supplier quotation reference',
      }),
    );

    await queryRunner.addColumn(
      'purchase_orders',
      new TableColumn({
        name: 'internalNotes',
        type: 'text',
        isNullable: true,
        comment: 'Internal notes',
      }),
    );

    await queryRunner.addColumn(
      'purchase_orders',
      new TableColumn({
        name: 'paymentTerms',
        type: 'text',
        isNullable: true,
        comment: 'Payment terms description',
      }),
    );

    await queryRunner.addColumn(
      'purchase_orders',
      new TableColumn({
        name: 'paymentTermsDays',
        type: 'int',
        default: 30,
        comment: 'Payment terms in days',
      }),
    );

    await queryRunner.addColumn(
      'purchase_orders',
      new TableColumn({
        name: 'deliveryPhone',
        type: 'varchar',
        length: '20',
        isNullable: true,
        comment: 'Contact phone for delivery',
      }),
    );

    await queryRunner.addColumn(
      'purchase_orders',
      new TableColumn({
        name: 'deliveryContact',
        type: 'varchar',
        length: '200',
        isNullable: true,
        comment: 'Contact person for delivery',
      }),
    );

    await queryRunner.addColumn(
      'purchase_orders',
      new TableColumn({
        name: 'deliveryCountry',
        type: 'varchar',
        length: '100',
        isNullable: true,
        comment: 'Delivery country',
      }),
    );

    await queryRunner.addColumn(
      'purchase_orders',
      new TableColumn({
        name: 'deliveryPostalCode',
        type: 'varchar',
        length: '20',
        isNullable: true,
        comment: 'Delivery postal code',
      }),
    );

    await queryRunner.addColumn(
      'purchase_orders',
      new TableColumn({
        name: 'deliveryState',
        type: 'varchar',
        length: '100',
        isNullable: true,
        comment: 'Delivery state/province',
      }),
    );

    await queryRunner.addColumn(
      'purchase_orders',
      new TableColumn({
        name: 'deliveryCity',
        type: 'varchar',
        length: '100',
        isNullable: true,
        comment: 'Delivery city',
      }),
    );

    await queryRunner.addColumn(
      'purchase_orders',
      new TableColumn({
        name: 'deliveryAddress',
        type: 'text',
        isNullable: true,
        comment: 'Delivery address',
      }),
    );

    await queryRunner.addColumn(
      'purchase_orders',
      new TableColumn({
        name: 'deliveredDate',
        type: 'date',
        isNullable: true,
        comment: 'Actual delivery completion date',
      }),
    );

    await queryRunner.addColumn(
      'purchase_orders',
      new TableColumn({
        name: 'expectedDeliveryDate',
        type: 'date',
        isNullable: true,
        comment: 'Expected delivery date from supplier',
      }),
    );

    await queryRunner.addColumn(
      'purchase_orders',
      new TableColumn({
        name: 'acknowledgedDate',
        type: 'date',
        isNullable: true,
        comment: 'Date when supplier acknowledged the order',
      }),
    );

    await queryRunner.addColumn(
      'purchase_orders',
      new TableColumn({
        name: 'sentDate',
        type: 'date',
        isNullable: true,
        comment: 'Date when order was sent to supplier',
      }),
    );

    await queryRunner.addColumn(
      'purchase_orders',
      new TableColumn({
        name: 'requiredDate',
        type: 'date',
        isNullable: true,
        comment: 'Required/expected delivery date',
      }),
    );

    // Recreate indexes
    await queryRunner.createIndex(
      'purchase_orders',
      new TableIndex({
        name: 'IDX_purchase_orders_requiredDate',
        columnNames: ['requiredDate'],
      }),
    );

    await queryRunner.createIndex(
      'purchase_orders',
      new TableIndex({
        name: 'IDX_purchase_orders_createdByUserId',
        columnNames: ['createdByUserId'],
      }),
    );
  }
}
