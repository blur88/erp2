import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveAccountingModule1783591412316 implements MigrationInterface {
  name = 'RemoveAccountingModule1783591412316';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "FK_payments_settlement"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payments_settlementId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payments_settlementStatus"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "settlementId"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "settlementStatus"`);

    await queryRunner.query(`ALTER TABLE "payment_methods" DROP COLUMN IF EXISTS "requiresSettlement"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "journal_entry_lines" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reconciled_transactions" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "account_mappings" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bank_reconciliations" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "settlements" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "owner_equity_transactions" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "expenses" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "fund_transfers" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "journal_entries" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chart_of_accounts" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "fiscal_periods" CASCADE`);

    await queryRunner.query(`DROP TYPE IF EXISTS "settlement_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "settlement_status_entity_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."settlements_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."owner_equity_transactions_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."owner_equity_transactions_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."expenses_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."fund_transfer_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."fund_transfers_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."fund_transfers_status_enum_old"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."chart_of_accounts_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."journal_entries_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."journal_entries_status_enum_old"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."journal_entries_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."fiscal_periods_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."bank_reconciliations_status_enum"`);
  }

  public async down(): Promise<void> {
    throw new Error(
      'RemoveAccountingModule is irreversible: the removed accounting schema and data cannot be faithfully restored. Restore from a backup if needed.',
    );
  }
}
