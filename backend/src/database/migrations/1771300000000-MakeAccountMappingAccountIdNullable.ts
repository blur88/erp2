import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeAccountMappingAccountIdNullable1771300000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE account_mappings ALTER COLUMN "accountId" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE account_mappings ALTER COLUMN "accountId" SET NOT NULL`,
    );
  }
}
