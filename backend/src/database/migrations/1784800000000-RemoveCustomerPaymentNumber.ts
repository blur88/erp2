import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveCustomerPaymentNumber1784800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the trigram index explicitly; dropping the column then cascades the
    // column-dependent UNIQUE constraint/index automatically.
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_payments_paymentnumber_trgm"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "paymentNumber"`);
    await queryRunner.query(
      `DELETE FROM "document_number_settings"
        WHERE "documentName" IN ('Payments', 'Goods Received')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Historical PAY-* values are not recoverable; the column returns nullable.
    await queryRunner.query(`ALTER TABLE "payments" ADD COLUMN "paymentNumber" varchar(50)`);
    await queryRunner.query(
      `ALTER TABLE "payments"
         ADD CONSTRAINT "UQ_payments_paymentNumber" UNIQUE ("paymentNumber")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_payments_paymentnumber_trgm
       ON payments USING gin ("paymentNumber" gin_trgm_ops)`,
    );
    const yy = new Date().getFullYear() % 100;
    await queryRunner.query(
      `INSERT INTO "document_number_settings"
        ("documentName", "prefix", "paddingDigits", "nextNumber", "lastResetYear")
       VALUES ('Payments', 'PAY', 3, 1, $1), ('Goods Received', 'GRN', 3, 1, $1)
       ON CONFLICT ("documentName") DO NOTHING`,
      [yy],
    );
  }
}
