import { MigrationInterface, QueryRunner } from "typeorm";

export class SupplierBillingShippingAddress1779500000000 implements MigrationInterface {
  name = "SupplierBillingShippingAddress1779500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "email" varchar(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "billingStreetAddress" varchar(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "billingStreetAddress2" varchar(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "billingCity" varchar(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "billingState" varchar(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "billingPostalCode" varchar(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "billingCountry" varchar(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "shippingStreetAddress" varchar(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "shippingStreetAddress2" varchar(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "shippingCity" varchar(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "shippingState" varchar(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "shippingPostalCode" varchar(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "shippingCountry" varchar(100)`,
    );

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'suppliers' AND column_name = 'streetAddress'
        ) THEN
          UPDATE "suppliers"
          SET "billingStreetAddress" = "streetAddress"
          WHERE "streetAddress" IS NOT NULL AND "billingStreetAddress" IS NULL;
          ALTER TABLE "suppliers" DROP COLUMN "streetAddress";
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'suppliers' AND column_name = 'city'
        ) THEN
          UPDATE "suppliers"
          SET "billingCity" = "city"
          WHERE "city" IS NOT NULL AND "billingCity" IS NULL;
          ALTER TABLE "suppliers" DROP COLUMN "city";
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'suppliers' AND column_name = 'state'
        ) THEN
          UPDATE "suppliers"
          SET "billingState" = "state"
          WHERE "state" IS NOT NULL AND "billingState" IS NULL;
          ALTER TABLE "suppliers" DROP COLUMN "state";
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'suppliers' AND column_name = 'postalCode'
        ) THEN
          UPDATE "suppliers"
          SET "billingPostalCode" = "postalCode"
          WHERE "postalCode" IS NOT NULL AND "billingPostalCode" IS NULL;
          ALTER TABLE "suppliers" DROP COLUMN "postalCode";
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'suppliers' AND column_name = 'country'
        ) THEN
          UPDATE "suppliers"
          SET "billingCountry" = "country"
          WHERE "country" IS NOT NULL AND "billingCountry" IS NULL;
          ALTER TABLE "suppliers" DROP COLUMN "country";
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "streetAddress" varchar(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "city" varchar(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "state" varchar(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "postalCode" varchar(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "country" varchar(100)`,
    );

    await queryRunner.query(`
      UPDATE "suppliers"
      SET
        "streetAddress" = COALESCE("streetAddress", "billingStreetAddress"),
        "city" = COALESCE("city", "billingCity"),
        "state" = COALESCE("state", "billingState"),
        "postalCode" = COALESCE("postalCode", "billingPostalCode"),
        "country" = COALESCE("country", "billingCountry")
      WHERE "billingStreetAddress" IS NOT NULL
         OR "billingCity" IS NOT NULL
         OR "billingState" IS NOT NULL
         OR "billingPostalCode" IS NOT NULL
         OR "billingCountry" IS NOT NULL
    `);

    await queryRunner.query(
      `ALTER TABLE "suppliers" DROP COLUMN IF EXISTS "shippingCountry"`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" DROP COLUMN IF EXISTS "shippingPostalCode"`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" DROP COLUMN IF EXISTS "shippingState"`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" DROP COLUMN IF EXISTS "shippingCity"`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" DROP COLUMN IF EXISTS "shippingStreetAddress2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" DROP COLUMN IF EXISTS "shippingStreetAddress"`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" DROP COLUMN IF EXISTS "billingCountry"`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" DROP COLUMN IF EXISTS "billingPostalCode"`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" DROP COLUMN IF EXISTS "billingState"`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" DROP COLUMN IF EXISTS "billingCity"`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" DROP COLUMN IF EXISTS "billingStreetAddress2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" DROP COLUMN IF EXISTS "billingStreetAddress"`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" DROP COLUMN IF EXISTS "email"`,
    );
  }
}
