import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentMethodIdToVendorPayments1771400000000
  implements MigrationInterface
{
  name = 'AddPaymentMethodIdToVendorPayments1771400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vendor_payments"
      ADD COLUMN IF NOT EXISTS "paymentMethodId" uuid
    `);

    await queryRunner.query(`
      UPDATE "vendor_payments" vp
      SET "paymentMethodId" = pm.id
      FROM "payment_methods" pm
      WHERE (
        (vp."paymentMethod" = 'cash' AND pm.code = 'CASH')
        OR (vp."paymentMethod" = 'bank_transfer' AND pm.code = 'BANK')
        OR (vp."paymentMethod" = 'check' AND pm.code = 'BANK')
        OR (vp."paymentMethod" = 'card' AND pm.code = 'CC')
      )
      AND vp."paymentMethodId" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "vendor_payments"
      DROP COLUMN IF EXISTS "paymentMethod"
    `);

    await queryRunner.query(`
      ALTER TABLE "vendor_payments"
      ADD CONSTRAINT "FK_vendor_payments_paymentMethodId"
      FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods"("id")
      ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vendor_payments"
      DROP CONSTRAINT IF EXISTS "FK_vendor_payments_paymentMethodId"
    `);

    await queryRunner.query(`
      ALTER TABLE "vendor_payments"
      ADD COLUMN IF NOT EXISTS "paymentMethod" varchar(50)
    `);

    await queryRunner.query(`
      UPDATE "vendor_payments" vp
      SET "paymentMethod" = CASE
        WHEN pm.code = 'CASH' THEN 'cash'
        WHEN pm.code = 'BANK' THEN 'bank_transfer'
        WHEN pm.code = 'CC' THEN 'card'
        ELSE 'cash'
      END
      FROM "payment_methods" pm
      WHERE vp."paymentMethodId" = pm.id
    `);

    await queryRunner.query(`
      ALTER TABLE "vendor_payments"
      DROP COLUMN IF EXISTS "paymentMethodId"
    `);
  }
}
