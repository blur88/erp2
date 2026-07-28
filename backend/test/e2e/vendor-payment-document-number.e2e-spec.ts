import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { RemoveStaleVendorPaymentDocumentNumber1785400000000 } from '../../src/database/migrations/1785400000000-RemoveStaleVendorPaymentDocumentNumber';

let app: INestApplication;
let dataSource: DataSource;

const ACTIVE_TYPES = [
  'Sales Orders',
  'Purchase Orders',
  'Stock Adjustment',
  'Expenses',
  'Journal Entries',
];

/** Runs one migration direction, always releasing the QueryRunner. */
async function runMigration(direction: 'up' | 'down'): Promise<void> {
  const migration = new RemoveStaleVendorPaymentDocumentNumber1785400000000();
  const queryRunner = dataSource.createQueryRunner();
  try {
    await migration[direction](queryRunner);
  } finally {
    await queryRunner.release();
  }
}

async function readVendorPaymentRows() {
  return dataSource.query(
    `SELECT "prefix", "paddingDigits", "nextNumber", "lastResetYear"
       FROM document_number_settings
      WHERE "documentName" = 'Vendor Payments'`,
  );
}

/** documentName -> nextNumber, for the five canonical types. */
async function readActiveTypes(): Promise<Record<string, number>> {
  const rows = await dataSource.query(
    `SELECT "documentName", "nextNumber"
       FROM document_number_settings
      WHERE "documentName" <> 'Vendor Payments'
      ORDER BY "documentName"`,
  );
  return Object.fromEntries(
    rows.map((r: { documentName: string; nextNumber: number }) => [
      r.documentName,
      Number(r.nextNumber),
    ]),
  );
}

async function seedVendorPaymentRow(): Promise<void> {
  // nextNumber 7 reproduces the state reported in #951: VP numbers were
  // actually issued before retirement, so this is live leftover state.
  await dataSource.query(
    `INSERT INTO document_number_settings
       ("documentName", "prefix", "paddingDigits", "nextNumber", "lastResetYear")
     VALUES ('Vendor Payments', 'VP', 3, 7, -1)
     ON CONFLICT ("documentName") DO NOTHING`,
  );
}

beforeAll(async () => {
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleFixture.createNestApplication();
  await app.init();
  dataSource = app.get(DataSource);
});

afterAll(async () => {
  // Unconditional cleanup: independent of migration code, and runs even if an
  // assertion above threw. e2e suites share one database and run size-ordered,
  // so a leaked VP row could surface as a failure in an unrelated suite.
  await dataSource.query(
    `DELETE FROM document_number_settings WHERE "documentName" = 'Vendor Payments'`,
  );
  await app.close();
});

describe('RemoveStaleVendorPaymentDocumentNumber', () => {
  it('deletes the stale row, preserves active types, and round-trips', async () => {
    const activeBefore = await readActiveTypes();
    expect(Object.keys(activeBefore).sort()).toEqual([...ACTIVE_TYPES].sort());

    await seedVendorPaymentRow();
    expect(await readVendorPaymentRows()).toHaveLength(1);

    // up() removes the stale row.
    await runMigration('up');
    expect(await readVendorPaymentRows()).toHaveLength(0);

    // The five active types are untouched — this is the guard against an
    // over-broad DELETE. Counters must be byte-identical, not merely present.
    expect(await readActiveTypes()).toEqual(activeBefore);

    // Re-running up() against the already-clean state is a no-op, not an error.
    await runMigration('up');
    expect(await readVendorPaymentRows()).toHaveLength(0);
    expect(await readActiveTypes()).toEqual(activeBefore);

    // down() restores the row with fixed literals. nextNumber is 1, NOT the
    // seeded 7: rollback symmetry, not resumable numbering.
    await runMigration('down');
    const restored = await readVendorPaymentRows();
    expect(restored).toHaveLength(1);
    expect(restored[0].prefix).toBe('VP');
    expect(Number(restored[0].paddingDigits)).toBe(3);
    expect(Number(restored[0].nextNumber)).toBe(1);
    expect(Number(restored[0].lastResetYear)).toBe(-1);

    // ON CONFLICT DO NOTHING: a second down() leaves exactly one row.
    await runMigration('down');
    expect(await readVendorPaymentRows()).toHaveLength(1);

    // Leave the database in the post-up() state for any later suite. The
    // afterAll hook is the real guarantee; this keeps the happy path tidy.
    await runMigration('up');
    expect(await readVendorPaymentRows()).toHaveLength(0);
    expect(await readActiveTypes()).toEqual(activeBefore);
  });
});
