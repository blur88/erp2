import { MigrationInterface, QueryRunner } from "typeorm";

export class BackfillVendorPaymentReferenceNumber1785300000000 implements MigrationInterface {
    name = 'BackfillVendorPaymentReferenceNumber1785300000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            UPDATE vendor_payments
            SET "referenceNumber" = notes
            WHERE "referenceNumber" IS NULL
              AND notes IS NOT NULL
              AND notes <> ''
              AND notes NOT LIKE 'Auto-generated payment for PO %'
        `);
    }

    public async down(): Promise<void> {
    }
}
