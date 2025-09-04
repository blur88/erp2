import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveCodeDescriptionFromCategories1735649200000 implements MigrationInterface {
    name = 'RemoveCodeDescriptionFromCategories1735649200000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Drop the unique index on code first
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_77d06de503ac8268fd9c21b8dc"`);
        
        // Remove the code column
        await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN IF EXISTS "code"`);
        
        // Remove the description column
        await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN IF EXISTS "description"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Add back the description column
        await queryRunner.query(`ALTER TABLE "categories" ADD "description" text`);
        
        // Add back the code column
        await queryRunner.query(`ALTER TABLE "categories" ADD "code" character varying(20)`);
        
        // Add back the unique constraint on code
        await queryRunner.query(`ALTER TABLE "categories" ADD CONSTRAINT "UQ_77d06de503ac8268fd9c21b8dc" UNIQUE ("code")`);
        
        // Add back the index
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_77d06de503ac8268fd9c21b8dc" ON "categories" ("code") WHERE code IS NOT NULL`);
    }
}