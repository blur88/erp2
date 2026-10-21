import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdjustmentItemValuationFields1792766400000 implements MigrationInterface {
  name = 'AddAdjustmentItemValuationFields1792766400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "stock_adjustment_items" ADD "defaultUnitCost" numeric(15,4)`);
    await queryRunner.query(`ALTER TABLE "stock_adjustment_items" ADD "costExplanation" text`);
    await queryRunner.query(`ALTER TABLE "stock_adjustment_items" ADD "zeroCostConfirmed" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "stock_adjustment_items" ADD "unitCostProvided" boolean NOT NULL DEFAULT false`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "stock_adjustment_items" DROP COLUMN "unitCostProvided"`);
    await queryRunner.query(`ALTER TABLE "stock_adjustment_items" DROP COLUMN "zeroCostConfirmed"`);
    await queryRunner.query(`ALTER TABLE "stock_adjustment_items" DROP COLUMN "costExplanation"`);
    await queryRunner.query(`ALTER TABLE "stock_adjustment_items" DROP COLUMN "defaultUnitCost"`);
  }
}
