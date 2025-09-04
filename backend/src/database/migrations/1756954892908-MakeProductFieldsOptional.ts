import { MigrationInterface, QueryRunner } from "typeorm";

export class MakeProductFieldsOptional1756954892908 implements MigrationInterface {
    name = 'MakeProductFieldsOptional1756954892908'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "barcode" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "retailPrice" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "wholesalePrice" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "specialPrice" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "specialPrice" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "wholesalePrice" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "retailPrice" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "barcode" SET NOT NULL`);
    }

}
