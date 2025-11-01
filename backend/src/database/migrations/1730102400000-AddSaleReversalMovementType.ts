import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSaleReversalMovementType1730102400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add 'sale_reversal' to the stock movement type enum
    await queryRunner.query(`
      ALTER TYPE "stock_movements_movementtype_enum"
      ADD VALUE IF NOT EXISTS 'sale_reversal'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Note: PostgreSQL doesn't support removing enum values directly
    // This would require recreating the enum type and updating all references
    // For production, it's safer to leave the enum value in place
    console.warn('Cannot remove enum value in PostgreSQL. Manual intervention required if rollback is needed.');
  }
}
