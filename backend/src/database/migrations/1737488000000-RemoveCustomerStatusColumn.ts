import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveCustomerStatusColumn1737488000000 implements MigrationInterface {
  name = 'RemoveCustomerStatusColumn1737488000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove the index on type, status (now just type)
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_customer_type_status"`
    );

    // Drop the status column
    await queryRunner.query(
      `ALTER TABLE "customers" DROP COLUMN IF EXISTS "status"`
    );

    // Recreate the index with just type
    await queryRunner.query(
      `CREATE INDEX "IDX_customer_type" ON "customers" ("type")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the new type-only index
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_customer_type"`);

    // Add back the status column
    await queryRunner.query(
      `ALTER TABLE "customers" ADD COLUMN "status" character varying NOT NULL DEFAULT 'active'`
    );

    // Add back the constraint for status enum
    await queryRunner.query(
      `ALTER TABLE "customers" ADD CONSTRAINT "CHK_customer_status" CHECK ("status" IN ('active', 'inactive', 'suspended', 'blacklisted'))`
    );

    // Recreate the original index
    await queryRunner.query(
      `CREATE INDEX "IDX_customer_type_status" ON "customers" ("type", "status")`
    );
  }
}