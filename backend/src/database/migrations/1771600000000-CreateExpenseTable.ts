import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateExpenseTable1771600000000 implements MigrationInterface {
  name = "CreateExpenseTable1771600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."expenses_status_enum" AS ENUM('draft', 'posted')
    `);
    await queryRunner.query(`
      CREATE TABLE "expenses" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        "createdBy" character varying,
        "updatedBy" character varying,
        "referenceNumber" character varying(30) NOT NULL,
        "expenseDate" date NOT NULL,
        "expenseAccountId" uuid NOT NULL,
        "amount" numeric(12,4) NOT NULL,
        "paymentMethodId" uuid NOT NULL,
        "description" text,
        "vendor" character varying(255),
        "status" "public"."expenses_status_enum" NOT NULL DEFAULT 'draft',
        "journalEntryId" uuid,
        "isActive" boolean NOT NULL DEFAULT true,
        CONSTRAINT "UQ_expenses_referenceNumber" UNIQUE ("referenceNumber"),
        CONSTRAINT "PK_expenses" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_expenses_referenceNumber"
      ON "expenses" ("referenceNumber")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_expenses_status"
      ON "expenses" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_expenses_expenseDate"
      ON "expenses" ("expenseDate")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_expenses_expenseAccountId"
      ON "expenses" ("expenseAccountId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_expenses_paymentMethodId"
      ON "expenses" ("paymentMethodId")
    `);
    await queryRunner.query(`
      ALTER TABLE "expenses"
      ADD CONSTRAINT "FK_expenses_paymentMethodId"
      FOREIGN KEY ("paymentMethodId")
      REFERENCES "payment_methods"("id")
      ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "expenses"
      ADD CONSTRAINT "FK_expenses_expenseAccountId"
      FOREIGN KEY ("expenseAccountId")
      REFERENCES "chart_of_accounts"("id")
      ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "expenses"
      ADD CONSTRAINT "FK_expenses_journalEntryId"
      FOREIGN KEY ("journalEntryId")
      REFERENCES "journal_entries"("id")
      ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "expenses" DROP CONSTRAINT "FK_expenses_journalEntryId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses" DROP CONSTRAINT "FK_expenses_expenseAccountId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses" DROP CONSTRAINT "FK_expenses_paymentMethodId"`,
    );
    await queryRunner.query(`DROP TABLE "expenses"`);
    await queryRunner.query(`DROP TYPE "public"."expenses_status_enum"`);
  }
}
