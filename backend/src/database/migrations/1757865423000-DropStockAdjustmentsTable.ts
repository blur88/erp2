import { MigrationInterface, QueryRunner } from "typeorm";

export class DropStockAdjustmentsTable1757865423000 implements MigrationInterface {
    name = 'DropStockAdjustmentsTable1757865423000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Drop the stock_adjustments table completely
        await queryRunner.query(`DROP TABLE IF EXISTS "stock_adjustments" CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // This migration is not reversible as we're completely removing stock adjustment functionality
        // If you need to restore stock adjustments, you would need to:
        // 1. Restore the StockAdjustment entity
        // 2. Re-add all the removed controllers, services, and DTOs
        // 3. Create a new migration to recreate the table structure
        throw new Error('This migration cannot be reverted. Stock adjustment functionality has been permanently removed.');
    }
}