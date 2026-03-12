import { MigrationInterface, QueryRunner } from 'typeorm';

const FUND_TRANSFER_DOCUMENT_NUMBER_SETTING_ID =
  'd6fd8dd0-8f45-4a9f-bf2f-2fca7fd29e77';

export class AddFundTransferAndCashEquivalent1773294734525
  implements MigrationInterface
{
  name = 'AddFundTransferAndCashEquivalent1773294734525';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "chart_of_accounts"
      ADD COLUMN IF NOT EXISTS "isCashEquivalent" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."fund_transfer_status_enum" AS ENUM('ACTIVE', 'CANCELLED')
    `);

    await queryRunner.query(`
      CREATE TABLE "fund_transfers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "isActive" boolean NOT NULL DEFAULT true,
        "referenceNumber" character varying(50) NOT NULL,
        "transferDate" date NOT NULL,
        "sourceAccountId" uuid NOT NULL,
        "destinationAccountId" uuid NOT NULL,
        "amount" numeric(15,2) NOT NULL,
        "description" text,
        "status" "public"."fund_transfer_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "journalEntryId" uuid,
        "fiscalPeriodId" uuid NOT NULL,
        CONSTRAINT "UQ_fund_transfers_referenceNumber" UNIQUE ("referenceNumber"),
        CONSTRAINT "PK_fund_transfers" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_fund_transfers_referenceNumber" ON "fund_transfers" ("referenceNumber")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_fund_transfers_transferDate" ON "fund_transfers" ("transferDate")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_fund_transfers_status" ON "fund_transfers" ("status")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_fund_transfers_sourceAccountId" ON "fund_transfers" ("sourceAccountId")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_fund_transfers_destinationAccountId" ON "fund_transfers" ("destinationAccountId")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_fund_transfers_fiscalPeriodId" ON "fund_transfers" ("fiscalPeriodId")',
    );

    await queryRunner.query(`
      ALTER TABLE "fund_transfers"
      ADD CONSTRAINT "FK_fund_transfers_sourceAccountId"
      FOREIGN KEY ("sourceAccountId") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "fund_transfers"
      ADD CONSTRAINT "FK_fund_transfers_destinationAccountId"
      FOREIGN KEY ("destinationAccountId") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "fund_transfers"
      ADD CONSTRAINT "FK_fund_transfers_journalEntryId"
      FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "fund_transfers"
      ADD CONSTRAINT "FK_fund_transfers_fiscalPeriodId"
      FOREIGN KEY ("fiscalPeriodId") REFERENCES "fiscal_periods"("id") ON DELETE RESTRICT
    `);

    const currentYear = new Date().getFullYear() % 100;
    await queryRunner.query(
      `INSERT INTO "document_number_settings"
         ("id", "documentName", "prefix", "paddingDigits", "nextNumber", "lastResetYear")
       VALUES ($1, $2, $3, 3, 1, $4)
       ON CONFLICT ("documentName") DO NOTHING`,
      [
        FUND_TRANSFER_DOCUMENT_NUMBER_SETTING_ID,
        'Fund Transfers',
        'TRF',
        currentYear,
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "fund_transfers" DROP CONSTRAINT "FK_fund_transfers_fiscalPeriodId"',
    );
    await queryRunner.query(
      'ALTER TABLE "fund_transfers" DROP CONSTRAINT "FK_fund_transfers_journalEntryId"',
    );
    await queryRunner.query(
      'ALTER TABLE "fund_transfers" DROP CONSTRAINT "FK_fund_transfers_destinationAccountId"',
    );
    await queryRunner.query(
      'ALTER TABLE "fund_transfers" DROP CONSTRAINT "FK_fund_transfers_sourceAccountId"',
    );
    await queryRunner.query('DROP TABLE "fund_transfers"');
    await queryRunner.query('DROP TYPE "public"."fund_transfer_status_enum"');
    await queryRunner.query(
      'ALTER TABLE "chart_of_accounts" DROP COLUMN IF EXISTS "isCashEquivalent"',
    );
    await queryRunner.query(
      'DELETE FROM "document_number_settings" WHERE "id" = $1',
      [FUND_TRANSFER_DOCUMENT_NUMBER_SETTING_ID],
    );
  }
}
