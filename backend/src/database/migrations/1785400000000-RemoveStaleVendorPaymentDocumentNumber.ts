import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveStaleVendorPaymentDocumentNumber1785400000000 implements MigrationInterface {
    name = 'RemoveStaleVendorPaymentDocumentNumber1785400000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // PR #941 (#939) retired vendor payment numbering, and its migration
        // 1784600000000 deleted this row — but that migration never ran
        // anywhere (#950) and was removed with the other 83 by the
        // InitialSchema baseline (PR #955).
        //
        // The baseline does not resolve it. PR #955's documented upgrade path
        // runs `migration:run --fake`, which records genesis as applied without
        // executing it, so the canonical seed never runs and pre-existing
        // document_number_settings rows survive untouched. New databases get
        // the canonical five types and never had this row; legacy databases
        // still carry it, with nextNumber advanced by numbers actually issued.
        //
        // Nothing calls generateDocumentNumber('Vendor Payments'), and after
        // PR #947 the Document Numbers settings page renders only the five
        // active types — so the row is invisible and uneditable in the UI.
        //
        // Idempotent by construction: matches one row on a legacy database,
        // zero on a genesis-seeded one. No IF EXISTS guard is needed — the
        // table exists in both populations, created by genesis on new
        // databases and already present on legacy ones.
        await queryRunner.query(
            `DELETE FROM "document_number_settings" WHERE "documentName" = 'Vendor Payments'`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Rollback symmetry, NOT resumable numbering. The historical counter
        // (7 on the reporting database) is deliberately not restored: no code
        // path generates VP numbers, and capturing the pre-delete value would
        // add permanent machinery for behaviour the system does not support.
        // The deleted 1784600000000 and 1784800000000 migrations likewise
        // restored nextNumber = 1.
        //
        // Fixed literals only — no parameters, no new Date(). Migrations must
        // be deterministic (PR #955). lastResetYear = -1 is the genesis
        // sentinel: settings.service.ts tests `lastResetYear !== currentYY`,
        // so the first document issued in any year triggers the annual reset
        // and writes the true year.
        //
        // ON CONFLICT is arbitrated by UQ_87177891d3752f62710447bc072, the
        // existing unique constraint on documentName.
        await queryRunner.query(
            `INSERT INTO "document_number_settings"
                ("documentName", "prefix", "paddingDigits", "nextNumber", "lastResetYear")
             VALUES ('Vendor Payments', 'VP', 3, 1, -1)
             ON CONFLICT ("documentName") DO NOTHING`,
        );
    }
}
