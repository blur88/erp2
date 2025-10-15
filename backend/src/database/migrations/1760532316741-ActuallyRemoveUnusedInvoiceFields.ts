import { MigrationInterface, QueryRunner } from "typeorm";

export class ActuallyRemoveUnusedInvoiceFields1760532316741 implements MigrationInterface {
  name = "ActuallyRemoveUnusedInvoiceFields1760532316741";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove completely unused fields from invoices table
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN IF EXISTS "metadata"`);
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN IF EXISTS "notes"`);
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN IF EXISTS "internalNotes"`);
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN IF EXISTS "sentDate"`);
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN IF EXISTS "customerPoNumber"`);
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN IF EXISTS "paymentTerms"`);

    // Remove redundant subtotal field (same as totalAmount)
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN IF EXISTS "subtotal"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Add back the removed fields in case we need to rollback
    await queryRunner.query(`ALTER TABLE "invoices" ADD "subtotal" NUMERIC(15,4) DEFAULT '0' NOT NULL`);
    await queryRunner.query(`ALTER TABLE "invoices" ADD "paymentTerms" text`);
    await queryRunner.query(`ALTER TABLE "invoices" ADD "customerPoNumber" character varying(50)`);
    await queryRunner.query(`ALTER TABLE "invoices" ADD "sentDate" date`);
    await queryRunner.query(`ALTER TABLE "invoices" ADD "internalNotes" text`);
    await queryRunner.query(`ALTER TABLE "invoices" ADD "notes" text`);
    await queryRunner.query(`ALTER TABLE "invoices" ADD "metadata" json`);
  }
}