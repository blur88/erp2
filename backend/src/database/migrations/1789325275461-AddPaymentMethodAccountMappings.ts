import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPaymentMethodAccountMappings1789325275461 implements MigrationInterface {
    name = 'AddPaymentMethodAccountMappings1789325275461'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "payment_method_account_mappings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "isActive" boolean NOT NULL DEFAULT true, "paymentMethodId" uuid NOT NULL, "accountId" uuid NOT NULL, CONSTRAINT "PK_10814186fcc60524f9b1be89c61" PRIMARY KEY ("id")); COMMENT ON COLUMN "payment_method_account_mappings"."isActive" IS 'Soft delete flag for performance queries'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_f1fe4cd984c032357fe931838f" ON "payment_method_account_mappings"  ("paymentMethodId") `);
        await queryRunner.query(`ALTER TABLE "payment_method_account_mappings" ADD CONSTRAINT "FK_f1fe4cd984c032357fe931838ff" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payment_method_account_mappings" ADD CONSTRAINT "FK_d6604b4d9296573409e7f490c1e" FOREIGN KEY ("accountId") REFERENCES "chart_of_account"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "payment_method_account_mappings" DROP CONSTRAINT "FK_d6604b4d9296573409e7f490c1e"`);
        await queryRunner.query(`ALTER TABLE "payment_method_account_mappings" DROP CONSTRAINT "FK_f1fe4cd984c032357fe931838ff"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f1fe4cd984c032357fe931838f"`);
        await queryRunner.query(`DROP TABLE "payment_method_account_mappings"`);
    }

}
