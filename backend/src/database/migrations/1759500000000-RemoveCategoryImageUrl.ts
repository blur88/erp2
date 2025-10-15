import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveCategoryImageUrl1759500000000 implements MigrationInterface {
    name = 'RemoveCategoryImageUrl1759500000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN IF EXISTS "imageUrl"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "categories" ADD "imageUrl" character varying(255)`);
        await queryRunner.query(`COMMENT ON COLUMN "categories"."imageUrl" IS 'Category image URL or path'`);
    }
}