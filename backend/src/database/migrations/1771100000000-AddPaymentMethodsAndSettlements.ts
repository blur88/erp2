import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPaymentMethodsAndSettlements1771100000000 implements MigrationInterface {
  name = "AddPaymentMethodsAndSettlements1771100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop old payment_methods table (different schema from previous dev work)
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_methods" CASCADE`);

    await queryRunner.query(
      `CREATE TYPE "settlement_status_enum" AS ENUM ('not_applicable', 'pending', 'settled')`,
    );
    await queryRunner.query(
      `CREATE TYPE "settlement_status_entity_enum" AS ENUM ('pending', 'completed', 'cancelled')`,
    );

    await queryRunner.query(`
      CREATE TABLE "payment_methods" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" varchar(20) NOT NULL,
        "name" varchar(100) NOT NULL,
        "requiresSettlement" boolean NOT NULL DEFAULT false,
        "sortOrder" int NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_payment_methods" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payment_methods_code" UNIQUE ("code")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_payment_methods_code" ON "payment_methods" ("code")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_methods_isActive" ON "payment_methods" ("isActive")`,
    );

    await queryRunner.query(`
      CREATE TABLE "settlements" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "settlementNumber" varchar(30) NOT NULL,
        "paymentMethodId" uuid NOT NULL,
        "settlementDate" date NOT NULL,
        "totalAmount" decimal(15,4) NOT NULL,
        "reference" varchar(100),
        "notes" text,
        "status" "settlement_status_entity_enum" NOT NULL DEFAULT 'completed',
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_settlements" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_settlements_number" UNIQUE ("settlementNumber"),
        CONSTRAINT "FK_settlements_paymentMethod" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_settlements_number" ON "settlements" ("settlementNumber")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_settlements_paymentMethodId" ON "settlements" ("paymentMethodId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_settlements_status" ON "settlements" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_settlements_date" ON "settlements" ("settlementDate")`,
    );

    await queryRunner.query(`
      ALTER TABLE "payments"
      ADD COLUMN "paymentMethodId" uuid,
      ADD COLUMN "settlementStatus" "settlement_status_enum" NOT NULL DEFAULT 'not_applicable',
      ADD COLUMN "settlementId" uuid
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_payments_paymentMethodId" ON "payments" ("paymentMethodId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payments_settlementId" ON "payments" ("settlementId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payments_settlementStatus" ON "payments" ("settlementStatus")`,
    );

    await queryRunner.query(`
      ALTER TABLE "payments"
      ADD CONSTRAINT "FK_payments_paymentMethod" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods"("id") ON DELETE RESTRICT,
      ADD CONSTRAINT "FK_payments_settlement" FOREIGN KEY ("settlementId") REFERENCES "settlements"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      INSERT INTO "payment_methods" ("code", "name", "requiresSettlement", "sortOrder") VALUES
      ('CASH', 'Cash', false, 1),
      ('BANK', 'Bank Transfer', false, 2),
      ('TNG', 'Touch n Go', true, 3),
      ('CC', 'Credit Card', true, 4),
      ('ATOME', 'Atome', true, 5),
      ('SHOPEE', 'Shopee', true, 6),
      ('TIKTOK', 'TikTok', true, 7)
    `);

    await queryRunner.query(`
      UPDATE "payments"
      SET "paymentMethodId" = (SELECT id FROM "payment_methods" WHERE code = 'CASH'),
          "settlementStatus" = 'not_applicable'
      WHERE "paymentMethodId" IS NULL
    `);

    await queryRunner.query(
      `ALTER TABLE "payments" ALTER COLUMN "paymentMethodId" SET NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "payments" DROP COLUMN "paymentMethod"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "payments_paymentmethod_enum"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "payments_paymentmethod_enum" AS ENUM ('cash')`,
    );
    await queryRunner.query(`
      ALTER TABLE "payments" ADD COLUMN "paymentMethod" "payments_paymentmethod_enum" NOT NULL DEFAULT 'cash'
    `);

    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "FK_payments_settlement"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "FK_payments_paymentMethod"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_payments_settlementStatus"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payments_settlementId"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_payments_paymentMethodId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP COLUMN "settlementId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP COLUMN "settlementStatus"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP COLUMN "paymentMethodId"`,
    );

    await queryRunner.query(`DROP TABLE IF EXISTS "settlements"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_methods"`);

    await queryRunner.query(
      `DROP TYPE IF EXISTS "settlement_status_entity_enum"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "settlement_status_enum"`);
  }
}
