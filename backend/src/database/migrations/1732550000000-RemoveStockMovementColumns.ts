import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveStockMovementColumns1732550000000 implements MigrationInterface {
  name = "RemoveStockMovementColumns1732550000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes first
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_stock_movements_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_stock_movements_movedByUserId"`,
    );

    // Drop foreign key constraint for movedByUserId
    await queryRunner.query(`
      ALTER TABLE "stock_movements"
      DROP CONSTRAINT IF EXISTS "FK_stock_movements_movedByUserId"
    `);

    // Drop columns
    await queryRunner.query(
      `ALTER TABLE "stock_movements" DROP COLUMN IF EXISTS "status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_movements" DROP COLUMN IF EXISTS "locationCode"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_movements" DROP COLUMN IF EXISTS "binLocation"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_movements" DROP COLUMN IF EXISTS "batchNumber"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_movements" DROP COLUMN IF EXISTS "expiryDate"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_movements" DROP COLUMN IF EXISTS "metadata"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_movements" DROP COLUMN IF EXISTS "movedByUserId"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add columns
    await queryRunner.query(`
      ALTER TABLE "stock_movements"
      ADD COLUMN "movedByUserId" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "stock_movements"
      ADD COLUMN "metadata" jsonb
    `);

    await queryRunner.query(`
      ALTER TABLE "stock_movements"
      ADD COLUMN "expiryDate" date
    `);

    await queryRunner.query(`
      ALTER TABLE "stock_movements"
      ADD COLUMN "batchNumber" varchar(50)
    `);

    await queryRunner.query(`
      ALTER TABLE "stock_movements"
      ADD COLUMN "binLocation" varchar(100)
    `);

    await queryRunner.query(`
      ALTER TABLE "stock_movements"
      ADD COLUMN "locationCode" varchar(50) NOT NULL DEFAULT 'MAIN'
    `);

    await queryRunner.query(`
      ALTER TABLE "stock_movements"
      ADD COLUMN "status" varchar(20) NOT NULL DEFAULT 'completed'
    `);

    // Re-add foreign key constraint
    await queryRunner.query(`
      ALTER TABLE "stock_movements"
      ADD CONSTRAINT "FK_stock_movements_movedByUserId"
      FOREIGN KEY ("movedByUserId")
      REFERENCES "users"("id")
      ON DELETE SET NULL
    `);

    // Re-add indexes
    await queryRunner.query(
      `CREATE INDEX "IDX_stock_movements_status" ON "stock_movements" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_stock_movements_movedByUserId" ON "stock_movements" ("movedByUserId")`,
    );
  }
}
