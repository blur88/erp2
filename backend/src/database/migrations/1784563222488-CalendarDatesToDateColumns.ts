import { MigrationInterface, QueryRunner } from 'typeorm';

export class CalendarDatesToDateColumns1784563222488 implements MigrationInterface {
  name = 'CalendarDatesToDateColumns1784563222488';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- Audit: refuse to run if any legacy value is not midnight (would be corrupted by a blind cast) ---
    const saDirty = await queryRunner.query(
      `SELECT count(*)::int AS n FROM stock_adjustments
       WHERE ("adjustmentDate" AT TIME ZONE 'UTC')::time <> '00:00:00'`,
    );
    if (saDirty[0].n > 0) {
      throw new Error(
        `CalendarDatesToDateColumns aborted: ${saDirty[0].n} stock_adjustments rows have a non-midnight adjustmentDate. ` +
        `Their write-time timezone is not recoverable; remediate manually (set the intended YYYY-MM-DD) before re-running.`,
      );
    }
    for (const table of ['price_lists', 'price_list_items']) {
      const dirty = await queryRunner.query(
        `SELECT count(*)::int AS n FROM ${table}
         WHERE ("effectiveFrom")::time <> '00:00:00' OR ("effectiveTo")::time <> '00:00:00'`,
      );
      if (dirty[0].n > 0) {
        throw new Error(
          `CalendarDatesToDateColumns aborted: ${dirty[0].n} ${table} rows have non-midnight effective dates; remediate manually before re-running.`,
        );
      }
    }

    // --- stock_adjustments.adjustmentDate: timestamptz -> date (UTC calendar day), drop default ---
    await queryRunner.query(`ALTER TABLE "stock_adjustments" ALTER COLUMN "adjustmentDate" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "stock_adjustments" ALTER COLUMN "adjustmentDate" TYPE date USING ("adjustmentDate" AT TIME ZONE 'UTC')::date`,
    );

    // --- price_lists / price_list_items effective dates: timestamp -> date (wall-clock day) ---
    for (const table of ['price_lists', 'price_list_items']) {
      await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "effectiveFrom" TYPE date USING "effectiveFrom"::date`);
      await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "effectiveTo" TYPE date USING "effectiveTo"::date`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // stock_adjustments: date -> timestamptz at UTC midnight, restore CURRENT_TIMESTAMP default
    await queryRunner.query(
      `ALTER TABLE "stock_adjustments" ALTER COLUMN "adjustmentDate" TYPE timestamptz USING ("adjustmentDate"::timestamp AT TIME ZONE 'UTC')`,
    );
    await queryRunner.query(`ALTER TABLE "stock_adjustments" ALTER COLUMN "adjustmentDate" SET DEFAULT CURRENT_TIMESTAMP`);

    // price_lists / price_list_items: date -> timestamp at local midnight
    for (const table of ['price_lists', 'price_list_items']) {
      await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "effectiveFrom" TYPE timestamp USING "effectiveFrom"::timestamp`);
      await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "effectiveTo" TYPE timestamp USING "effectiveTo"::timestamp`);
    }
  }
}
