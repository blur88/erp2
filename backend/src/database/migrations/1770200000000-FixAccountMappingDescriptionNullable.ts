import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Fix account_mappings.description to allow NULL values
 * The entity has nullable: true but the database constraint was NOT NULL
 */
export class FixAccountMappingDescriptionNullable1770200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Alter the description column to allow NULL values
    await queryRunner.query(
      `ALTER TABLE "account_mappings" ALTER COLUMN "description" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert back to NOT NULL (requires setting a default value first)
    await queryRunner.query(
      `UPDATE "account_mappings" SET "description" = '' WHERE "description" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "account_mappings" ALTER COLUMN "description" SET NOT NULL`,
    );
  }
}
