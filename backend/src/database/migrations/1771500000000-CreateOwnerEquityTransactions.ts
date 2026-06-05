import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOwnerEquityTransactions1771500000000 implements MigrationInterface {
  name = 'CreateOwnerEquityTransactions1771500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."owner_equity_transactions_type_enum" AS ENUM('capital_injection', 'owner_drawing')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."owner_equity_transactions_status_enum" AS ENUM('draft', 'posted')
    `);
    await queryRunner.query(`
      CREATE TABLE "owner_equity_transactions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        "createdBy" character varying,
        "updatedBy" character varying,
        "referenceNumber" character varying(30) NOT NULL,
        "transactionDate" date NOT NULL,
        "type" "public"."owner_equity_transactions_type_enum" NOT NULL,
        "amount" numeric(12,4) NOT NULL,
        "paymentMethodId" uuid NOT NULL,
        "description" text,
        "status" "public"."owner_equity_transactions_status_enum" NOT NULL DEFAULT 'draft',
        "journalEntryId" uuid,
        "isActive" boolean NOT NULL DEFAULT true,
        CONSTRAINT "UQ_owner_equity_transactions_referenceNumber" UNIQUE ("referenceNumber"),
        CONSTRAINT "PK_owner_equity_transactions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_owner_equity_transactions_referenceNumber"
      ON "owner_equity_transactions" ("referenceNumber")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_owner_equity_transactions_type"
      ON "owner_equity_transactions" ("type")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_owner_equity_transactions_status"
      ON "owner_equity_transactions" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_owner_equity_transactions_transactionDate"
      ON "owner_equity_transactions" ("transactionDate")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_owner_equity_transactions_paymentMethodId"
      ON "owner_equity_transactions" ("paymentMethodId")
    `);
    await queryRunner.query(`
      ALTER TABLE "owner_equity_transactions"
      ADD CONSTRAINT "FK_owner_equity_transactions_paymentMethodId"
      FOREIGN KEY ("paymentMethodId")
      REFERENCES "payment_methods"("id")
      ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "owner_equity_transactions"
      ADD CONSTRAINT "FK_owner_equity_transactions_journalEntryId"
      FOREIGN KEY ("journalEntryId")
      REFERENCES "journal_entries"("id")
      ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "owner_equity_transactions" DROP CONSTRAINT "FK_owner_equity_transactions_journalEntryId"`);
    await queryRunner.query(`ALTER TABLE "owner_equity_transactions" DROP CONSTRAINT "FK_owner_equity_transactions_paymentMethodId"`);
    await queryRunner.query(`DROP TABLE "owner_equity_transactions"`);
    await queryRunner.query(`DROP TYPE "public"."owner_equity_transactions_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."owner_equity_transactions_type_enum"`);
  }
}
