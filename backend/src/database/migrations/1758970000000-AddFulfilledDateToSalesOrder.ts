import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFulfilledDateToSalesOrder1758970000000 implements MigrationInterface {
  name = 'AddFulfilledDateToSalesOrder1758970000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales_orders"
      ADD "fulfilledDate" TIMESTAMP NULL
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "sales_orders"."fulfilledDate" IS 'Date when order was fulfilled'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales_orders"
      DROP COLUMN "fulfilledDate"
    `);
  }
}