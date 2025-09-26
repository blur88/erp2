import { MigrationInterface, QueryRunner } from 'typeorm';

export class SimplifyProductFields1726146000000 implements MigrationInterface {
  name = 'SimplifyProductFields1726146000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove columns that are no longer needed in simplified product model
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "status"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "unit"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "reservedQuantity"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "reorderLevel"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "optimalStockLevel"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "stockStatus"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "weight"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "dimensions"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "brand"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "model"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "imageUrl"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "additionalImages"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "attributes"`);

    // Drop indexes that are no longer needed
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_status_isActive"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_stockStatus"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_reorderLevel"`);

    // Update comment on stockQuantity column
    await queryRunner.query(`COMMENT ON COLUMN "products"."stockQuantity" IS 'Current stock quantity'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore removed columns with their original definitions
    await queryRunner.query(`ALTER TABLE "products" ADD "status" character varying NOT NULL DEFAULT 'active'`);
    await queryRunner.query(`ALTER TABLE "products" ADD "unit" character varying(20) NOT NULL DEFAULT 'pcs'`);
    await queryRunner.query(`ALTER TABLE "products" ADD "reservedQuantity" numeric(15,4) NOT NULL DEFAULT '0'`);
    await queryRunner.query(`ALTER TABLE "products" ADD "reorderLevel" numeric(15,4) NOT NULL DEFAULT '0'`);
    await queryRunner.query(`ALTER TABLE "products" ADD "optimalStockLevel" numeric(15,4) NOT NULL DEFAULT '0'`);
    await queryRunner.query(`ALTER TABLE "products" ADD "stockStatus" character varying NOT NULL DEFAULT 'in_stock'`);
    await queryRunner.query(`ALTER TABLE "products" ADD "weight" numeric(10,4)`);
    await queryRunner.query(`ALTER TABLE "products" ADD "dimensions" jsonb`);
    await queryRunner.query(`ALTER TABLE "products" ADD "brand" character varying(100)`);
    await queryRunner.query(`ALTER TABLE "products" ADD "model" character varying(100)`);
    await queryRunner.query(`ALTER TABLE "products" ADD "imageUrl" character varying(255)`);
    await queryRunner.query(`ALTER TABLE "products" ADD "additionalImages" jsonb`);
    await queryRunner.query(`ALTER TABLE "products" ADD "attributes" jsonb`);

    // Restore indexes
    await queryRunner.query(`CREATE INDEX "IDX_products_status_isActive" ON "products" ("status", "isActive")`);
    await queryRunner.query(`CREATE INDEX "IDX_products_stockStatus" ON "products" ("stockStatus")`);
    await queryRunner.query(`CREATE INDEX "IDX_products_reorderLevel" ON "products" ("reorderLevel")`);

    // Restore original comment
    await queryRunner.query(`COMMENT ON COLUMN "products"."stockQuantity" IS 'Current stock quantity (can be negative for stocked products)'`);
  }
}