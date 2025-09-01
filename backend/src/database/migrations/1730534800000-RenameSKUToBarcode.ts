import { MigrationInterface, QueryRunner } from "typeorm";

export class RenameSKUToBarcode1730534800000 implements MigrationInterface {
    name = 'RenameSKUToBarcode1730534800000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Drop the existing index on sku
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_45c4108e17f8e7bee84b7aeeeb"`);
        
        // Rename the column from sku to barcode
        await queryRunner.query(`ALTER TABLE "products" RENAME COLUMN "sku" TO "barcode"`);
        
        // Update the column length to match the new barcode field (100 chars instead of 50)
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "barcode" TYPE varchar(100)`);
        
        // Update the comment
        await queryRunner.query(`COMMENT ON COLUMN "products"."barcode" IS 'Product barcode - unique product identifier'`);
        
        // Create new unique index on barcode
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_products_barcode" ON "products" ("barcode")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop the index on barcode
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_barcode"`);
        
        // Rename the column back to sku
        await queryRunner.query(`ALTER TABLE "products" RENAME COLUMN "barcode" TO "sku"`);
        
        // Restore the original column length
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "sku" TYPE varchar(50)`);
        
        // Restore the original comment
        await queryRunner.query(`COMMENT ON COLUMN "products"."sku" IS 'Stock Keeping Unit - unique product identifier'`);
        
        // Recreate original index on sku
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_45c4108e17f8e7bee84b7aeeeb" ON "products" ("sku")`);
    }
}