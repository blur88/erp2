import { MigrationInterface, QueryRunner } from "typeorm";

export class ChangeQuantityToInteger1760815275561 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Convert quantity from decimal(15,4) to integer
        // First round the values, then change the column type
        await queryRunner.query(`
            ALTER TABLE sales_order_items
            ALTER COLUMN quantity TYPE integer USING ROUND(quantity)::integer
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert back to decimal
        await queryRunner.query(`
            ALTER TABLE sales_order_items
            ALTER COLUMN quantity TYPE decimal(15,4)
        `);
    }

}
