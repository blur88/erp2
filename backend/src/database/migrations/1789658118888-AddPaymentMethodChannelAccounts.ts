import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Issue #1243. Creates the payment-method -> GL account data the posting
 * matrix asserts.
 *
 * Runs inside the runner's own transaction (migrationsTransactionMode:'each',
 * database-config.factory.ts:170), so a failure in ANY step rolls back every
 * earlier step including the 1200 rename. Do not add COMMIT, and do not use
 * ALTER TYPE ... ADD VALUE here (it would force the runner out of a
 * transaction).
 *
 * Deliberately irreversible: see down().
 */
export class AddPaymentMethodChannelAccounts1789658118888
  implements MigrationInterface
{
  name = 'AddPaymentMethodChannelAccounts1789658118888';

  private static readonly NEW_ACCOUNTS: ReadonlyArray<[string, string]> = [
    ['1210', 'Maybank'],
    ['1220', 'Shopee'],
    ['1230', 'TikTok'],
    ['1240', 'Atome'],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- Conflict scan: BEFORE any write. -------------------------------
    // An existing row at one of these codes cannot be shown to BE the
    // Maybank/Shopee/TikTok/Atome account. Structural conformance (Asset,
    // postable, child of 1000) is a weak signal shared by most asset
    // accounts, so adopting it would risk mapping real payments into an
    // unrelated account. Abort and let a human decide.
    for (const [code] of AddPaymentMethodChannelAccounts1789658118888
      .NEW_ACCOUNTS) {
      const rows = await queryRunner.query(
        `SELECT code, name FROM chart_of_account WHERE code = $1`,
        [code],
      );
      if (rows.length > 0) {
        throw new Error(
          `AddPaymentMethodChannelAccounts: account ${code} already exists ` +
            `(name: "${rows[0].name}"). This migration will not adopt or remap ` +
            `an existing account. Rename or remove it, then re-run.`,
        );
      }
    }

    // --- A1: rename 1200 Bank -> CIMB, preserving id and history. -------
    const bank = await queryRunner.query(
      `SELECT id FROM chart_of_account WHERE code = '1200'`,
    );
    if (bank.length !== 1) {
      throw new Error(
        `AddPaymentMethodChannelAccounts: expected exactly one account 1200, ` +
          `found ${bank.length}. Manual reset required.`,
      );
    }
    await queryRunner.query(
      `UPDATE chart_of_account SET name = 'CIMB' WHERE code = '1200'`,
    );

    // --- A2: insert the four new accounts under 1000 Assets. ------------
    const assets = await queryRunner.query(
      `SELECT id FROM chart_of_account WHERE code = '1000'`,
    );
    if (assets.length !== 1) {
      throw new Error(
        `AddPaymentMethodChannelAccounts: expected exactly one account 1000, ` +
          `found ${assets.length}. Manual reset required.`,
      );
    }
    for (const [code, name] of AddPaymentMethodChannelAccounts1789658118888
      .NEW_ACCOUNTS) {
      await queryRunner.query(
        `INSERT INTO chart_of_account
           ("code", "name", "type", "parentId", "isSystem", "isPostable")
         VALUES ($1, $2, 'Asset', $3, true, true)`,
        [code, name, assets[0].id],
      );
    }
  }

  public async down(): Promise<void> {
    throw new Error(
      'AddPaymentMethodChannelAccounts is irreversible: up() is conditional, ' +
        'so nothing records whether this migration or an operator created a ' +
        'given account, method or mapping, and deleting on shape alone would ' +
        'destroy operator data. Restore from a pre-migration backup instead.',
    );
  }
}
