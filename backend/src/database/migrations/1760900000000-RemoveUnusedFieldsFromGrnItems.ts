import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveUnusedFieldsFromGrnItems1760900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove unused fields from goods_received_note_items table
    await queryRunner.query(`
      ALTER TABLE "goods_received_note_items"
      DROP COLUMN IF EXISTS "productDescription",
      DROP COLUMN IF EXISTS "unit",
      DROP COLUMN IF EXISTS "qualityNotes",
      DROP COLUMN IF EXISTS "rejectionReason",
      DROP COLUMN IF EXISTS "batchNumber",
      DROP COLUMN IF EXISTS "expiryDate",
      DROP COLUMN IF EXISTS "storageLocation",
      DROP COLUMN IF EXISTS "notes";
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore the unused fields (for rollback purposes)
    await queryRunner.query(`
      ALTER TABLE "goods_received_note_items"
      ADD COLUMN "productDescription" text,
      ADD COLUMN "unit" varchar(20) NOT NULL DEFAULT 'pcs',
      ADD COLUMN "qualityNotes" text,
      ADD COLUMN "rejectionReason" varchar(500),
      ADD COLUMN "batchNumber" varchar(100),
      ADD COLUMN "expiryDate" date,
      ADD COLUMN "storageLocation" varchar(100),
      ADD COLUMN "notes" text;
    `);

    // Add comments back
    await queryRunner.query(`
      COMMENT ON COLUMN "goods_received_note_items"."productDescription" IS 'Product description at time of receipt';
      COMMENT ON COLUMN "goods_received_note_items"."unit" IS 'Unit of measurement';
      COMMENT ON COLUMN "goods_received_note_items"."qualityNotes" IS 'Quality inspection notes';
      COMMENT ON COLUMN "goods_received_note_items"."rejectionReason" IS 'Rejection reason if applicable';
      COMMENT ON COLUMN "goods_received_note_items"."batchNumber" IS 'Batch or lot number';
      COMMENT ON COLUMN "goods_received_note_items"."expiryDate" IS 'Expiry date for batch';
      COMMENT ON COLUMN "goods_received_note_items"."storageLocation" IS 'Storage location';
      COMMENT ON COLUMN "goods_received_note_items"."notes" IS 'Item-specific notes';
    `);
  }
}