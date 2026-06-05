import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSaleReversalMovementType1730102400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Skip safely on fresh databases where legacy enum type does not exist.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_type
          WHERE typname = 'stock_movements_movementtype_enum'
        ) THEN
          ALTER TYPE "stock_movements_movementtype_enum"
          ADD VALUE IF NOT EXISTS 'sale_reversal';
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Note: PostgreSQL doesn't support removing enum values directly
    // This would require recreating the enum type and updating all references
    // For production, it's safer to leave the enum value in place
    console.warn(
      "Cannot remove enum value in PostgreSQL. Manual intervention required if rollback is needed.",
    );
  }
}
