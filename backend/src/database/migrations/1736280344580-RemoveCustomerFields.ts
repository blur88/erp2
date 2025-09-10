import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveCustomerFields1736280344580 implements MigrationInterface {
    name = 'RemoveCustomerFields1736280344580'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Drop indices first
        await queryRunner.query(`DROP INDEX "public"."IDX_b6a1b8c8ce90a5c2a0f7e7b0a5"`);
        
        // Remove fields from customers table
        await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "contactPerson"`);
        await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "email"`);
        await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "alternativePhone"`);
        await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "taxId"`);
        await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "billingAddress"`);
        await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "billingCity"`);
        await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "billingState"`);
        await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "billingPostalCode"`);
        await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "billingCountry"`);
        await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "shippingAddress"`);
        await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "shippingCity"`);
        await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "shippingState"`);
        await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "shippingPostalCode"`);
        await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "shippingCountry"`);
        await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "creditLimit"`);
        await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "currentBalance"`);
        await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "paymentTermsDays"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Re-add fields to customers table
        await queryRunner.query(`ALTER TABLE "customers" ADD "paymentTermsDays" integer NOT NULL DEFAULT '30'`);
        await queryRunner.query(`ALTER TABLE "customers" ADD "currentBalance" numeric(15,4) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "customers" ADD "creditLimit" numeric(15,4) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "customers" ADD "shippingCountry" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "customers" ADD "shippingPostalCode" character varying(20)`);
        await queryRunner.query(`ALTER TABLE "customers" ADD "shippingState" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "customers" ADD "shippingCity" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "customers" ADD "shippingAddress" text`);
        await queryRunner.query(`ALTER TABLE "customers" ADD "billingCountry" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "customers" ADD "billingPostalCode" character varying(20)`);
        await queryRunner.query(`ALTER TABLE "customers" ADD "billingState" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "customers" ADD "billingCity" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "customers" ADD "billingAddress" text`);
        await queryRunner.query(`ALTER TABLE "customers" ADD "taxId" character varying(30)`);
        await queryRunner.query(`ALTER TABLE "customers" ADD "alternativePhone" character varying(20)`);
        await queryRunner.query(`ALTER TABLE "customers" ADD "email" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "customers" ADD "contactPerson" character varying(200)`);
        
        // Re-create unique index on email
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_b6a1b8c8ce90a5c2a0f7e7b0a5" ON "customers" ("email") WHERE email IS NOT NULL`);
    }
}