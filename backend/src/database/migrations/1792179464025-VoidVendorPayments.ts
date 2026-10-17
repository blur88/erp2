import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Issue #1401 (project 3). Gives vendor payments a void state so that
 * unpaying a payment stops soft-deleting it. A voided row carries the moment
 * it was voided ("voidedAt"), the user who voided it ("voidedByUserId", NULL
 * for rows this migration converted) and, when the void was a true reversal,
 * the journal entry that reversed the original ("voidReversalEntryId").
 *
 * `up` first refuses to run when a row cannot be represented as a void, then:
 *   1. adds the three columns and the RESTRICT FK to journal_entry;
 *   2. converts every soft-deleted row: status = 'voided',
 *      "voidedAt" = "deletedAt", "voidedByUserId" = NULL, "deletedAt" = NULL,
 *      "voidReversalEntryId" = the reversal of its expected original (NULL
 *      when the row has none);
 *   3. adds the two CHECKs: void state is two-sided, and soft delete is gone.
 *
 * `down` refuses while an application void exists (a row with a voider cannot
 * be restored to a soft-deleted shape), drops the CHECKs, restores ONLY the
 * rows this migration converted (status 'voided' AND "voidedByUserId" IS
 * NULL) to "deletedAt" = "voidedAt", status = 'completed', "isActive" = false,
 * then drops the FK and the columns.
 *
 * The blocking predicates replicate scripts/preflight-vendor-payments-void.sql
 * (Task 1 of #1401) exactly and are authoritative there: the reason names, the
 * predicate order and the two deliberate null semantics come from it --
 * `unexpected_posting_type` is any original whose posting type differs from
 * the expected one (a superset of the PAYMENT/REFUND pair), and
 * `foreign_document` uses IS DISTINCT FROM so a NULL sourceDocumentId counts
 * as foreign to a non-null purchase order. Keep both in sync.
 *
 * Runs in the runner's own transaction (migrationsTransactionMode 'each', see
 * database-config.factory.ts), so every throw rolls back the whole up/down.
 */
export class VoidVendorPayments1792179464025 implements MigrationInterface {
  name = 'VoidVendorPayments1792179464025';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const blocked: Array<{ reason: string; count: number }> = await queryRunner.query(`
      WITH candidates AS (
        SELECT
          vp.status,
          vp."isActive" AS is_active,
          vp."deletedAt" AS deleted_at,
          vp.amount,
          vp."purchaseOrderId" AS purchase_order_id,
          expected.id AS expected_original_id,
          expected."sourceDocumentId" AS expected_original_document,
          other_original.id AS other_original_id
        FROM vendor_payments vp
        LEFT JOIN LATERAL (
          SELECT o.id, o."sourceDocumentId"
          FROM journal_entry o
          WHERE o."sourceType"::text = 'PURCHASE_ORDER'
            AND o."sourceEventId" = vp.id
            AND o."reversalOfEntryId" IS NULL
            AND o."postingType"::text = CASE
              WHEN vp.amount > 0 THEN 'PURCHASE_PAYMENT'
              WHEN vp.amount < 0 THEN 'PURCHASE_REFUND'
            END
          LIMIT 1
        ) AS expected ON true
        LEFT JOIN LATERAL (
          SELECT o.id
          FROM journal_entry o
          WHERE o."sourceType"::text = 'PURCHASE_ORDER'
            AND o."sourceEventId" = vp.id
            AND o."reversalOfEntryId" IS NULL
            AND o."postingType"::text IS DISTINCT FROM (CASE
              WHEN vp.amount > 0 THEN 'PURCHASE_PAYMENT'
              WHEN vp.amount < 0 THEN 'PURCHASE_REFUND'
            END)
          ORDER BY o.id
          LIMIT 1
        ) AS other_original ON true
      ),
      blocked AS (
        SELECT
          CASE
            WHEN c.status = 'voided' THEN 'already_voided'
            WHEN c.deleted_at IS NOT NULL AND c.is_active THEN 'soft_deleted_still_active'
            WHEN NOT c.is_active AND c.deleted_at IS NULL THEN 'inactive_not_soft_deleted'
            WHEN c.deleted_at IS NOT NULL AND c.status <> 'completed' THEN 'soft_deleted_not_completed'
            WHEN c.deleted_at IS NOT NULL AND c.amount = 0 THEN 'zero_amount'
            WHEN c.deleted_at IS NOT NULL AND c.purchase_order_id IS NULL THEN 'no_purchase_order'
            WHEN c.deleted_at IS NOT NULL AND c.other_original_id IS NOT NULL THEN 'unexpected_posting_type'
            WHEN c.deleted_at IS NOT NULL AND c.expected_original_id IS NOT NULL
              AND c.expected_original_document IS DISTINCT FROM c.purchase_order_id THEN 'foreign_document'
          END AS reason
        FROM candidates c
      )
      SELECT reason, count(*)::int AS count
      FROM blocked
      WHERE reason IS NOT NULL
      GROUP BY reason
      ORDER BY array_position(ARRAY[
        'already_voided',
        'soft_deleted_still_active',
        'inactive_not_soft_deleted',
        'soft_deleted_not_completed',
        'zero_amount',
        'no_purchase_order',
        'unexpected_posting_type',
        'foreign_document'
      ]::text[], reason)
    `);

