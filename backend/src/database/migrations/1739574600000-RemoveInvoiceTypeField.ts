import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveInvoiceTypeField1739574600000 implements MigrationInterface {
  name = 'RemoveInvoiceTypeField1739574600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the index on the type column first (if it exists)
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_invoice_type" ON "invoices";
    `);

    // Drop the type column from the invoices table
    await queryRunner.query(`
      ALTER TABLE "invoices" DROP COLUMN "type";
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add the type column
    await queryRunner.query(`
      ALTER TABLE "invoices"
      ADD COLUMN "type" character varying NOT NULL DEFAULT 'standard';
    `);

    // Re-add the index on the type column
    await queryRunner.query(`
      CREATE INDEX "IDX_invoice_type" ON "invoices" ("type");
    `);
  }
}