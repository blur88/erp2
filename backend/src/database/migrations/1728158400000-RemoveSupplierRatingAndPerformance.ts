import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveSupplierRatingAndPerformance1728158400000 implements MigrationInterface {
    name = 'RemoveSupplierRatingAndPerformance1728158400000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Drop the rating index first
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_suppliers_rating"`);

        // Remove performance metric columns
        await queryRunner.query(`ALTER TABLE "suppliers" DROP COLUMN IF EXISTS "averageDeliveryTime"`);
        await queryRunner.query(`ALTER TABLE "suppliers" DROP COLUMN IF EXISTS "onTimeDeliveryRate"`);
        await queryRunner.query(`ALTER TABLE "suppliers" DROP COLUMN IF EXISTS "qualityRate"`);

        // Remove rating column
        await queryRunner.query(`ALTER TABLE "suppliers" DROP COLUMN IF EXISTS "rating"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Restore rating column and enum type
        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'suppliers_rating_enum') THEN
                    CREATE TYPE "suppliers_rating_enum" AS ENUM('excellent', 'good', 'average', 'poor', 'unrated');
                END IF;
            END $$;
        `);

        await queryRunner.query(`ALTER TABLE "suppliers" ADD "rating" "suppliers_rating_enum" DEFAULT 'unrated'`);

        // Restore performance metric columns
        await queryRunner.query(`ALTER TABLE "suppliers" ADD "averageDeliveryTime" numeric(5,2) DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "suppliers" ADD "onTimeDeliveryRate" numeric(5,2) DEFAULT '100'`);
        await queryRunner.query(`ALTER TABLE "suppliers" ADD "qualityRate" numeric(5,2) DEFAULT '100'`);

        // Restore the rating index
        await queryRunner.query(`CREATE INDEX "IDX_suppliers_rating" ON "suppliers" ("rating")`);
    }
}
