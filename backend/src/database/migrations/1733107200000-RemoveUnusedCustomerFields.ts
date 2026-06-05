import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveUnusedCustomerFields1733107200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop unused customer columns
    await queryRunner.query(`
      ALTER TABLE "customers"
      DROP COLUMN IF EXISTS "email",
      DROP COLUMN IF EXISTS "contactPerson",
      DROP COLUMN IF EXISTS "alternativePhone",
      DROP COLUMN IF EXISTS "taxId",
      DROP COLUMN IF EXISTS "billingAddress",
      DROP COLUMN IF EXISTS "billingCity",
      DROP COLUMN IF EXISTS "billingState",
      DROP COLUMN IF EXISTS "billingPostalCode",
      DROP COLUMN IF EXISTS "billingCountry",
      DROP COLUMN IF EXISTS "shippingAddress",
      DROP COLUMN IF EXISTS "shippingCity",
      DROP COLUMN IF EXISTS "shippingState",
      DROP COLUMN IF EXISTS "shippingPostalCode",
      DROP COLUMN IF EXISTS "shippingCountry"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore unused columns for rollback
    await queryRunner.query(`
      ALTER TABLE "customers"
      ADD COLUMN IF NOT EXISTS "email" varchar(255),
      ADD COLUMN IF NOT EXISTS "contactPerson" varchar(200),
      ADD COLUMN IF NOT EXISTS "alternativePhone" varchar(20),
      ADD COLUMN IF NOT EXISTS "taxId" varchar(50),
      ADD COLUMN IF NOT EXISTS "billingAddress" text,
      ADD COLUMN IF NOT EXISTS "billingCity" varchar(100),
      ADD COLUMN IF NOT EXISTS "billingState" varchar(100),
      ADD COLUMN IF NOT EXISTS "billingPostalCode" varchar(20),
      ADD COLUMN IF NOT EXISTS "billingCountry" varchar(100),
      ADD COLUMN IF NOT EXISTS "shippingAddress" text,
      ADD COLUMN IF NOT EXISTS "shippingCity" varchar(100),
      ADD COLUMN IF NOT EXISTS "shippingState" varchar(100),
      ADD COLUMN IF NOT EXISTS "shippingPostalCode" varchar(20),
      ADD COLUMN IF NOT EXISTS "shippingCountry" varchar(100)
    `);
  }
}
