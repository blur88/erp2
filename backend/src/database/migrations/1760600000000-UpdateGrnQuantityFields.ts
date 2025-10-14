import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class UpdateGrnQuantityFields1760600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Update goods_received_notes table
    // 1. Add totalQuantityOrdered column
    await queryRunner.addColumn(
      'goods_received_notes',
      new TableColumn({
        name: 'totalQuantityOrdered',
        type: 'decimal',
        precision: 15,
        scale: 4,
        default: 0,
        comment: 'Total quantity ordered (from PO)',
      }),
    );

    // 2. Calculate and set totalQuantityOrdered from existing data
    await queryRunner.query(`
      UPDATE goods_received_notes grn
      SET "totalQuantityOrdered" = COALESCE(
        (SELECT SUM("orderedQuantity") FROM goods_received_note_items WHERE "grnId" = grn.id),
        0
      )
    `);

    // 3. Drop columns we no longer need
    await queryRunner.dropColumn('goods_received_notes', 'totalQuantityAccepted');
    await queryRunner.dropColumn('goods_received_notes', 'totalQuantityRejected');
    await queryRunner.dropColumn('goods_received_notes', 'totalValue');

    // Update goods_received_note_items table
    // Remove acceptedQuantity and rejectedQuantity columns
    await queryRunner.dropColumn('goods_received_note_items', 'acceptedQuantity');
    await queryRunner.dropColumn('goods_received_note_items', 'rejectedQuantity');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse the changes for goods_received_note_items
    await queryRunner.addColumn(
      'goods_received_note_items',
      new TableColumn({
        name: 'acceptedQuantity',
        type: 'decimal',
        precision: 15,
        scale: 4,
        default: 0,
        comment: 'Quantity accepted (passed quality check)',
      }),
    );

    await queryRunner.addColumn(
      'goods_received_note_items',
      new TableColumn({
        name: 'rejectedQuantity',
        type: 'decimal',
        precision: 15,
        scale: 4,
        default: 0,
        comment: 'Quantity rejected (failed quality check)',
      }),
    );

    // Reverse the changes for goods_received_notes
    await queryRunner.addColumn(
      'goods_received_notes',
      new TableColumn({
        name: 'totalValue',
        type: 'decimal',
        precision: 15,
        scale: 4,
        default: 0,
        comment: 'Total value of goods received',
      }),
    );

    await queryRunner.addColumn(
      'goods_received_notes',
      new TableColumn({
        name: 'totalQuantityAccepted',
        type: 'decimal',
        precision: 15,
        scale: 4,
        default: 0,
        comment: 'Total quantity accepted',
      }),
    );

    await queryRunner.addColumn(
      'goods_received_notes',
      new TableColumn({
        name: 'totalQuantityRejected',
        type: 'decimal',
        precision: 15,
        scale: 4,
        default: 0,
        comment: 'Total quantity rejected',
      }),
    );

    await queryRunner.dropColumn('goods_received_notes', 'totalQuantityOrdered');
  }
}
