import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { BackfillVendorPaymentReferenceNumber1785300000000 } from '../../src/database/migrations/1785300000000-BackfillVendorPaymentReferenceNumber';

let app: INestApplication;
let dataSource: DataSource;

const SUPPLIER_ID = '11111111-1111-1111-1111-111111111111';

async function seedPayment(
  referenceNumber: string | null,
  notes: string | null,
): Promise<string> {
  const [row] = await dataSource.query(
    `INSERT INTO vendor_payments
       ("supplierId", "amount", "paymentDate", "referenceNumber", "notes", "status")
     VALUES ($1, 10, CURRENT_DATE, $2, $3, 'completed')
     RETURNING id`,
    [SUPPLIER_ID, referenceNumber, notes],
  );
  return row.id;
}

async function readPayment(id: string) {
  const [row] = await dataSource.query(
    `SELECT "referenceNumber", "notes" FROM vendor_payments WHERE id = $1`,
    [id],
  );
  return row;
}

beforeAll(async () => {
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleFixture.createNestApplication();
  await app.init();
  dataSource = app.get(DataSource);

  await dataSource.query(
    `INSERT INTO suppliers (id, "companyName") VALUES ($1, 'Backfill Test Supplier')
     ON CONFLICT (id) DO NOTHING`,
    [SUPPLIER_ID],
  );
});

afterAll(async () => {
  await dataSource.query(`DELETE FROM vendor_payments WHERE "supplierId" = $1`, [SUPPLIER_ID]);
  await dataSource.query(`DELETE FROM suppliers WHERE id = $1`, [SUPPLIER_ID]);
  await app.close();
});

describe('BackfillVendorPaymentReferenceNumber', () => {
  it('applies each guard arm correctly', async () => {
    const positive = await seedPayment(null, 'WIRE-001');
    const existing = await seedPayment('REF-9', 'other');
    const nullNotes = await seedPayment(null, null);
    const emptyNotes = await seedPayment(null, '');
    const autoGen = await seedPayment(null, 'Auto-generated payment for PO PO-1001');

    const queryRunner = dataSource.createQueryRunner();
    try {
      await new BackfillVendorPaymentReferenceNumber1785300000000().up(queryRunner);
    } finally {
      await queryRunner.release();
    }

    expect((await readPayment(positive)).referenceNumber).toBe('WIRE-001');

    expect((await readPayment(existing)).referenceNumber).toBe('REF-9');

    expect((await readPayment(nullNotes)).referenceNumber).toBeNull();

    expect((await readPayment(emptyNotes)).referenceNumber).toBeNull();

    expect((await readPayment(autoGen)).referenceNumber).toBeNull();

    expect((await readPayment(positive)).notes).toBe('WIRE-001');
    expect((await readPayment(existing)).notes).toBe('other');
    expect((await readPayment(nullNotes)).notes).toBeNull();
    expect((await readPayment(emptyNotes)).notes).toBe('');
    expect((await readPayment(autoGen)).notes).toBe('Auto-generated payment for PO PO-1001');
  });
});
