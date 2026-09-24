import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProviderClearingAccountFlag1790266673470
  implements MigrationInterface
{
  name = 'AddProviderClearingAccountFlag1790266673470';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chart_of_account" ADD "isProviderClearing" boolean NOT NULL DEFAULT false`,
    );

    // Seed the three provider clearing accounts created by
    // 1789658118888-AddPaymentMethodChannelAccounts, under the SAME invariants
    // later edits obey (spec §4.2). A missing or non-conforming account is
    // skipped, not aborted on: the flag is editable metadata.
    await queryRunner.query(`
      UPDATE chart_of_account a SET "isProviderClearing" = true
       WHERE a.code IN ('1220', '1230', '1240')
         AND a.type = 'Asset'
         AND a."isPostable" = true
         AND a."deletedAt" IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM accounting_settings s
            WHERE a.id IN (s."cashAccountId", s."bankAccountId", s."customerDepositAccountId"))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drops eligibility metadata only; journals and settlements are untouched.
    await queryRunner.query(
      `ALTER TABLE "chart_of_account" DROP COLUMN "isProviderClearing"`,
    );
  }
}
