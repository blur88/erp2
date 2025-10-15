import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Remove customerCode column from customers table
 *
 * This migration removes the customerCode column from the customers table:
 * - customerCode: Unique business identifier (no longer needed, using UUID instead)
 *
 * The system will now use only the UUID 'id' field as the unique identifier.
 */
export class RemoveCustomerCodeFromCustomers1761000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove the unique index on customerCode first
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_5029e0ca955a46e2066e8c0c4f"
    `);

    // Remove the unique constraint on customerCode
    await queryRunner.query(`
      ALTER TABLE "customers"
      DROP CONSTRAINT IF EXISTS "UQ_5029e0ca955a46e2066e8c0c4f0"
    `);

    // Remove the customerCode column
    await queryRunner.query(`
      ALTER TABLE "customers"
      DROP COLUMN IF EXISTS "customerCode"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore the customerCode column if migration is rolled back
    await queryRunner.query(`
      ALTER TABLE "customers"
      ADD COLUMN "customerCode" VARCHAR(20) NOT NULL
    `);

    // Add back the unique constraint
    await queryRunner.query(`
      ALTER TABLE "customers"
      ADD CONSTRAINT "UQ_5029e0ca955a46e2066e8c0c4f0" UNIQUE ("customerCode")
    `);

    // Add back the index
    await queryRunner.query(`
      CREATE INDEX "IDX_5029e0ca955a46e2066e8c0c4f" ON "customers" ("customerCode")
    `);

    // Add back the comment
    await queryRunner.query(`
      COMMENT ON COLUMN "customers"."customerCode" IS 'Unique customer code/number'
    `);
  }
}