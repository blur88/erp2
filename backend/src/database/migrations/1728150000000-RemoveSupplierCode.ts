import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveSupplierCode1728150000000 implements MigrationInterface {
  name = 'RemoveSupplierCode1728150000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the unique index on supplierCode
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_suppliers_supplierCode"`);

    // Remove the supplierCode column from suppliers table
    await queryRunner.query(`ALTER TABLE "suppliers" DROP COLUMN IF EXISTS "supplierCode"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Add back the supplierCode column
    await queryRunner.query(`
      ALTER TABLE "suppliers"
      ADD COLUMN "supplierCode" varchar(20) UNIQUE
    `);

    // Recreate the unique index
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_suppliers_supplierCode"
      ON "suppliers" ("supplierCode")
    `);

    // Add comment
    await queryRunner.query(`
      COMMENT ON COLUMN "suppliers"."supplierCode" IS 'Unique supplier code/number'
    `);
  }
}
