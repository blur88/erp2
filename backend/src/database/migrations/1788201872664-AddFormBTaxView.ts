import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFormBTaxView1788201872664 implements MigrationInterface {
    name = 'AddFormBTaxView1788201872664'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."chart_of_account_formbexpensecategory_enum" AS ENUM('LOAN_INTEREST', 'SALARIES_AND_WAGES', 'RENT_LEASE', 'CONTRACT_SUBCONTRACT', 'COMMISSION', 'BAD_DEBTS', 'TRAVEL_TRANSPORT', 'REPAIRS_MAINTENANCE', 'PROMOTION_ADVERTISING', 'OTHER_EXPENSES')`);
        await queryRunner.query(`CREATE TYPE "public"."chart_of_account_formbincomecategory_enum" AS ENUM('OTHER_BUSINESS', 'DIVIDENDS', 'INTEREST_AND_DISCOUNTS', 'RENT_ROYALTIES_PREMIUMS', 'OTHER_INCOME')`);
        await queryRunner.query(`ALTER TABLE "chart_of_account" ADD COLUMN IF NOT EXISTS "formBExpenseCategory" "public"."chart_of_account_formbexpensecategory_enum"`);
        await queryRunner.query(`ALTER TABLE "chart_of_account" ADD COLUMN IF NOT EXISTS "formBIncomeCategory" "public"."chart_of_account_formbincomecategory_enum"`);
        // Form B business identity (N1/N1a) comes from Company Settings, not a
        // table of its own: it is company identity that happens to be printed on
        // a tax form, and a second writable copy would drift from the one the
        // rest of the system shows.
        await queryRunner.query(`ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "registrationNumber" character varying(50)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "company_settings" DROP COLUMN "registrationNumber"`);
        await queryRunner.query(`ALTER TABLE "chart_of_account" DROP COLUMN "formBIncomeCategory"`);
        await queryRunner.query(`DROP TYPE "public"."chart_of_account_formbincomecategory_enum"`);
        await queryRunner.query(`ALTER TABLE "chart_of_account" DROP COLUMN "formBExpenseCategory"`);
        await queryRunner.query(`DROP TYPE "public"."chart_of_account_formbexpensecategory_enum"`);
    }

}
