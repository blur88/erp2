import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCustomerStreetAddress21779400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE customers
        ADD COLUMN IF NOT EXISTS "billingStreetAddress2" varchar(255) NULL,
        ADD COLUMN IF NOT EXISTS "shippingStreetAddress2" varchar(255) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE customers
        DROP COLUMN IF EXISTS "billingStreetAddress2",
        DROP COLUMN IF EXISTS "shippingStreetAddress2"
    `);
  }
}
