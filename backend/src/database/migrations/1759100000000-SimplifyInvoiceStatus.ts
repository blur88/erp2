import { MigrationInterface, QueryRunner } from "typeorm";

export class SimplifyInvoiceStatus1759100000000 implements MigrationInterface {
    name = 'SimplifyInvoiceStatus1759100000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Simplify invoice status to only: DRAFT, PARTIAL_PAID, PAID
        // Migration strategy:
        // - SENT, OVERDUE, CANCELLED, REFUNDED → Convert based on payment status

        // Step 1: Convert SENT and OVERDUE invoices based on payment status
        // If unpaid (paidAmount = 0), set to DRAFT
        await queryRunner.query(`
            UPDATE invoices
            SET status = 'draft'
            WHERE status IN ('sent', 'overdue')
            AND ("paidAmount" IS NULL OR "paidAmount" = 0)
        `);

        // If partially paid, set to PARTIAL_PAID
        await queryRunner.query(`
            UPDATE invoices
            SET status = 'partial_paid'
            WHERE status IN ('sent', 'overdue')
            AND "paidAmount" > 0
            AND "paidAmount" < "totalAmount"
        `);

        // If fully paid, set to PAID
        await queryRunner.query(`
            UPDATE invoices
            SET status = 'paid'
            WHERE status IN ('sent', 'overdue')
            AND "paidAmount" >= "totalAmount"
        `);

        // Step 2: Convert CANCELLED invoices to DRAFT (cancelled state tracked in internalNotes)
        await queryRunner.query(`
            UPDATE invoices
            SET status = 'draft',
                "internalNotes" = COALESCE("internalNotes", '') || E'\nCancelled (migrated from old status)'
            WHERE status = 'cancelled'
        `);

        // Step 3: Convert REFUNDED invoices to PARTIAL_PAID or DRAFT based on paidAmount
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

        // Step 4: Update the enum type to only allow DRAFT, PARTIAL_PAID, PAID
        // First, create new enum type
        await queryRunner.query(`
            CREATE TYPE "invoices_status_enum_new" AS ENUM('draft', 'partial_paid', 'paid')
        `);

        // Alter column to use new enum
        await queryRunner.query(`
            ALTER TABLE "invoices"
            ALTER COLUMN "status" TYPE "invoices_status_enum_new"
            USING "status"::text::"invoices_status_enum_new"
        `);

        // Drop old enum and rename new one
        await queryRunner.query(`DROP TYPE IF EXISTS "invoices_status_enum"`);
        await queryRunner.query(`ALTER TYPE "invoices_status_enum_new" RENAME TO "invoices_status_enum"`);
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
