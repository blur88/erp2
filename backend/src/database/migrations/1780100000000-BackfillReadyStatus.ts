import { MigrationInterface, QueryRunner } from "typeorm";

export class BackfillReadyStatus1780100000000 implements MigrationInterface {
  name = "BackfillReadyStatus1780100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "sales_orders"
      SET "status" = 'READY'
      WHERE "status" = 'DRAFT'
        AND "paymentStatus" IN ('PAID', 'OVERPAID')
        AND "deletedAt" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "sales_orders"
      SET "status" = 'DRAFT'
      WHERE "status" = 'READY'
        AND "deletedAt" IS NULL
    `);
  }
}
