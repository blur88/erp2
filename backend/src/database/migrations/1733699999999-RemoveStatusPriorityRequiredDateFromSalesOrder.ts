import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveStatusPriorityRequiredDateFromSalesOrder1733699999999 implements MigrationInterface {
    name = 'RemoveStatusPriorityRequiredDateFromSalesOrder1733699999999'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Drop indexes first
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_status"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_priority"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_requiredDate"`);

        // Remove columns
        await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "status"`);
        await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "priority"`);
        await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "requiredDate"`);

        // Drop the enum types if they exist
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."sales_orders_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "sales_orders_priority_enum"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Create enum types
        await queryRunner.query(`CREATE TYPE "public"."sales_orders_status_enum" AS ENUM('draft', 'pending', 'confirmed', 'in_progress', 'shipped', 'delivered', 'completed', 'cancelled')`);
        await queryRunner.query(`CREATE TYPE "public"."sales_orders_priority_enum" AS ENUM('low', 'normal', 'high', 'urgent')`);

        // Add columns back
        await queryRunner.query(`ALTER TABLE "sales_orders" ADD "status" "public"."sales_orders_status_enum" NOT NULL DEFAULT 'draft'`);
        await queryRunner.query(`ALTER TABLE "sales_orders" ADD "priority" "public"."sales_orders_priority_enum" NOT NULL DEFAULT 'normal'`);
        await queryRunner.query(`ALTER TABLE "sales_orders" ADD "requiredDate" date`);

        // Create indexes
        await queryRunner.query(`CREATE INDEX "IDX_status" ON "sales_orders" ("status")`);
        await queryRunner.query(`CREATE INDEX "IDX_priority" ON "sales_orders" ("priority")`);
        await queryRunner.query(`CREATE INDEX "IDX_requiredDate" ON "sales_orders" ("requiredDate")`);
    }
}