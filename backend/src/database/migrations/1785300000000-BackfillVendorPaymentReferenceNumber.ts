import { MigrationInterface, QueryRunner } from "typeorm";

export class BackfillVendorPaymentReferenceNumber1785300000000 implements MigrationInterface {
    name = 'BackfillVendorPaymentReferenceNumber1785300000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Historical PO payments stored the user-entered reference in `notes`,
        // which no PO payment screen displays, while the UI renders
        // `referenceNumber`. Copy it across so history displays correctly.
        //
        // Guards, in order:
        //   "referenceNumber" IS NULL  — never overwrite a real reference; also
        //                                makes this migration re-runnable.
        //   notes IS NOT NULL          — nothing to copy.
        //   notes <> ''                — do not turn a clean NULL into ''.
        //   notes NOT LIKE 'Auto-...'  — excludes machine-written notes, the one
        //                                known class of genuine (non-reference)
        //                                notes. That literal was written only by
        //                                VendorPaymentService.createForPurchaseOrder,
        //                                removed in this same change, so the set
        //                                is closed and cannot grow.
        //   length(notes) <= 100       — `notes` is unbounded text but
        //                                `referenceNumber` is varchar(100), and
        //                                Postgres ERRORS on overflow rather than
        //                                truncating. Migration failure is fatal
        //                                (no schema:sync fallback), so a single
        //                                long note would break container startup.
        //                                Anything over 100 chars is prose, not a
        //                                reference number: those rows are left
        //                                alone rather than truncated into a
        //                                meaningless fragment. Their full text
        //                                remains readable in `notes`.
        //
        // `notes` is retained in every case: this migration only adds information.
        await queryRunner.query(`
            UPDATE vendor_payments
            SET "referenceNumber" = notes
            WHERE "referenceNumber" IS NULL
              AND notes IS NOT NULL
              AND notes <> ''
              AND notes NOT LIKE 'Auto-generated payment for PO %'
              AND length(notes) <= 100
        `);
    }

    public async down(): Promise<void> {
        // Intentional no-op. A true inverse would null `referenceNumber` for
        // backfilled rows, but after this migration those are indistinguishable
        // from references the user entered directly — reverting would destroy
        // real data. Safety outranks strict reversibility here.
    }
}
