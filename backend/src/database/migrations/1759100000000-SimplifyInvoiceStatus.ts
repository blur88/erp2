import { MigrationInterface, QueryRunner } from "typeorm";

export class SimplifyInvoiceStatus1759100000000 implements MigrationInterface {
    name = 'SimplifyInvoiceStatus1759100000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Simplify invoice status to only: DRAFT, PARTIAL_PAID, PAID
        // Migration strategy: Replace enum entirely with new values

        // Step 1: Drop default value and convert column to text temporarily
        await queryRunner.query(`
            ALTER TABLE "invoices"
            ALTER COLUMN "status" DROP DEFAULT
        `);

        await queryRunner.query(`
            ALTER TABLE "invoices"
            ALTER COLUMN "status" TYPE text
        `);

        // Step 2: Convert existing statuses based on payment status
        // Convert SENT and OVERDUE based on payment
        await queryRunner.query(`
            UPDATE invoices
            SET status = 'draft'
            WHERE status IN ('sent', 'overdue')
            AND ("paidAmount" IS NULL OR "paidAmount" = 0)
        `);

        await queryRunner.query(`
            UPDATE invoices
            SET status = 'partial_paid'
            WHERE status IN ('sent', 'overdue')
            AND "paidAmount" > 0
            AND "paidAmount" < "totalAmount"
        `);

        await queryRunner.query(`
            UPDATE invoices
            SET status = 'paid'
            WHERE status IN ('sent', 'overdue')
            AND "paidAmount" >= "totalAmount"
        `);

        // Convert CANCELLED to DRAFT
        await queryRunner.query(`
            UPDATE invoices
            SET status = 'draft',
                "internalNotes" = COALESCE("internalNotes", '') || E'\nCancelled (migrated from old status)'
            WHERE status = 'cancelled'
        `);

        // Convert REFUNDED based on payment
        await queryRunner.query(`
            UPDATE invoices
            SET status = CASE
                WHEN "paidAmount" > 0 AND "paidAmount" < "totalAmount" THEN 'partial_paid'
                WHEN "paidAmount" >= "totalAmount" THEN 'paid'
                ELSE 'draft'
            END,
            "internalNotes" = COALESCE("internalNotes", '') || E'\nRefunded (migrated from old status)'
            WHERE status = 'refunded'
        `);

        // Step 3: Drop old enum type with CASCADE
        await queryRunner.query(`DROP TYPE IF EXISTS "invoices_status_enum" CASCADE`);

        // Step 4: Create new enum type with only 3 values
        await queryRunner.query(`
            CREATE TYPE "invoices_status_enum" AS ENUM('draft', 'partial_paid', 'paid')
        `);

        // Step 5: Convert column back to enum
        await queryRunner.query(`
            ALTER TABLE "invoices"
            ALTER COLUMN "status" TYPE "invoices_status_enum"
            USING "status"::"invoices_status_enum"
        `);

        // Step 6: Set default value
        await queryRunner.query(`
            ALTER TABLE "invoices"
            ALTER COLUMN "status" SET DEFAULT 'draft'::"invoices_status_enum"
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Rollback: Restore original enum with all statuses
        // This is a simplified rollback - exact status cannot be restored from internalNotes

        // Create old enum type with all statuses
        await queryRunner.query(`
            CREATE TYPE "invoices_status_enum_old" AS ENUM(
                'draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled', 'refunded'
            )
        `);

        // Alter column back to old enum (map partial_paid → partially_paid)
        await queryRunner.query(`
            ALTER TABLE "invoices"
            ALTER COLUMN "status" TYPE "invoices_status_enum_old"
            USING CASE
                WHEN "status"::text = 'partial_paid' THEN 'partially_paid'::text
                ELSE "status"::text
            END::"invoices_status_enum_old"
        `);

        // Drop new enum and rename old one
        await queryRunner.query(`DROP TYPE IF EXISTS "invoices_status_enum"`);
        await queryRunner.query(`ALTER TYPE "invoices_status_enum_old" RENAME TO "invoices_status_enum"`);

        // Note: Cannot automatically restore SENT, OVERDUE, CANCELLED, REFUNDED statuses
        // Invoices will remain as DRAFT/PARTIALLY_PAID/PAID after rollback
    }
}
