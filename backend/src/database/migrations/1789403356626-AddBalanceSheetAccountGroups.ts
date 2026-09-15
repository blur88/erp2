import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Explicit Balance Sheet line grouping (issue #1239).
 *
 * TABLE ONLY — no backfill, deliberately. Payment-method mappings identify
 * POSTING accounts, not Balance Sheet classifications: every mapped provider
 * account (Atome, Shopee, TikTok) shares `Accounting Channel = BANK` with the
 * real banks, so any backfill would have to GUESS which are banks and would
 * land the providers under N38 — the exact mis-grouping this issue reports.
 *
 * An empty table means both groups are empty, which re-arms the existing
 * settings-key fallbacks (bankAccountId -> N38, supplierDepositAccountId ->
 * N39). Every install therefore renders an unchanged Balance Sheet until an
 * administrator configures the groups.
 *
 * `accountId` is the PRIMARY KEY, which is what makes membership of both
 * groups at once unrepresentable rather than merely service-rejected. The FK
 * is ON DELETE RESTRICT so an account cannot be deleted out from under a
 * grouping, leaving the report reading a dangling id.
 *
 * NOTE: the generator also emitted three statements for PRE-EXISTING drift
 * between the dev database and the entities (a `price_lists` partial unique
 * index, and `expenses.paidAmount` / `redis_alert_state.recentEpisodes`
 * defaults). They were removed by hand: they are unrelated to this issue, and
 * the index drop would have removed a live constraint.
 */
export class AddBalanceSheetAccountGroups1789403356626 implements MigrationInterface {
  name = 'AddBalanceSheetAccountGroups1789403356626';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."balance_sheet_account_groups_groupline_enum" AS ENUM('BANK_BALANCE', 'OTHER_CURRENT_ASSETS')`,
    );
    await queryRunner.query(
      `CREATE TABLE "balance_sheet_account_groups" ("accountId" uuid NOT NULL, "groupLine" "public"."balance_sheet_account_groups_groupline_enum" NOT NULL, CONSTRAINT "PK_adedcc8b0dd03a6ab8036452838" PRIMARY KEY ("accountId"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "balance_sheet_account_groups" ADD CONSTRAINT "FK_adedcc8b0dd03a6ab8036452838" FOREIGN KEY ("accountId") REFERENCES "chart_of_account"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "balance_sheet_account_groups" DROP CONSTRAINT "FK_adedcc8b0dd03a6ab8036452838"`,
    );
    await queryRunner.query(`DROP TABLE "balance_sheet_account_groups"`);
    await queryRunner.query(
      `DROP TYPE "public"."balance_sheet_account_groups_groupline_enum"`,
    );
  }
}
