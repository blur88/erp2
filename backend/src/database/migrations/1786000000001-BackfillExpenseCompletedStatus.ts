import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillExpenseCompletedStatus1786000000001 implements MigrationInterface {
  name = 'BackfillExpenseCompletedStatus1786000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "expenses"
      SET "documentStatus" = 'COMPLETED'
      WHERE "documentStatus" = 'DRAFT'
        AND "paymentStatus" IN ('PAID', 'OVERPAID')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Intentionally lossy. This reverts EVERY COMPLETED row to DRAFT,
    // including expenses that reached COMPLETED through normal operation
    // after deployment — the migration cannot distinguish those from the
    // rows it converted, so the Draft + Paid contradiction returns for them.
    await queryRunner.query(
      `UPDATE "expenses" SET "documentStatus" = 'DRAFT' WHERE "documentStatus" = 'COMPLETED'`,
    );
  }
}
