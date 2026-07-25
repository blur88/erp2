import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveVendorPaymentNumber1784600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_vendor_payments_paymentnumber_trgm"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_payments" DROP COLUMN IF EXISTS "paymentNumber"`,
    );
    await queryRunner.query(
      `DELETE FROM "document_number_settings" WHERE "documentName" = 'Vendor Payments'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "vendor_payments" ADD COLUMN "paymentNumber" varchar(50)`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_payments"
         ADD CONSTRAINT "UQ_vendor_payments_paymentNumber" UNIQUE ("paymentNumber")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_vendor_payments_paymentnumber_trgm
       ON vendor_payments USING gin ("paymentNumber" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `INSERT INTO "document_number_settings"
        ("documentName", "prefix", "paddingDigits", "nextNumber", "lastResetYear")
       VALUES ('Vendor Payments', 'VP', 3, 1, $1)
       ON CONFLICT ("documentName") DO NOTHING`,
      [new Date().getFullYear() % 100],
    );
  }
}
