import { MigrationInterface, QueryRunner } from "typeorm";

export class SetTimezoneToAsiaKualaLumpur1732750000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Set PostgreSQL timezone to Asia/Kuala_Lumpur for the current session
    await queryRunner.query(`SET TIME ZONE 'Asia/Kuala_Lumpur'`);

    // Set default timezone for the database (persistent across sessions)
    await queryRunner.query(
      `ALTER DATABASE erp_db SET timezone TO 'Asia/Kuala_Lumpur'`,
    );

    // Add comment to document timezone setting
    await queryRunner.query(`
      COMMENT ON DATABASE erp_db IS 'ERP Database - Timezone: Asia/Kuala_Lumpur'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore to UTC timezone
    await queryRunner.query(`ALTER DATABASE erp_db SET timezone TO 'UTC'`);

    // Update database comment
    await queryRunner.query(`
      COMMENT ON DATABASE erp_db IS 'ERP Database - Timezone: UTC'
    `);
  }
}
