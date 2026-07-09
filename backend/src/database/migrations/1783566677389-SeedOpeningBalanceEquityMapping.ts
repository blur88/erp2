import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedOpeningBalanceEquityMapping1783566677389 implements MigrationInterface {
  name = 'SeedOpeningBalanceEquityMapping1783566677389';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "account_mappings" ("mappingKey", "accountId", "description", "isActive")
      VALUES ('opening_balance_equity', NULL,
              'Equity account used to offset per-account opening balances', true)
      ON CONFLICT ("mappingKey") DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "account_mappings" WHERE "mappingKey" = 'opening_balance_equity';
    `);
  }
}