    if (blocked.length > 0) {
      const { reason, count } = blocked[0];
      throw new Error(
        `VoidVendorPayments: ${count} vendor payment(s) abort the migration with reason '${reason}'. ` +
          'No change was applied. Resolve the rows (see #1401) and re-run.',
      );
    }

    await queryRunner.query(
      `ALTER TABLE "vendor_payments" ADD "voidedAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(`ALTER TABLE "vendor_payments" ADD "voidedByUserId" uuid`);
    await queryRunner.query(`ALTER TABLE "vendor_payments" ADD "voidReversalEntryId" uuid`);
    await queryRunner.query(
      `ALTER TABLE "vendor_payments" ADD CONSTRAINT "FK_vendor_payments_void_reversal" FOREIGN KEY ("voidReversalEntryId") REFERENCES "journal_entry"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`
      UPDATE "vendor_payments" vp
         SET "status" = 'voided',
             "voidedAt" = vp."deletedAt",
             "voidedByUserId" = NULL,
             "deletedAt" = NULL,
             "voidReversalEntryId" = (
               SELECT r.id
               FROM "journal_entry" r
               JOIN "journal_entry" o ON o.id = r."reversalOfEntryId"
               WHERE o."sourceType"::text = 'PURCHASE_ORDER'
                 AND o."sourceEventId" = vp.id
                 AND o."reversalOfEntryId" IS NULL
                 AND o."postingType"::text = CASE
                   WHEN vp.amount > 0 THEN 'PURCHASE_PAYMENT'
                   WHEN vp.amount < 0 THEN 'PURCHASE_REFUND'
                 END
               LIMIT 1
             )
       WHERE vp."deletedAt" IS NOT NULL
    `);

    await queryRunner.query(
      `ALTER TABLE "vendor_payments" ADD CONSTRAINT "CHK_vendor_payments_void_state" CHECK (("status" = 'voided') = ("voidedAt" IS NOT NULL) AND ("status" = 'voided') = (NOT "isActive"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_payments" ADD CONSTRAINT "CHK_vendor_payments_never_soft_deleted" CHECK ("deletedAt" IS NULL)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const [applicationVoids] = await queryRunner.query(
      `SELECT count(*)::int AS count FROM "vendor_payments"
        WHERE "status" = 'voided' AND "voidedByUserId" IS NOT NULL`,
    );
    if (applicationVoids.count > 0) {
      throw new Error(
        `VoidVendorPayments: cannot revert — ${applicationVoids.count} application void(s) exist ` +
          "(status 'voided' with a voider). No change was applied.",
      );
    }

    await queryRunner.query(
      `ALTER TABLE "vendor_payments" DROP CONSTRAINT "CHK_vendor_payments_never_soft_deleted"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendor_payments" DROP CONSTRAINT "CHK_vendor_payments_void_state"`,
    );

    await queryRunner.query(`
      UPDATE "vendor_payments"
         SET "deletedAt" = "voidedAt",
             "status" = 'completed',
             "isActive" = false
       WHERE "status" = 'voided' AND "voidedByUserId" IS NULL
    `);

    await queryRunner.query(
      `ALTER TABLE "vendor_payments" DROP CONSTRAINT "FK_vendor_payments_void_reversal"`,
    );
    await queryRunner.query(`ALTER TABLE "vendor_payments" DROP COLUMN "voidReversalEntryId"`);
    await queryRunner.query(`ALTER TABLE "vendor_payments" DROP COLUMN "voidedByUserId"`);
    await queryRunner.query(`ALTER TABLE "vendor_payments" DROP COLUMN "voidedAt"`);
  }
}
