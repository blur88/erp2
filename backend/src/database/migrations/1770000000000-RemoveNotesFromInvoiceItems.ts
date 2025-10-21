import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveNotesFromInvoiceItems1770000000000 implements MigrationInterface {
  name = 'RemoveNotesFromInvoiceItems1770000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "invoice_items" DROP COLUMN IF EXISTS "notes"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "invoice_items" ADD "notes" text`);
  }
}