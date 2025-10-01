import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveUnusedInvoiceFields1759000000000 implements MigrationInterface {
    name = 'RemoveUnusedInvoiceFields1759000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Remove unused financial fields from invoices table
        // These fields were defined but never used in production
        // Discounts are tracked at the line item level in sales orders instead
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN IF EXISTS "discountPercent"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN IF EXISTS "discountAmount"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN IF EXISTS "taxPercent"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN IF EXISTS "taxAmount"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN IF EXISTS "additionalCharges"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN IF EXISTS "customerTaxId"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Add back the removed fields in case we need to rollback
        await queryRunner.query(`ALTER TABLE "invoices" ADD "discountPercent" NUMERIC(5,2) DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "discountAmount" NUMERIC(15,4) DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "taxPercent" NUMERIC(5,2) DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "taxAmount" NUMERIC(15,4) DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "additionalCharges" NUMERIC(15,4) DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "customerTaxId" VARCHAR(30)`);
    }
}
