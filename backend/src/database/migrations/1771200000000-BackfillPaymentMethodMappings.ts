import { MigrationInterface, QueryRunner } from "typeorm";

export class BackfillPaymentMethodMappings1771200000000 implements MigrationInterface {
  name = "BackfillPaymentMethodMappings1771200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Backfill primary payment mappings for seeded/default methods.
    await queryRunner.query(`
      WITH payment_method_account_map AS (
        SELECT * FROM (
          VALUES
            ('CASH', '1000'),
            ('BANK', '1100'),
            ('TNG', '1120'),
            ('CC', '1130'),
            ('ATOME', '1140'),
            ('SHOPEE', '1150'),
            ('TIKTOK', '1160')
        ) AS m(code, account_code)
      )
      INSERT INTO "account_mappings" ("mappingKey", "accountId", "description", "isActive")
      SELECT
        LOWER('payment_' || pm.code),
        coa.id,
        pm.name || ' payment received account',
        true
      FROM payment_method_account_map m
      INNER JOIN "payment_methods" pm
        ON pm.code = m.code
       AND pm."deletedAt" IS NULL
      INNER JOIN "chart_of_accounts" coa
        ON coa.code = m.account_code
       AND coa."isActive" = true
       AND coa."deletedAt" IS NULL
      ON CONFLICT ("mappingKey")
      DO UPDATE SET
        "accountId" = EXCLUDED."accountId",
        "description" = EXCLUDED."description",
        "isActive" = true,
        "deletedAt" = NULL,
        "updatedAt" = now()
    `);

    // Backfill settlement mappings for methods that require settlement.
    await queryRunner.query(`
      INSERT INTO "account_mappings" ("mappingKey", "accountId", "description", "isActive")
      SELECT
        LOWER('payment_' || pm.code || '_settlement'),
        bank.id,
        pm.name || ' settlement to bank account',
        true
      FROM "payment_methods" pm
      INNER JOIN "chart_of_accounts" bank
        ON bank.code = '1100'
       AND bank."isActive" = true
       AND bank."deletedAt" IS NULL
      WHERE pm."requiresSettlement" = true
        AND pm."deletedAt" IS NULL
      ON CONFLICT ("mappingKey")
      DO UPDATE SET
        "accountId" = EXCLUDED."accountId",
        "description" = EXCLUDED."description",
        "isActive" = true,
        "deletedAt" = NULL,
        "updatedAt" = now()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "account_mappings"
      WHERE "mappingKey" IN (
        'payment_cash',
        'payment_bank',
        'payment_tng',
        'payment_cc',
        'payment_atome',
        'payment_shopee',
        'payment_tiktok',
        'payment_tng_settlement',
        'payment_cc_settlement',
        'payment_atome_settlement',
        'payment_shopee_settlement',
        'payment_tiktok_settlement'
      )
    `);
  }
}
