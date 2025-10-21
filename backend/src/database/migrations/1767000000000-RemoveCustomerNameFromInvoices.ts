import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveCustomerNameFromInvoices1767000000000 implements MigrationInterface {
  name = 'RemoveCustomerNameFromInvoices1767000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "customerName"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "invoices" ADD "customerName" character varying(200) NOT NULL`);
    await queryRunner.query(`UPDATE "invoices" i SET "customerName" = c.name FROM "customers" c WHERE i."customerId" = c.id`);
  }
}