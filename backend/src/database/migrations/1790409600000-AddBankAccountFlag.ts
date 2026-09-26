import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Issue #1298. Adds chart_of_account.isBankAccount and backfills it ONCE from
 * the Accounting Settings bank plus every non-clearing account mapped by a
 * BANK-channel payment method. After this the flag is authoritative; mappings
 * are never consulted again.
 *
 * Every conflict is detected BEFORE any write and aborts the migration with
 * one line per account. Runs in the runner's own transaction
 * (migrationsTransactionMode:'each', database-config.factory.ts:174), so the
 * throw rolls back the ADD COLUMN too. Do NOT set `transaction = false`.
 */
export class AddBankAccountFlag1790409600000 implements MigrationInterface {
  name = 'AddBankAccountFlag1790409600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chart_of_account" ADD "isBankAccount" boolean NOT NULL DEFAULT false`,
    );

    // Raw SQL does not apply TypeORM's soft-delete filter: a mapping outlives a
    // soft-deleted payment method (see PaymentMethodAccountMapping), and a
    // soft-deleted ACCOUNT must surface as a conflict, not vanish.
    const rows: Array<{
      id: string; code: string; name: string; type: string;
      isPostable: boolean; isProviderClearing: boolean; deletedAt: Date | null; source: string;
    }> = await queryRunner.query(`
      SELECT a.id, a.code, a.name, a.type::text AS type, a."isPostable",
             a."isProviderClearing", a."deletedAt", c.source
        FROM (
          SELECT s."bankAccountId" AS id, 'Accounting Settings Bank' AS source, 0 AS ord
            FROM accounting_settings s
          UNION ALL
          SELECT m."accountId", 'payment method "' || pm.name || '" (BANK)', 1
            FROM payment_method_account_mappings m
            JOIN payment_methods pm ON pm.id = m."paymentMethodId"
            JOIN chart_of_account ca ON ca.id = m."accountId"
           WHERE pm."accountingChannel" = 'BANK'
             AND ca."isProviderClearing" = false
        ) c
        JOIN chart_of_account a ON a.id = c.id
       ORDER BY a.code, c.ord, c.source`);

    const [settings] = await queryRunner.query(
      `SELECT "cashAccountId", "inventoryAccountId", "supplierDepositAccountId" FROM accounting_settings`,
    );

    const byId = new Map<string, { row: (typeof rows)[number]; sources: string[] }>();
    for (const r of rows) {
      const hit = byId.get(r.id);
      if (hit) hit.sources.push(r.source);
      else byId.set(r.id, { row: r, sources: [r.source] });
    }

    const conflicts: string[] = [];
    for (const { row: a, sources } of byId.values()) {
      const reasons = [
        a.type !== 'Asset' && 'is not an Asset account',
        !a.isPostable && 'is not postable',
        a.isProviderClearing && 'is a provider clearing account',
        a.deletedAt && 'is deleted',
        settings && a.id === settings.cashAccountId && 'is the Accounting Settings Cash account',
        settings && a.id === settings.inventoryAccountId && 'is the Accounting Settings Inventory account',
        settings && a.id === settings.supplierDepositAccountId && 'is the Accounting Settings Supplier Deposit account',
      ].filter(Boolean) as string[];
      if (reasons.length) {
        conflicts.push(`  - ${a.code} ${a.name} [source: ${sources.join('; ')}] — ${reasons.join('; ')}`);
      }
    }

    if (conflicts.length) {
      throw new Error(
        `AddBankAccountFlag: cannot backfill isBankAccount — ${conflicts.length} conflict(s). No changes were applied.\n` +
          `${conflicts.join('\n')}\n` +
          'Resolve each account (fix the mapping or Accounting Settings), then re-run migrations.',
      );
    }

    const ids = [...byId.keys()];
    if (ids.length) {
      await queryRunner.query(
        `UPDATE chart_of_account SET "isBankAccount" = true WHERE id = ANY($1::uuid[])`,
        [ids],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drops eligibility metadata only; journals and settlements are untouched.
    await queryRunner.query(`ALTER TABLE "chart_of_account" DROP COLUMN "isBankAccount"`);
  }
}
