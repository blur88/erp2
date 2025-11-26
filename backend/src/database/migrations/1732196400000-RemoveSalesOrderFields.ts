import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveSalesOrderFields1732196400000 implements MigrationInterface {
  name = 'RemoveSalesOrderFields1732196400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the index on createdByUserId before dropping the column
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sales_orders_createdByUserId"`);

    // Remove columns from sales_orders table
    await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "status"`);
    await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "priority"`);
    await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "shippedDate"`);
    await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "deliveredDate"`);
    await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "shippingAddress"`);
    await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "shippingCity"`);
    await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "shippingState"`);
    await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "shippingPostalCode"`);
    await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "shippingCountry"`);
    await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "shippingMethod"`);
    await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "trackingNumber"`);
    await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "customerPoNumber"`);
    await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "internalNotes"`);
    await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "metadata"`);
    await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "createdByUserId"`);

    // Drop the enum types if they exist and are not used elsewhere
    await queryRunner.query(`DROP TYPE IF EXISTS "sales_orders_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "sales_orders_priority_enum"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recreate enum types
    await queryRunner.query(`CREATE TYPE "sales_orders_status_enum" AS ENUM('draft', 'confirmed', 'completed', 'cancelled')`);
    await queryRunner.query(`CREATE TYPE "sales_orders_priority_enum" AS ENUM('low', 'normal', 'high', 'urgent')`);

    // Add columns back
    await queryRunner.query(`ALTER TABLE "sales_orders" ADD "createdByUserId" uuid`);
    await queryRunner.query(`ALTER TABLE "sales_orders" ADD "metadata" jsonb`);
    await queryRunner.query(`ALTER TABLE "sales_orders" ADD "internalNotes" text`);
    await queryRunner.query(`ALTER TABLE "sales_orders" ADD "customerPoNumber" text`);
    await queryRunner.query(`ALTER TABLE "sales_orders" ADD "trackingNumber" varchar(50)`);
    await queryRunner.query(`ALTER TABLE "sales_orders" ADD "shippingMethod" varchar(100)`);
    await queryRunner.query(`ALTER TABLE "sales_orders" ADD "shippingCountry" varchar(100)`);
    await queryRunner.query(`ALTER TABLE "sales_orders" ADD "shippingPostalCode" varchar(20)`);
    await queryRunner.query(`ALTER TABLE "sales_orders" ADD "shippingState" varchar(100)`);
    await queryRunner.query(`ALTER TABLE "sales_orders" ADD "shippingCity" varchar(100)`);
    await queryRunner.query(`ALTER TABLE "sales_orders" ADD "shippingAddress" text`);
    await queryRunner.query(`ALTER TABLE "sales_orders" ADD "deliveredDate" date`);
    await queryRunner.query(`ALTER TABLE "sales_orders" ADD "shippedDate" date`);
    await queryRunner.query(`ALTER TABLE "sales_orders" ADD "priority" "sales_orders_priority_enum" DEFAULT 'normal'`);
    await queryRunner.query(`ALTER TABLE "sales_orders" ADD "status" "sales_orders_status_enum" DEFAULT 'draft'`);

    // Recreate the index
    await queryRunner.query(`CREATE INDEX "IDX_sales_orders_createdByUserId" ON "sales_orders" ("createdByUserId")`);
  }
}
