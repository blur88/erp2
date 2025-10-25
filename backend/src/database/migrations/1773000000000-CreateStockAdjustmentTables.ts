import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateStockAdjustmentTables1773000000000 implements MigrationInterface {
    name = 'CreateStockAdjustmentTables1773000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create stock_adjustments table
        await queryRunner.query(`
            CREATE TABLE "stock_adjustments" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "adjustmentNumber" character varying(50) NOT NULL,
                "adjustmentDate" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "status" character varying NOT NULL DEFAULT 'draft',
                "notes" text,
                "itemCount" integer NOT NULL DEFAULT 0,
                "totalValue" numeric(15,4) NOT NULL DEFAULT 0,
                "adjustedByUserId" uuid,
                "isActive" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deletedAt" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_stock_adjustments" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_stock_adjustments_number" UNIQUE ("adjustmentNumber")
            )
        `);

        // Create stock_adjustment_items table
        await queryRunner.query(`
            CREATE TABLE "stock_adjustment_items" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "stockAdjustmentId" uuid NOT NULL,
                "productId" uuid NOT NULL,
                "oldQuantity" numeric(15,4) NOT NULL,
                "newQuantity" numeric(15,4) NOT NULL,
                "difference" numeric(15,4) NOT NULL,
                "unitCost" numeric(15,4),
                "totalValue" numeric(15,4),
                "notes" text,
                "isActive" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deletedAt" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_stock_adjustment_items" PRIMARY KEY ("id")
            )
        `);

        // Create indexes for stock_adjustments
        await queryRunner.query(`
            CREATE INDEX "IDX_stock_adjustments_number"
            ON "stock_adjustments" ("adjustmentNumber")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_stock_adjustments_status"
            ON "stock_adjustments" ("status")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_stock_adjustments_date"
            ON "stock_adjustments" ("adjustmentDate")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_stock_adjustments_user"
            ON "stock_adjustments" ("adjustedByUserId")
        `);

        // Create indexes for stock_adjustment_items
        await queryRunner.query(`
            CREATE INDEX "IDX_stock_adjustment_items_adjustment"
            ON "stock_adjustment_items" ("stockAdjustmentId")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_stock_adjustment_items_product"
            ON "stock_adjustment_items" ("productId")
        `);

        // Add foreign key constraints
        await queryRunner.query(`
            ALTER TABLE "stock_adjustments"
            ADD CONSTRAINT "FK_stock_adjustments_user"
            FOREIGN KEY ("adjustedByUserId")
            REFERENCES "users"("id")
            ON DELETE SET NULL
        `);

        await queryRunner.query(`
            ALTER TABLE "stock_adjustment_items"
            ADD CONSTRAINT "FK_stock_adjustment_items_adjustment"
            FOREIGN KEY ("stockAdjustmentId")
            REFERENCES "stock_adjustments"("id")
            ON DELETE CASCADE
        `);

        await queryRunner.query(`
            ALTER TABLE "stock_adjustment_items"
            ADD CONSTRAINT "FK_stock_adjustment_items_product"
            FOREIGN KEY ("productId")
            REFERENCES "products"("id")
            ON DELETE RESTRICT
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop foreign keys
        await queryRunner.query(`
            ALTER TABLE "stock_adjustment_items"
            DROP CONSTRAINT "FK_stock_adjustment_items_product"
        `);
        await queryRunner.query(`
            ALTER TABLE "stock_adjustment_items"
            DROP CONSTRAINT "FK_stock_adjustment_items_adjustment"
        `);
        await queryRunner.query(`
            ALTER TABLE "stock_adjustments"
            DROP CONSTRAINT "FK_stock_adjustments_user"
        `);

        // Drop indexes
        await queryRunner.query(`DROP INDEX "IDX_stock_adjustment_items_product"`);
        await queryRunner.query(`DROP INDEX "IDX_stock_adjustment_items_adjustment"`);
        await queryRunner.query(`DROP INDEX "IDX_stock_adjustments_user"`);
        await queryRunner.query(`DROP INDEX "IDX_stock_adjustments_date"`);
        await queryRunner.query(`DROP INDEX "IDX_stock_adjustments_status"`);
        await queryRunner.query(`DROP INDEX "IDX_stock_adjustments_number"`);

        // Drop tables
        await queryRunner.query(`DROP TABLE "stock_adjustment_items"`);
        await queryRunner.query(`DROP TABLE "stock_adjustments"`);
    }
}
