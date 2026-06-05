import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAddressFieldsToSuppliers1734310000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE suppliers
      ADD COLUMN IF NOT EXISTS "streetAddress" VARCHAR(255),
      ADD COLUMN IF NOT EXISTS city VARCHAR(100),
      ADD COLUMN IF NOT EXISTS state VARCHAR(100),
      ADD COLUMN IF NOT EXISTS "postalCode" VARCHAR(20),
      ADD COLUMN IF NOT EXISTS country VARCHAR(100)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE suppliers
      DROP COLUMN IF EXISTS "streetAddress",
      DROP COLUMN IF EXISTS city,
      DROP COLUMN IF EXISTS state,
      DROP COLUMN IF EXISTS "postalCode",
      DROP COLUMN IF EXISTS country
    `);
  }
}
