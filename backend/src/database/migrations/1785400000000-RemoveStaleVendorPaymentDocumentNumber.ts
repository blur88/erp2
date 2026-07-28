import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveStaleVendorPaymentDocumentNumber1785400000000 implements MigrationInterface {
    name = 'RemoveStaleVendorPaymentDocumentNumber1785400000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `DELETE FROM "document_number_settings" WHERE "documentName" = 'Vendor Payments'`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `INSERT INTO "document_number_settings"
                ("documentName", "prefix", "paddingDigits", "nextNumber", "lastResetYear")
             VALUES ('Vendor Payments', 'VP', 3, 1, -1)
             ON CONFLICT ("documentName") DO NOTHING`,
        );
    }
}
