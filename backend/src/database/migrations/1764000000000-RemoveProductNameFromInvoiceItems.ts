import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveProductNameFromInvoiceItems1764000000000 implements MigrationInterface {
  name = 'RemoveProductNameFromInvoiceItems1764000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove productName column from invoice_items table
    await queryRunner.query(`ALTER TABLE "invoice_items" DROP COLUMN "productName"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Add productName column back for rollback
    await queryRunner.query(`
      ALTER TABLE "invoice_items"
      ADD COLUMN "productName" character varying(200) NOT NULL
    `);
  }
}