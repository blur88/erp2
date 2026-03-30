import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLowStockThresholdToRegionalSettings1774808524105 implements MigrationInterface {
    name = 'AddLowStockThresholdToRegionalSettings1774808524105'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "regional_settings" ADD "lowStockThreshold" integer NOT NULL DEFAULT '10'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "regional_settings" DROP COLUMN "lowStockThreshold"`);
    }

}
