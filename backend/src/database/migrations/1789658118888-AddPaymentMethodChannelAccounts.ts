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
    // Guard BEFORE the write. 1200 must be exactly one LIVE account named
    // 'Bank' (fresh seed) or 'CIMB' (already renamed by an operator). Any
    // other name, or a soft-deleted 1200, cannot be shown to be the seeded
    // bank account: relabeling it CIMB would silently corrupt an operator's
    // chart. Abort and let a human reconcile.
    const bank = await queryRunner.query(
      `SELECT name, "deletedAt" FROM chart_of_account WHERE code = '1200'`,
    );
    const live = bank.filter(
      (row: { deletedAt: Date | null }) => row.deletedAt === null,
    );
    const liveName = live.length === 1 ? live[0].name : null;
    if (
      live.length !== 1 ||
      (liveName !== 'Bank' && liveName !== 'CIMB')
    ) {
      throw new Error(
        `AddPaymentMethodChannelAccounts: account 1200 must be exactly one ` +
          `live account named "Bank" or "CIMB" (found ${bank.length} ` +
          `row(s), ${live.length} live` +
          (bank.length > 0
            ? `, names: ${bank
                .map((row: { name: string }) => `"${row.name}"`)
                .join(', ')}`
            : '') +
          `). This migration will not rename a repurposed or deleted ` +
          `account. A human must reconcile account 1200, then re-run.`,
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

    // --- A3: add the two missing payment methods. -----------------------
    // CASH, ATOME, SHOPEE and TIKTOK already exist (InitialSchema:213).
    // Insert only where the code is absent, so a hand-created method is kept.
    const NEW_METHODS: ReadonlyArray<[string, string, number]> = [
      ['CIMB', 'CIMB', 8],
      ['MAYBANK', 'Maybank', 9],
    ];
    for (const [code, name, sortOrder] of NEW_METHODS) {
      await queryRunner.query(
        `INSERT INTO payment_methods
           ("code", "name", "sortOrder", "useForPurchases", "accountingChannel")
         VALUES ($1, $2, $3, true, 'BANK')
         ON CONFLICT ("code") DO NOTHING`,
        [code, name, sortOrder],
      );
    }

    // --- A4: map each method to its account, only where UNMAPPED. -------
    // Production may map a method elsewhere on purpose; that must survive.
    // The unique index on "paymentMethodId" makes "insert if absent" the
    // whole rule (1789325275461-AddPaymentMethodAccountMappings.ts:7).
    const MAPPINGS: ReadonlyArray<[string, string]> = [
      ['CASH', '1100'],
      ['CIMB', '1200'],
      ['MAYBANK', '1210'],
      ['SHOPEE', '1220'],
      ['TIKTOK', '1230'],
      ['ATOME', '1240'],
    ];
    for (const [methodCode, accountCode] of MAPPINGS) {
      await queryRunner.query(
        `INSERT INTO payment_method_account_mappings ("paymentMethodId", "accountId")
         SELECT pm.id, coa.id
           FROM payment_methods pm
           CROSS JOIN chart_of_account coa
          WHERE pm.code = $1
            AND coa.code = $2
            AND NOT EXISTS (
              SELECT 1 FROM payment_method_account_mappings m
               WHERE m."paymentMethodId" = pm.id
            )`,
        [methodCode, accountCode],
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
