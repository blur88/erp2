import { MigrationInterface, QueryRunner } from 'typeorm';

export class SimplifyPaymentsTable1771000000000 implements MigrationInterface {
  name = 'SimplifyPaymentsTable1771000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop multi-currency columns
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "currency"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "exchangeRate"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "baseCurrencyAmount"`);

    // Drop payment processor columns
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "processor"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "processorTransactionId"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "processingFee"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "netAmount"`);

    // Drop payment method specific columns
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "referenceNumber"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "bankName"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "accountNumber"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "transactionDate"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "clearedDate"`);

    // Drop internal notes (keep only notes)
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "internalNotes"`);

    // Drop metadata
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "metadata"`);

    // Check if type column exists before modifying it
    const typeColumnExists = await queryRunner.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'payments' AND column_name = 'type'
    `);

    if (typeColumnExists.length > 0) {
      // Update default values - set all existing payments to have single values
      await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "type" SET DEFAULT 'payment'`);
      // Update all existing records to use the simplified values
      await queryRunner.query(`UPDATE "payments" SET "type" = 'payment' WHERE "type" != 'payment'`);
    }

    // Update default values for other columns
    await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "status" SET DEFAULT 'completed'`);
    await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "paymentMethod" SET DEFAULT 'cash'`);

    // Update all existing records to use the simplified values
    await queryRunner.query(`UPDATE "payments" SET "status" = 'completed' WHERE "status" != 'completed'`);
    await queryRunner.query(`UPDATE "payments" SET "paymentMethod" = 'cash' WHERE "paymentMethod" != 'cash'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add multi-currency columns
    await queryRunner.query(`ALTER TABLE "payments" ADD "currency" character varying(10) NOT NULL DEFAULT 'USD'`);
    await queryRunner.query(`ALTER TABLE "payments" ADD "exchangeRate" numeric(10,6) NOT NULL DEFAULT 1`);
    await queryRunner.query(`ALTER TABLE "payments" ADD "baseCurrencyAmount" numeric(15,4)`);

    // Re-add payment processor columns
    await queryRunner.query(`ALTER TABLE "payments" ADD "processor" character varying(100)`);
    await queryRunner.query(`ALTER TABLE "payments" ADD "processorTransactionId" character varying(100)`);
    await queryRunner.query(`ALTER TABLE "payments" ADD "processingFee" numeric(15,4) NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "payments" ADD "netAmount" numeric(15,4)`);

    // Re-add payment method specific columns
    await queryRunner.query(`ALTER TABLE "payments" ADD "referenceNumber" character varying(100)`);
    await queryRunner.query(`ALTER TABLE "payments" ADD "bankName" character varying(100)`);
    await queryRunner.query(`ALTER TABLE "payments" ADD "accountNumber" character varying(50)`);
    await queryRunner.query(`ALTER TABLE "payments" ADD "transactionDate" date`);
    await queryRunner.query(`ALTER TABLE "payments" ADD "clearedDate" date`);

    // Re-add internal notes
    await queryRunner.query(`ALTER TABLE "payments" ADD "internalNotes" text`);

    // Re-add metadata
    await queryRunner.query(`ALTER TABLE "payments" ADD "metadata" json`);

    // Check if type column exists before modifying it
    const typeColumnExists = await queryRunner.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'payments' AND column_name = 'type'
    `);

    if (typeColumnExists.length > 0) {
      // Restore original default values
      await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "type" SET DEFAULT 'payment'`);
    }

    // Restore original default values for other columns
    await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "status" SET DEFAULT 'pending'`);
    await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "paymentMethod" DROP DEFAULT`);
  }
}