import { DataSource, QueryRunner } from 'typeorm';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { CalendarDatesToDateColumns1784563222488 as Migration }
  from '../../src/database/migrations/1784563222488-CalendarDatesToDateColumns';

const SCHEMA = 'mig_test';

async function buildLegacyTables(qr: QueryRunner) {
  await qr.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await qr.query(`CREATE SCHEMA ${SCHEMA}`);
  await qr.query(`SET search_path TO ${SCHEMA}`);
  await qr.query(`CREATE TABLE stock_adjustments (
    id serial PRIMARY KEY,
    "adjustmentDate" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await qr.query(`CREATE TABLE price_lists (
    id serial PRIMARY KEY,
    "effectiveFrom" timestamp NULL, "effectiveTo" timestamp NULL)`);
  await qr.query(`CREATE TABLE price_list_items (
    id serial PRIMARY KEY,
    "effectiveFrom" timestamp NULL, "effectiveTo" timestamp NULL)`);
}

async function colType(qr: QueryRunner, table: string, col: string): Promise<string> {
  const rows = await qr.query(
    `SELECT data_type FROM information_schema.columns
     WHERE table_schema='${SCHEMA}' AND table_name='${table}' AND column_name='${col}'`);
  return rows[0].data_type;
}
async function colDefault(qr: QueryRunner, table: string, col: string): Promise<string | null> {
  const rows = await qr.query(
    `SELECT column_default FROM information_schema.columns
     WHERE table_schema='${SCHEMA}' AND table_name='${table}' AND column_name='${col}'`);
  return rows[0].column_default;
}

describe('CalendarDatesToDateColumns migration (integration)', () => {
  let mod: Awaited<ReturnType<ReturnType<typeof Test.createTestingModule>['compile']>>;
  let ds: DataSource;
  let qr: QueryRunner;
  const migration = new Migration();

  beforeAll(async () => {
    mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    ds = mod.get(DataSource);
    qr = ds.createQueryRunner();
    await qr.connect();
    await qr.query(`SET TIME ZONE 'America/Los_Angeles'`);
    const [{ TimeZone }] = await qr.query('SHOW TIME ZONE');
    expect(TimeZone).toBe('America/Los_Angeles');
  });

  afterEach(async () => { await qr.query(`SET search_path TO ${SCHEMA}`); });
  afterAll(async () => {
    await qr.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await qr.release();
    await mod.close();
  });

  it('up(): converts all calendar columns to date and drops the adjustmentDate default', async () => {
    await buildLegacyTables(qr);
    await qr.query(`INSERT INTO stock_adjustments ("adjustmentDate") VALUES ('2026-07-20T00:00:00Z')`);
    await qr.query(`INSERT INTO price_lists ("effectiveFrom","effectiveTo") VALUES ('2026-01-01 00:00','2026-12-31 00:00')`);
    await qr.query(`INSERT INTO price_list_items ("effectiveFrom","effectiveTo") VALUES ('2026-01-01 00:00', NULL)`);

    await migration.up(qr);

    expect(await colType(qr, 'stock_adjustments', 'adjustmentDate')).toBe('date');
    expect(await colType(qr, 'price_lists', 'effectiveFrom')).toBe('date');
    expect(await colType(qr, 'price_lists', 'effectiveTo')).toBe('date');
    expect(await colType(qr, 'price_list_items', 'effectiveFrom')).toBe('date');
    expect(await colType(qr, 'price_list_items', 'effectiveTo')).toBe('date');
    expect(await colDefault(qr, 'stock_adjustments', 'adjustmentDate')).toBeNull();

    const [sa] = await qr.query(`SELECT "adjustmentDate" FROM stock_adjustments`);
    expect(String(sa.adjustmentDate)).toContain('2026-07-20');
    const [pl] = await qr.query(`SELECT "effectiveFrom","effectiveTo" FROM price_lists`);
    expect(String(pl.effectiveFrom)).toContain('2026-01-01');
    expect(String(pl.effectiveTo)).toContain('2026-12-31');
    const [pli] = await qr.query(`SELECT "effectiveTo" FROM price_list_items`);
    expect(pli.effectiveTo).toBeNull();
  });

  it('up(): ABORTS when a non-midnight adjustmentDate exists (no partial conversion)', async () => {
    await buildLegacyTables(qr);
    await qr.query(`INSERT INTO stock_adjustments ("adjustmentDate") VALUES ('2026-07-20T13:00:00Z')`);
    await expect(migration.up(qr)).rejects.toThrow(/non-midnight|aborted/i);
    expect(await colType(qr, 'stock_adjustments', 'adjustmentDate')).toBe('timestamp with time zone');
    expect(await colType(qr, 'price_lists', 'effectiveFrom')).toBe('timestamp without time zone');
    expect(await colType(qr, 'price_lists', 'effectiveTo')).toBe('timestamp without time zone');
    expect(await colType(qr, 'price_list_items', 'effectiveFrom')).toBe('timestamp without time zone');
    expect(await colType(qr, 'price_list_items', 'effectiveTo')).toBe('timestamp without time zone');
  });

  it.each(['price_lists', 'price_list_items'])(
    'up(): ABORTS when a non-midnight %s effective date exists (audit-loop branch)',
    async (table) => {
      await buildLegacyTables(qr);
      await qr.query(`INSERT INTO ${table} ("effectiveFrom","effectiveTo") VALUES ('2026-01-01 09:30:00', NULL)`);
      await expect(migration.up(qr)).rejects.toThrow(/non-midnight|aborted/i);
      expect(await colType(qr, 'stock_adjustments', 'adjustmentDate')).toBe('timestamp with time zone');
      expect(await colType(qr, 'price_lists', 'effectiveFrom')).toBe('timestamp without time zone');
      expect(await colType(qr, 'price_lists', 'effectiveTo')).toBe('timestamp without time zone');
      expect(await colType(qr, 'price_list_items', 'effectiveFrom')).toBe('timestamp without time zone');
      expect(await colType(qr, 'price_list_items', 'effectiveTo')).toBe('timestamp without time zone');
    },
  );

  it('down(): restores timestamptz at UTC midnight and re-adds the default (round-trip stable)', async () => {
    await buildLegacyTables(qr);
    await qr.query(`INSERT INTO stock_adjustments ("adjustmentDate") VALUES ('2026-07-20T00:00:00Z')`);
    await migration.up(qr);
    await migration.down(qr);
    expect(await colType(qr, 'stock_adjustments', 'adjustmentDate')).toBe('timestamp with time zone');
    expect(await colType(qr, 'price_lists', 'effectiveFrom')).toBe('timestamp without time zone');
    expect(await colType(qr, 'price_lists', 'effectiveTo')).toBe('timestamp without time zone');
    expect(await colType(qr, 'price_list_items', 'effectiveFrom')).toBe('timestamp without time zone');
    expect(await colType(qr, 'price_list_items', 'effectiveTo')).toBe('timestamp without time zone');
    expect(await colDefault(qr, 'stock_adjustments', 'adjustmentDate')).toMatch(/CURRENT_TIMESTAMP|now\(\)/i);
    const [sa] = await qr.query(`SELECT "adjustmentDate" FROM stock_adjustments`);
    expect(new Date(sa.adjustmentDate).toISOString()).toBe('2026-07-20T00:00:00.000Z');
  });
});
