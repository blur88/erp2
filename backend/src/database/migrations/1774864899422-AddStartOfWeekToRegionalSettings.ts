import { MigrationInterface, QueryRunner } from "typeorm";

export class AddStartOfWeekToRegionalSettings1774864899422 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "regional_settings" ADD COLUMN IF NOT EXISTS "startOfWeek" integer NOT NULL DEFAULT 1`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "regional_settings" DROP COLUMN IF EXISTS "startOfWeek"`,
    );
  }
}
