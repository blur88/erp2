import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveCategoryIsActiveColumn1726430400000 implements MigrationInterface {
  name = 'RemoveCategoryIsActiveColumn1726430400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the index first
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_c4b3b3c2d5d8a7e0a1e2b3c4d5"`);

    // Remove the isActive column from categories table
    await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN "isActive"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Add the isActive column back
    await queryRunner.query(`ALTER TABLE "categories" ADD "isActive" boolean NOT NULL DEFAULT true`);

    // Recreate the index
    await queryRunner.query(`CREATE INDEX "IDX_c4b3b3c2d5d8a7e0a1e2b3c4d5" ON "categories" ("isActive")`);
  }
}