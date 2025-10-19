import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveAllUnusedInvoiceFields1760530000000 implements MigrationInterface {
    name = 'RemoveAllUnusedInvoiceFields1760530000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Remove all identified unused invoice fields
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN IF EXISTS "sentDate"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN IF EXISTS "billingAddress"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN IF EXISTS "paymentTermsDays"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN IF EXISTS "lineItems"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Add back the removed fields for rollback
        await queryRunner.query(`ALTER TABLE "invoices" ADD "sentDate" date`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "billingAddress" text`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "paymentTermsDays" integer DEFAULT '30' NOT NULL`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "lineItems" json`);
    }
}