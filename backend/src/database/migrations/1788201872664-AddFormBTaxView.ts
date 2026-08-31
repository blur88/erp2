import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFormBTaxView1788201872664 implements MigrationInterface {
    name = 'AddFormBTaxView1788201872664'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."chart_of_account_formbexpensecategory_enum" AS ENUM('LOAN_INTEREST', 'SALARIES_AND_WAGES', 'RENT_LEASE', 'CONTRACT_SUBCONTRACT', 'COMMISSION', 'BAD_DEBTS', 'TRAVEL_TRANSPORT', 'REPAIRS_MAINTENANCE', 'PROMOTION_ADVERTISING', 'OTHER_EXPENSES')`);
        await queryRunner.query(`CREATE TYPE "public"."chart_of_account_formbincomecategory_enum" AS ENUM('OTHER_BUSINESS', 'DIVIDENDS', 'INTEREST_AND_DISCOUNTS', 'RENT_ROYALTIES_PREMIUMS', 'OTHER_INCOME')`);
        await queryRunner.query(`ALTER TABLE "chart_of_account" ADD COLUMN IF NOT EXISTS "formBExpenseCategory" "public"."chart_of_account_formbexpensecategory_enum"`);
        await queryRunner.query(`ALTER TABLE "chart_of_account" ADD COLUMN IF NOT EXISTS "formBIncomeCategory" "public"."chart_of_account_formbincomecategory_enum"`);
        await queryRunner.query(`CREATE TABLE "form_b_settings" ("id" boolean NOT NULL DEFAULT true, "businessName" character varying(255), "registrationNumber" character varying(50), "businessCode" character varying(5), "activityType" character varying(150), CONSTRAINT "CHK_602ff9c09fa10cfdfdb7096f37" CHECK ("id" = true), CONSTRAINT "PK_f42d0d8053bec4ccb80141dac80" PRIMARY KEY ("id"))`);
        await queryRunner.query(`INSERT INTO "form_b_settings" ("id") VALUES (true) ON CONFLICT DO NOTHING`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "form_b_settings"`);
        await queryRunner.query(`ALTER TABLE "chart_of_account" DROP COLUMN "formBIncomeCategory"`);
        await queryRunner.query(`DROP TYPE "public"."chart_of_account_formbincomecategory_enum"`);
        await queryRunner.query(`ALTER TABLE "chart_of_account" DROP COLUMN "formBExpenseCategory"`);
        await queryRunner.query(`DROP TYPE "public"."chart_of_account_formbexpensecategory_enum"`);
    }

}
