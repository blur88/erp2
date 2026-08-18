import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #1094 — monetary Owner Equity documents complete implicitly on full
 * settlement, so the intermediate READY status no longer exists.
 *
 * Existing READY rows are by definition fully settled (only exact settlement
 * reached READY), which is exactly the state that now reads as COMPLETED, so
 * the backfill is a faithful reclassification rather than a lossy collapse.
 * CHK_oe_completion_metadata demands a stamp on every COMPLETED row, so the
 * backfill supplies one — completedAt from the row's own updatedAt, which is
 * when the settlement that completed it landed.
 *
 * CHK_oe_stock_no_ready is dropped rather than rewritten: it forbade a value
 * the enum no longer has.
 */
export class RemoveOwnerEquityReadyStatus1787076800000 implements MigrationInterface {
  name = 'RemoveOwnerEquityReadyStatus1787076800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "owner_equity_documents" DROP CONSTRAINT IF EXISTS "CHK_oe_stock_no_ready"`,
    );

    // Reclassify before narrowing the type, and satisfy the completion-metadata
    // CHECK in the same statement.
    await queryRunner.query(
      `UPDATE "owner_equity_documents"
         SET "documentStatus" = 'COMPLETED',
             "completedAt" = COALESCE("completedAt", "updatedAt"),
             "completedBy" = COALESCE("completedBy", 'system')
       WHERE "documentStatus" = 'READY'`,
    );

    // Every surviving CHECK that mentions "documentStatus" has its comparison
    // bound to the OLD enum type. ALTER COLUMN ... TYPE re-checks them against
    // the new type and fails with 42883 (no matching operator), so they must be
    // dropped around the swap and recreated after it.
    await queryRunner.query(
      `ALTER TABLE "owner_equity_documents" DROP CONSTRAINT "CHK_oe_completion_metadata"`,
    );
    await queryRunner.query(
      `ALTER TABLE "owner_equity_documents" DROP CONSTRAINT "CHK_oe_stock_cost_on_complete"`,
    );

    await queryRunner.query(
      `ALTER TYPE "public"."owner_equity_documents_documentstatus_enum" RENAME TO "owner_equity_documents_documentstatus_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."owner_equity_documents_documentstatus_enum" AS ENUM('DRAFT', 'COMPLETED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "owner_equity_documents" ALTER COLUMN "documentStatus" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "owner_equity_documents" ALTER COLUMN "documentStatus" TYPE "public"."owner_equity_documents_documentstatus_enum" USING "documentStatus"::text::"public"."owner_equity_documents_documentstatus_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "owner_equity_documents" ALTER COLUMN "documentStatus" SET DEFAULT 'DRAFT'`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."owner_equity_documents_documentstatus_enum_old"`,
    );

    // Recreated verbatim from the entity's @Check declarations so that
    // verify-baseline.sh still matches a schema:sync reference.
    await queryRunner.query(
      `ALTER TABLE "owner_equity_documents" ADD CONSTRAINT "CHK_oe_stock_cost_on_complete" CHECK (type <> 'STOCK_DRAWING' OR "documentStatus" <> 'COMPLETED' OR ("unitCost" IS NOT NULL AND "totalCost" IS NOT NULL))`,
    );
    await queryRunner.query(
      `ALTER TABLE "owner_equity_documents" ADD CONSTRAINT "CHK_oe_completion_metadata" CHECK (("documentStatus" = 'COMPLETED' AND "completedAt" IS NOT NULL AND "completedBy" IS NOT NULL) OR ("documentStatus" <> 'COMPLETED' AND "completedAt" IS NULL AND "completedBy" IS NULL))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Lossy in one direction only: a COMPLETED monetary document reverts to
    // READY (its pre-#1094 shape) and gives up its completion stamp, which the
    // old model did not carry at that status. Stock drawings stay COMPLETED —
    // CHK_oe_stock_no_ready forbids them from ever being READY.
    await queryRunner.query(
      `ALTER TABLE "owner_equity_documents" DROP CONSTRAINT "CHK_oe_completion_metadata"`,
    );
    await queryRunner.query(
      `ALTER TABLE "owner_equity_documents" DROP CONSTRAINT "CHK_oe_stock_cost_on_complete"`,
    );

    await queryRunner.query(
      `ALTER TYPE "public"."owner_equity_documents_documentstatus_enum" RENAME TO "owner_equity_documents_documentstatus_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."owner_equity_documents_documentstatus_enum" AS ENUM('DRAFT', 'READY', 'COMPLETED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "owner_equity_documents" ALTER COLUMN "documentStatus" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "owner_equity_documents" ALTER COLUMN "documentStatus" TYPE "public"."owner_equity_documents_documentstatus_enum" USING "documentStatus"::text::"public"."owner_equity_documents_documentstatus_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "owner_equity_documents" ALTER COLUMN "documentStatus" SET DEFAULT 'DRAFT'`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."owner_equity_documents_documentstatus_enum_old"`,
    );

    await queryRunner.query(
      `UPDATE "owner_equity_documents"
         SET "documentStatus" = 'READY',
             "completedAt" = NULL,
             "completedBy" = NULL
       WHERE "documentStatus" = 'COMPLETED' AND "type" <> 'STOCK_DRAWING'`,
    );

    await queryRunner.query(
      `ALTER TABLE "owner_equity_documents" ADD CONSTRAINT "CHK_oe_stock_cost_on_complete" CHECK (type <> 'STOCK_DRAWING' OR "documentStatus" <> 'COMPLETED' OR ("unitCost" IS NOT NULL AND "totalCost" IS NOT NULL))`,
    );
    await queryRunner.query(
      `ALTER TABLE "owner_equity_documents" ADD CONSTRAINT "CHK_oe_completion_metadata" CHECK (("documentStatus" = 'COMPLETED' AND "completedAt" IS NOT NULL AND "completedBy" IS NOT NULL) OR ("documentStatus" <> 'COMPLETED' AND "completedAt" IS NULL AND "completedBy" IS NULL))`,
    );
    await queryRunner.query(
      `ALTER TABLE "owner_equity_documents" ADD CONSTRAINT "CHK_oe_stock_no_ready" CHECK (type <> 'STOCK_DRAWING' OR "documentStatus" <> 'READY')`,
    );
  }
}
