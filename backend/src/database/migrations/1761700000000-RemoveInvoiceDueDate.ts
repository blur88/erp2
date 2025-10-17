import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveInvoiceDueDate1761700000000 implements MigrationInterface {
  name = 'RemoveInvoiceDueDate1761700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the index on dueDate first
    await queryRunner.query(`DROP INDEX "public"."invoices_dueDate"`);

    // Remove the dueDate column from invoices table
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "dueDate"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Add back the dueDate column
    await queryRunner.query(`ALTER TABLE "invoices" ADD "dueDate" date NOT NULL`);

    // Recreate the index
    await queryRunner.query(`CREATE INDEX "public"."invoices_dueDate" ON "invoices" ("dueDate")`);
  }
}