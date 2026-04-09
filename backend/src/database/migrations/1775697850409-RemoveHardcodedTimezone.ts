import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveHardcodedTimezone1775697850409 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER DATABASE erp_db SET timezone TO 'UTC'`);
    await queryRunner.query(`
      COMMENT ON DATABASE erp_db IS 'ERP Database - Timezone: UTC (user timezone managed via RegionalSettings)'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER DATABASE erp_db SET timezone TO 'Asia/Kuala_Lumpur'`);
    await queryRunner.query(`
      COMMENT ON DATABASE erp_db IS 'ERP Database - Timezone: Asia/Kuala_Lumpur'
    `);
  }
}
