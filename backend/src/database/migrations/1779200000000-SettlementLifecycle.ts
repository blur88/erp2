import { MigrationInterface, QueryRunner } from 'typeorm';

export class SettlementLifecycle1779200000000 implements MigrationInterface {
  name = 'SettlementLifecycle1779200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "settlements" ALTER COLUMN "status" TYPE varchar USING "status"::text`);
    await queryRunner.query(`UPDATE "settlements" SET "status" = 'draft' WHERE "status" = 'pending'`);
    await queryRunner.query(`UPDATE "settlements" SET "status" = 'posted' WHERE "status" = 'completed'`);
    await queryRunner.query(`UPDATE "settlements" SET "status" = 'reversed' WHERE "status" = 'cancelled'`);
    await queryRunner.query(`ALTER TABLE "settlements" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."settlements_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."settlement_status_entity_enum"`);
    await queryRunner.query(`CREATE TYPE "public"."settlements_status_enum" AS ENUM('draft', 'posted', 'reversed')`);
    await queryRunner.query(`ALTER TABLE "settlements" ALTER COLUMN "status" TYPE "public"."settlements_status_enum" USING "status"::text::"public"."settlements_status_enum"`);
    await queryRunner.query(`ALTER TABLE "settlements" ALTER COLUMN "status" SET DEFAULT 'draft'`);
    await queryRunner.query(`ALTER TABLE "settlements" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP WITH TIME ZONE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "settlements" DROP COLUMN IF EXISTS "deletedAt"`);
    await queryRunner.query(`ALTER TABLE "settlements" ALTER COLUMN "status" TYPE varchar USING "status"::text`);
    await queryRunner.query(`UPDATE "settlements" SET "status" = 'pending' WHERE "status" = 'draft'`);
    await queryRunner.query(`UPDATE "settlements" SET "status" = 'completed' WHERE "status" = 'posted'`);
    await queryRunner.query(`UPDATE "settlements" SET "status" = 'cancelled' WHERE "status" = 'reversed'`);
    await queryRunner.query(`ALTER TABLE "settlements" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."settlements_status_enum"`);
    await queryRunner.query(`CREATE TYPE "public"."settlement_status_entity_enum" AS ENUM('pending', 'completed', 'cancelled')`);
    await queryRunner.query(`ALTER TABLE "settlements" ALTER COLUMN "status" TYPE "public"."settlement_status_entity_enum" USING "status"::text::"public"."settlement_status_entity_enum"`);
    await queryRunner.query(`ALTER TABLE "settlements" ALTER COLUMN "status" SET DEFAULT 'completed'`);
  }
}
