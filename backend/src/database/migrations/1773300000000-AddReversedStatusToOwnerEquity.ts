import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReversedStatusToOwnerEquity1773300000000
  implements MigrationInterface
{
  name = 'AddReversedStatusToOwnerEquity1773300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."owner_equity_transactions_status_enum"
      ADD VALUE IF NOT EXISTS 'reversed'
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values directly.
    // To revert, recreate the enum without 'reversed' once no rows use it.
  }
}
