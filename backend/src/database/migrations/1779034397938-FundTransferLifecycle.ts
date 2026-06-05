import { MigrationInterface, QueryRunner } from "typeorm";

export class FundTransferLifecycle1779034397938 implements MigrationInterface {
    name = 'FundTransferLifecycle1779034397938'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "fund_transfers" ALTER COLUMN "status" TYPE varchar USING "status"::text`);
        await queryRunner.query(`UPDATE fund_transfers SET status = 'posted' WHERE status = 'ACTIVE'`);
        await queryRunner.query(`UPDATE fund_transfers SET status = 'reversed' WHERE status = 'CANCELLED'`);
        await queryRunner.query(`ALTER TYPE "public"."fund_transfers_status_enum" RENAME TO "fund_transfers_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."fund_transfers_status_enum" AS ENUM('draft', 'posted', 'reversed')`);
        await queryRunner.query(`ALTER TABLE "fund_transfers" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "fund_transfers" ALTER COLUMN "status" TYPE "public"."fund_transfers_status_enum" USING "status"::"text"::"public"."fund_transfers_status_enum"`);
        await queryRunner.query(`ALTER TABLE "fund_transfers" ALTER COLUMN "status" SET DEFAULT 'draft'`);
        await queryRunner.query(`DROP TYPE "public"."fund_transfers_status_enum_old"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "fund_transfers" ALTER COLUMN "status" TYPE varchar USING "status"::text`);
        await queryRunner.query(`UPDATE fund_transfers SET status = 'ACTIVE' WHERE status = 'posted'`);
        await queryRunner.query(`UPDATE fund_transfers SET status = 'CANCELLED' WHERE status = 'reversed'`);
        await queryRunner.query(`CREATE TYPE "public"."fund_transfers_status_enum_old" AS ENUM('ACTIVE', 'CANCELLED')`);
        await queryRunner.query(`ALTER TABLE "fund_transfers" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "fund_transfers" ALTER COLUMN "status" TYPE "public"."fund_transfers_status_enum_old" USING "status"::"text"::"public"."fund_transfers_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "fund_transfers" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'`);
        await queryRunner.query(`DROP TYPE "public"."fund_transfers_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."fund_transfers_status_enum_old" RENAME TO "fund_transfers_status_enum"`);
    }

}
