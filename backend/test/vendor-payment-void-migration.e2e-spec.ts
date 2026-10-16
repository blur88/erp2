import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource, QueryRunner } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureTestAppValidation } from './utils/configure-test-app-validation';
import { VoidVendorPayments1792179464025 } from '../src/database/migrations/1792179464025-VoidVendorPayments';

/**
 * e2e for VoidVendorPayments1792179464025 (issue #1401).
 *
 * The test database already has the migration applied (see
 * jest-e2e-global-setup.js), so every case first drops the migration's
 * artifacts and then exercises up/down for real. Every case runs inside a
 * transaction that is ALWAYS rolled back.
 */

let app: INestApplication;
let ds: DataSource;

const migration = new VoidVendorPayments1792179464025();

const uuid = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const SUPPLIER_ID = uuid(1);
const VOIDER_ID = uuid(2);
const DELETED_AT = new Date('2026-01-20T10:00:00.000Z');

// JS-sorted so they can be compared with the sorted query results.
const VOID_COLUMNS = ['voidReversalEntryId', 'voidedAt', 'voidedByUserId'];
const VOID_CHECKS = [
  'CHK_vendor_payments_never_soft_deleted',
  'CHK_vendor_payments_void_state',
];

let journalSeq = 0;
const nextJournalNo = (): string => `VP-VOID-${++journalSeq}`;

beforeAll(async () => {
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleFixture.createNestApplication();
  configureTestAppValidation(app);
  await app.init();
  ds = app.get(DataSource);
});

afterAll(async () => {
  await app.close();
});

async function dropMigrationArtifacts(qr: QueryRunner): Promise<void> {
  await qr.query(
    `ALTER TABLE "vendor_payments" DROP CONSTRAINT IF EXISTS "CHK_vendor_payments_never_soft_deleted"`,
  );
  await qr.query(
    `ALTER TABLE "vendor_payments" DROP CONSTRAINT IF EXISTS "CHK_vendor_payments_void_state"`,
  );
  await qr.query(
    `ALTER TABLE "vendor_payments" DROP CONSTRAINT IF EXISTS "FK_vendor_payments_void_reversal"`,
  );
  await qr.query(`ALTER TABLE "vendor_payments" DROP COLUMN IF EXISTS "voidReversalEntryId"`);
  await qr.query(`ALTER TABLE "vendor_payments" DROP COLUMN IF EXISTS "voidedByUserId"`);
  await qr.query(`ALTER TABLE "vendor_payments" DROP COLUMN IF EXISTS "voidedAt"`);
}

/** Runs `fn` inside a transaction that is ALWAYS rolled back. */
async function inRolledBackTxn(fn: (qr: QueryRunner) => Promise<void>): Promise<void> {
  const qr = ds.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    await dropMigrationArtifacts(qr);
    await fn(qr);
  } finally {
    await qr.rollbackTransaction();
    await qr.release();
  }
}

async function seedSupplier(qr: QueryRunner): Promise<void> {
  await qr.query(
    `INSERT INTO suppliers (id, "companyName") VALUES ($1, 'Void migration supplier')
     ON CONFLICT (id) DO NOTHING`,
    [SUPPLIER_ID],
  );
}

async function seedPo(qr: QueryRunner, poId: string, orderNumber: string): Promise<void> {
  await seedSupplier(qr);
  await qr.query(
    `INSERT INTO purchase_orders (id, "orderNumber", "orderDate", "supplierId")
     VALUES ($1, $2, DATE '2026-01-10', $3)`,
    [poId, orderNumber, SUPPLIER_ID],
  );
}

interface PaymentSeed {
  id: string;
  amount: number | string;
  purchaseOrderId?: string | null;
  paymentMethodId?: string | null;
  referenceNumber?: string | null;
  notes?: string | null;
  status?: string;
  isActive?: boolean;
  deletedAt?: Date | null;
}

async function seedPayment(qr: QueryRunner, payment: PaymentSeed): Promise<void> {
  await seedSupplier(qr);
  await qr.query(
    `INSERT INTO vendor_payments
       (id, "supplierId", "purchaseOrderId", amount, "paymentDate", "paymentMethodId",
        "referenceNumber", notes, status, "isActive", "deletedAt")
     VALUES ($1, $2, $3, $4, DATE '2026-01-15', $5, $6, $7, $8, $9, $10)`,
    [
      payment.id,
      SUPPLIER_ID,
      payment.purchaseOrderId ?? null,
      payment.amount,
      payment.paymentMethodId ?? null,
      payment.referenceNumber ?? null,
      payment.notes ?? null,
      payment.status ?? 'completed',
      payment.isActive ?? true,
      payment.deletedAt ?? null,
    ],
  );
}

interface EntrySeed {
  id: string;
  paymentId: string;
  postingType: string;
  sourceDocumentId: string | null;
  reversalOfEntryId?: string | null;
}

async function seedEntry(qr: QueryRunner, entry: EntrySeed): Promise<void> {
  await qr.query(
    `INSERT INTO journal_entry
       (id, "journalNo", "entryDate", "sourceType", "sourceDocumentId", "sourceEventId",
        "postingType", "reversalOfEntryId")
     VALUES ($1, $2, DATE '2026-01-15', 'PURCHASE_ORDER', $3, $4, $5, $6)`,
    [
      entry.id,
      nextJournalNo(),
      entry.sourceDocumentId,
      entry.paymentId,
      entry.postingType,
      entry.reversalOfEntryId ?? null,
    ],
  );
}

interface ConvertibleIds {
  poId: string;
  paymentId: string;
  originalId: string;
  reversalId: string;
}

/** The classic convertible shape: soft-deleted, completed, original + reversal. */
async function seedConvertible(
  qr: QueryRunner,
  ids: ConvertibleIds,
  options: { amount?: string; postingType?: string; orderNumber?: string } = {},
): Promise<void> {
  await seedPo(qr, ids.poId, options.orderNumber ?? `PO-VOID-${ids.poId.slice(-4)}`);
  await seedPayment(qr, {
    id: ids.paymentId,
    purchaseOrderId: ids.poId,
    amount: options.amount ?? '100.0000',
    isActive: false,
    deletedAt: DELETED_AT,
  });
  await seedEntry(qr, {
    id: ids.originalId,
    paymentId: ids.paymentId,
    postingType: options.postingType ?? 'PURCHASE_PAYMENT',
    sourceDocumentId: ids.poId,
  });
  await seedEntry(qr, {
    id: ids.reversalId,
    paymentId: ids.paymentId,
    postingType: options.postingType ?? 'PURCHASE_PAYMENT',
    sourceDocumentId: ids.poId,
    reversalOfEntryId: ids.originalId,
  });
}

async function paymentSnapshot(qr: QueryRunner): Promise<Array<Record<string, unknown>>> {
  return qr.query(
    `SELECT id, status, "isActive", "deletedAt", amount::text AS amount, "purchaseOrderId"
       FROM vendor_payments ORDER BY id`,
  );
}

async function voidColumns(qr: QueryRunner): Promise<string[]> {
  const rows: Array<{ column_name: string }> = await qr.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'vendor_payments' AND column_name = ANY($1::text[])`,
    [VOID_COLUMNS],
  );
  return rows.map((row) => row.column_name).sort();
}

async function voidChecks(qr: QueryRunner): Promise<string[]> {
  const rows: Array<{ conname: string }> = await qr.query(
    `SELECT conname FROM pg_constraint
      WHERE conrelid = 'vendor_payments'::regclass AND conname = ANY($1::text[])`,
    [VOID_CHECKS],
  );
  return rows.map((row) => row.conname).sort();
}

async function voidFk(
  qr: QueryRunner,
): Promise<Array<{ conname: string; confdeltype: string }>> {
  return qr.query(
    `SELECT conname, confdeltype::text AS confdeltype FROM pg_constraint
      WHERE conrelid = 'vendor_payments'::regclass
        AND conname = 'FK_vendor_payments_void_reversal'`,
  );
}

describe('VoidVendorPayments migration e2e', () => {
  describe('up: constraints', () => {
    it('rejects a voided row without voidedAt', async () => {
      await inRolledBackTxn(async (qr) => {
        await migration.up(qr);
        await seedSupplier(qr);
        await expect(
          qr.query(
            `INSERT INTO vendor_payments (id, "supplierId", amount, "paymentDate", status, "isActive")
             VALUES ($1, $2, 10, DATE '2026-01-15', 'voided', false)`,
            [uuid(5001), SUPPLIER_ID],
          ),
        ).rejects.toMatchObject({
          code: '23514',
          constraint: 'CHK_vendor_payments_void_state',
        });
      });
    });

    it('rejects a live row marked inactive', async () => {
      await inRolledBackTxn(async (qr) => {
        await migration.up(qr);
        await seedSupplier(qr);
        await expect(
          qr.query(
            `INSERT INTO vendor_payments (id, "supplierId", amount, "paymentDate", status, "isActive")
             VALUES ($1, $2, 10, DATE '2026-01-15', 'completed', false)`,
            [uuid(5002), SUPPLIER_ID],
          ),
        ).rejects.toMatchObject({
          code: '23514',
          constraint: 'CHK_vendor_payments_void_state',
        });
      });
    });

    it('rejects any soft delete', async () => {
      await inRolledBackTxn(async (qr) => {
        await migration.up(qr);
        await seedSupplier(qr);
        const paymentId = uuid(5003);
        await qr.query(
          `INSERT INTO vendor_payments (id, "supplierId", amount, "paymentDate", status, "isActive")
           VALUES ($1, $2, 10, DATE '2026-01-15', 'completed', true)`,
          [paymentId, SUPPLIER_ID],
        );
        await expect(
          qr.query(`UPDATE vendor_payments SET "deletedAt" = now() WHERE id = $1`, [paymentId]),
        ).rejects.toMatchObject({
          code: '23514',
          constraint: 'CHK_vendor_payments_never_soft_deleted',
        });
      });
    });

    it('accepts a migrated void with no voider', async () => {
      await inRolledBackTxn(async (qr) => {
        await migration.up(qr);
        await seedSupplier(qr);
        const paymentId = uuid(5004);
        await qr.query(
          `INSERT INTO vendor_payments
             (id, "supplierId", amount, "paymentDate", status, "isActive", "voidedAt")
           VALUES ($1, $2, 10, DATE '2026-01-15', 'voided', false, now())`,
          [paymentId, SUPPLIER_ID],
        );
        const [row] = await qr.query(
          `SELECT status, "voidedAt", "voidedByUserId", "deletedAt"
             FROM vendor_payments WHERE id = $1`,
          [paymentId],
        );
        expect(row.status).toBe('voided');
        expect(row.voidedAt).not.toBeNull();
        expect(row.voidedByUserId).toBeNull();
        expect(row.deletedAt).toBeNull();
      });
    });
  });

  describe('up: conversion', () => {
    it('converts a soft-deleted payment to voided, preserving amount, method, date, reference and notes', async () => {
      await inRolledBackTxn(async (qr) => {
        const ids: ConvertibleIds = {
          poId: uuid(6001),
          paymentId: uuid(6002),
          originalId: uuid(6003),
          reversalId: uuid(6004),
        };
        await seedPo(qr, ids.poId, 'PO-VOID-6001');
        const [method] = await qr.query(`SELECT id FROM payment_methods ORDER BY code LIMIT 1`);
        await seedPayment(qr, {
          id: ids.paymentId,
          purchaseOrderId: ids.poId,
          amount: '123.4500',
          paymentMethodId: method.id,
          referenceNumber: 'REF-VOID-6001',
          notes: 'preserve these notes',
          isActive: false,
          deletedAt: DELETED_AT,
        });
        await seedEntry(qr, {
          id: ids.originalId,
          paymentId: ids.paymentId,
          postingType: 'PURCHASE_PAYMENT',
          sourceDocumentId: ids.poId,
        });
        await seedEntry(qr, {
          id: ids.reversalId,
          paymentId: ids.paymentId,
          postingType: 'PURCHASE_PAYMENT',
          sourceDocumentId: ids.poId,
          reversalOfEntryId: ids.originalId,
        });

        await migration.up(qr);

        const [row] = await qr.query(
          `SELECT status, "voidedAt", "voidedByUserId", "voidReversalEntryId", "deletedAt",
                  amount::text AS amount, "paymentMethodId", "paymentDate"::text AS payment_date,
                  "referenceNumber", notes
             FROM vendor_payments WHERE id = $1`,
          [ids.paymentId],
        );
        expect(row.status).toBe('voided');
        expect(new Date(row.voidedAt).toISOString()).toBe(DELETED_AT.toISOString());
        expect(row.voidedByUserId).toBeNull();
        expect(row.deletedAt).toBeNull();
        expect(row.payment_date).toBe('2026-01-15');
        expect(row.amount).toBe('123.4500');
        expect(row.paymentMethodId).toBe(method.id);
        expect(row.referenceNumber).toBe('REF-VOID-6001');
        expect(row.notes).toBe('preserve these notes');
      });
    });

    it('links the existing reversal of the expected original', async () => {
      await inRolledBackTxn(async (qr) => {
        const ids: ConvertibleIds = {
          poId: uuid(6011),
          paymentId: uuid(6012),
          originalId: uuid(6013),
          reversalId: uuid(6014),
        };
        await seedConvertible(qr, ids, { orderNumber: 'PO-VOID-6011' });

        await migration.up(qr);

        const [row] = await qr.query(
          `SELECT "voidReversalEntryId" FROM vendor_payments WHERE id = $1`,
          [ids.paymentId],
        );
        expect(row.voidReversalEntryId).toBe(ids.reversalId);
      });
    });

    it('rejects deleting a journal entry linked as a void reversal', async () => {
      await inRolledBackTxn(async (qr) => {
        const ids: ConvertibleIds = {
          poId: uuid(6021),
          paymentId: uuid(6022),
          originalId: uuid(6023),
          reversalId: uuid(6024),
        };
        await seedConvertible(qr, ids, { orderNumber: 'PO-VOID-6021' });

        await migration.up(qr);

        // ON DELETE RESTRICT raises 23001 (restrict_violation), not 23503.
        await expect(
          qr.query(`DELETE FROM journal_entry WHERE id = $1`, [ids.reversalId]),
        ).rejects.toMatchObject({
          code: '23001',
          constraint: 'FK_vendor_payments_void_reversal',
        });
      });
    });

    it('converts a refund row by its PURCHASE_REFUND original', async () => {
      await inRolledBackTxn(async (qr) => {
        const ids: ConvertibleIds = {
          poId: uuid(6031),
          paymentId: uuid(6032),
          originalId: uuid(6033),
          reversalId: uuid(6034),
        };
        await seedConvertible(qr, ids, {
          amount: '-75.0000',
          postingType: 'PURCHASE_REFUND',
          orderNumber: 'PO-VOID-6031',
        });

        await migration.up(qr);

        const [row] = await qr.query(
          `SELECT status, "voidReversalEntryId" FROM vendor_payments WHERE id = $1`,
          [ids.paymentId],
        );
        expect(row.status).toBe('voided');
        expect(row.voidReversalEntryId).toBe(ids.reversalId);
      });
    });

    it('a soft-deleted row with no original converts with a null link', async () => {
      await inRolledBackTxn(async (qr) => {
        const poId = uuid(6041);
        const paymentId = uuid(6042);
        await seedPo(qr, poId, 'PO-VOID-6041');
        await seedPayment(qr, {
          id: paymentId,
          purchaseOrderId: poId,
          amount: '10.0000',
          isActive: false,
          deletedAt: DELETED_AT,
        });

        await migration.up(qr);

        const [row] = await qr.query(
          `SELECT status, "voidedAt", "voidReversalEntryId", "deletedAt"
             FROM vendor_payments WHERE id = $1`,
          [paymentId],
        );
        expect(row.status).toBe('voided');
        expect(new Date(row.voidedAt).toISOString()).toBe(DELETED_AT.toISOString());
        expect(row.voidReversalEntryId).toBeNull();
        expect(row.deletedAt).toBeNull();
      });
    });
  });

  describe('up: blocking rows abort', () => {
    async function expectUpBlocked(
      qr: QueryRunner,
      reason: string,
      count = 1,
    ): Promise<void> {
      const before = await paymentSnapshot(qr);
      await expect(migration.up(qr)).rejects.toThrow(
        new RegExp(
          `${count} vendor payment\\(s\\) abort the migration with reason '${reason}'`,
        ),
      );
      // The abort happened before any write: no columns, no checks, rows untouched.
      expect(await voidColumns(qr)).toEqual([]);
      expect(await voidChecks(qr)).toEqual([]);
      expect(await paymentSnapshot(qr)).toEqual(before);
    }

    it('aborts on already_voided', async () => {
      await inRolledBackTxn(async (qr) => {
        const poId = uuid(7001);
        await seedPo(qr, poId, 'PO-VOID-7001');
        await seedPayment(qr, {
          id: uuid(7002),
          purchaseOrderId: poId,
          amount: '10.0000',
          status: 'voided',
        });
        await expectUpBlocked(qr, 'already_voided');
      });
    });

    it('aborts on soft_deleted_still_active', async () => {
      await inRolledBackTxn(async (qr) => {
        const poId = uuid(7010);
        await seedPo(qr, poId, 'PO-VOID-7010');
        await seedPayment(qr, {
          id: uuid(7011),
          purchaseOrderId: poId,
          amount: '10.0000',
          isActive: true,
          deletedAt: DELETED_AT,
        });
        await expectUpBlocked(qr, 'soft_deleted_still_active');
      });
    });

    it('aborts on inactive_not_soft_deleted', async () => {
      await inRolledBackTxn(async (qr) => {
        const poId = uuid(7020);
        await seedPo(qr, poId, 'PO-VOID-7020');
        await seedPayment(qr, {
          id: uuid(7021),
          purchaseOrderId: poId,
          amount: '10.0000',
          isActive: false,
          deletedAt: null,
        });
        await expectUpBlocked(qr, 'inactive_not_soft_deleted');
      });
    });

    it('aborts on soft_deleted_not_completed', async () => {
      await inRolledBackTxn(async (qr) => {
        const poId = uuid(7030);
        await seedPo(qr, poId, 'PO-VOID-7030');
        await seedPayment(qr, {
          id: uuid(7031),
          purchaseOrderId: poId,
          amount: '10.0000',
          status: 'pending',
          isActive: false,
          deletedAt: DELETED_AT,
        });
        await expectUpBlocked(qr, 'soft_deleted_not_completed');
      });
    });

    it('aborts on zero_amount and names the count', async () => {
      await inRolledBackTxn(async (qr) => {
        const poId = uuid(7040);
        await seedPo(qr, poId, 'PO-VOID-7040');
        for (const [index, id] of [uuid(7041), uuid(7042)].entries()) {
          await seedPayment(qr, {
            id,
            purchaseOrderId: poId,
            amount: 0,
            isActive: false,
            deletedAt: DELETED_AT,
            referenceNumber: `ZERO-${index}`,
          });
        }
        await expectUpBlocked(qr, 'zero_amount', 2);
      });
    });

    it('aborts on no_purchase_order', async () => {
      await inRolledBackTxn(async (qr) => {
        await seedSupplier(qr);
        await seedPayment(qr, {
          id: uuid(7051),
          purchaseOrderId: null,
          amount: '10.0000',
          isActive: false,
          deletedAt: DELETED_AT,
        });
        await expectUpBlocked(qr, 'no_purchase_order');
      });
    });

    it('aborts on unexpected_posting_type', async () => {
      await inRolledBackTxn(async (qr) => {
        const poId = uuid(7060);
        const paymentId = uuid(7061);
        await seedPo(qr, poId, 'PO-VOID-7060');
        await seedPayment(qr, {
          id: paymentId,
          purchaseOrderId: poId,
          amount: '100.0000',
          isActive: false,
          deletedAt: DELETED_AT,
        });
        // A positive payment expects PURCHASE_PAYMENT; a refund original is foreign.
        await seedEntry(qr, {
          id: uuid(7062),
          paymentId,
          postingType: 'PURCHASE_REFUND',
          sourceDocumentId: poId,
        });
        await expectUpBlocked(qr, 'unexpected_posting_type');
      });
    });

    it('aborts on foreign_document, including a null sourceDocumentId', async () => {
      await inRolledBackTxn(async (qr) => {
        const poId = uuid(7070);
        const paymentId = uuid(7071);
        await seedPo(qr, poId, 'PO-VOID-7070');
        await seedPayment(qr, {
          id: paymentId,
          purchaseOrderId: poId,
          amount: '100.0000',
          isActive: false,
          deletedAt: DELETED_AT,
        });
        // IS DISTINCT FROM: a NULL document is foreign to a non-null purchase order.
        await seedEntry(qr, {
          id: uuid(7072),
          paymentId,
          postingType: 'PURCHASE_PAYMENT',
          sourceDocumentId: null,
        });
        await expectUpBlocked(qr, 'foreign_document');
      });
    });

    it('reports the first blocking reason in predicate order', async () => {
      await inRolledBackTxn(async (qr) => {
        const poId = uuid(7080);
        await seedPo(qr, poId, 'PO-VOID-7080');
        await seedPayment(qr, {
          id: uuid(7081),
          purchaseOrderId: poId,
          amount: 0,
          isActive: false,
          deletedAt: DELETED_AT,
        });
        await seedPayment(qr, {
          id: uuid(7082),
          purchaseOrderId: poId,
          amount: '10.0000',
          status: 'voided',
        });
        await expectUpBlocked(qr, 'already_voided');
      });
    });

    it('soft_deleted_unreversed does not abort: converts with a null link', async () => {
      await inRolledBackTxn(async (qr) => {
        const poId = uuid(7090);
        const paymentId = uuid(7091);
        await seedPo(qr, poId, 'PO-VOID-7090');
        await seedPayment(qr, {
          id: paymentId,
          purchaseOrderId: poId,
          amount: '100.0000',
          isActive: false,
          deletedAt: DELETED_AT,
        });
        // Expected original exists but was never reversed: damage, not blocking.
        await seedEntry(qr, {
          id: uuid(7092),
          paymentId,
          postingType: 'PURCHASE_PAYMENT',
          sourceDocumentId: poId,
        });

        await migration.up(qr);

        const [row] = await qr.query(
          `SELECT status, "voidedAt", "voidReversalEntryId", "deletedAt"
             FROM vendor_payments WHERE id = $1`,
          [paymentId],
        );
        expect(row.status).toBe('voided');
        expect(new Date(row.voidedAt).toISOString()).toBe(DELETED_AT.toISOString());
        expect(row.voidReversalEntryId).toBeNull();
        expect(row.deletedAt).toBeNull();
      });
    });
  });

  describe('down', () => {
    it('refuses when an application void exists and leaves everything unchanged', async () => {
      await inRolledBackTxn(async (qr) => {
        const ids: ConvertibleIds = {
          poId: uuid(8001),
          paymentId: uuid(8002),
          originalId: uuid(8003),
          reversalId: uuid(8004),
        };
        await seedConvertible(qr, ids, { orderNumber: 'PO-VOID-8001' });
        await migration.up(qr);
        await qr.query(
          `INSERT INTO vendor_payments
             (id, "supplierId", "purchaseOrderId", amount, "paymentDate", status, "isActive",
              "voidedAt", "voidedByUserId")
           VALUES ($1, $2, $3, 20, DATE '2026-01-15', 'voided', false, now(), $4)`,
          [uuid(8005), SUPPLIER_ID, ids.poId, VOIDER_ID],
        );

        const columnsBefore = await voidColumns(qr);
        const checksBefore = await voidChecks(qr);
        const rowsBefore = await paymentSnapshot(qr);
        expect(columnsBefore).toEqual(VOID_COLUMNS);
        expect(checksBefore).toEqual(VOID_CHECKS);
        expect(rowsBefore).toHaveLength(2);

        await expect(migration.down(qr)).rejects.toThrow(/application void/);

        expect(await voidColumns(qr)).toEqual(columnsBefore);
        expect(await voidChecks(qr)).toEqual(checksBefore);
        expect(await paymentSnapshot(qr)).toEqual(rowsBefore);
        expect(await voidFk(qr)).toHaveLength(1);
      });
    });

    it('restores migrated voids to their soft-deleted shape and removes the artifacts', async () => {
      await inRolledBackTxn(async (qr) => {
        const ids: ConvertibleIds = {
          poId: uuid(8011),
          paymentId: uuid(8012),
          originalId: uuid(8013),
          reversalId: uuid(8014),
        };
        await seedConvertible(qr, ids, { orderNumber: 'PO-VOID-8011' });
        const po2 = uuid(8015);
        const payment2 = uuid(8016);
        await seedPo(qr, po2, 'PO-VOID-8015');
        await seedPayment(qr, {
          id: payment2,
          purchaseOrderId: po2,
          amount: '30.0000',
          isActive: false,
          deletedAt: DELETED_AT,
        });
        await seedEntry(qr, {
          id: uuid(8017),
          paymentId: payment2,
          postingType: 'PURCHASE_PAYMENT',
          sourceDocumentId: po2,
        });

        await migration.up(qr);
        const voided = await qr.query(
          `SELECT id, status, "deletedAt" FROM vendor_payments
            WHERE id IN ($1, $2) ORDER BY id`,
          [ids.paymentId, payment2],
        );
        expect(voided).toHaveLength(2);
        for (const row of voided) {
          expect(row.status).toBe('voided');
          expect(row.deletedAt).toBeNull();
        }

        await migration.down(qr);

        const rows = await qr.query(
          `SELECT id, status, "isActive", "deletedAt" FROM vendor_payments
            WHERE id IN ($1, $2) ORDER BY id`,
          [ids.paymentId, payment2],
        );
        expect(rows).toHaveLength(2);
        for (const row of rows) {
          expect(row.status).toBe('completed');
          expect(row.isActive).toBe(false);
          expect(new Date(row.deletedAt).toISOString()).toBe(DELETED_AT.toISOString());
        }
        expect(await voidColumns(qr)).toEqual([]);
        expect(await voidChecks(qr)).toEqual([]);
        expect(await voidFk(qr)).toEqual([]);
      });
    });

    it('down then up round-trips', async () => {
      await inRolledBackTxn(async (qr) => {
        const ids: ConvertibleIds = {
          poId: uuid(8021),
          paymentId: uuid(8022),
          originalId: uuid(8023),
          reversalId: uuid(8024),
        };
        await seedConvertible(qr, ids, { orderNumber: 'PO-VOID-8021' });
        const po2 = uuid(8025);
        const payment2 = uuid(8026);
        await seedPo(qr, po2, 'PO-VOID-8025');
        await seedPayment(qr, {
          id: payment2,
          purchaseOrderId: po2,
          amount: '30.0000',
          isActive: false,
          deletedAt: DELETED_AT,
        });
        await seedEntry(qr, {
          id: uuid(8027),
          paymentId: payment2,
          postingType: 'PURCHASE_PAYMENT',
          sourceDocumentId: po2,
        });

        const voidShape = async (): Promise<Array<Record<string, unknown>>> =>
          qr.query(
            `SELECT id, status, "voidedAt", "voidedByUserId", "voidReversalEntryId",
                    "deletedAt", "isActive", amount::text AS amount
               FROM vendor_payments WHERE id IN ($1, $2) ORDER BY id`,
            [ids.paymentId, payment2],
          );

        await migration.up(qr);
        const afterFirstUp = await voidShape();
        await migration.down(qr);
        await migration.up(qr);
        expect(await voidShape()).toEqual(afterFirstUp);
      });
    });

    it('down is atomic: a forced failure rolls back the whole down', async () => {
      await inRolledBackTxn(async (qr) => {
        const ids: ConvertibleIds = {
          poId: uuid(8031),
          paymentId: uuid(8032),
          originalId: uuid(8033),
          reversalId: uuid(8034),
        };
        await seedConvertible(qr, ids, { orderNumber: 'PO-VOID-8031' });
        await migration.up(qr);
        // A view over the new columns makes the final DROP COLUMN fail after
        // the CHECKs were already dropped.
        await qr.query(
          `CREATE VIEW "void_down_atomic_blocker" AS
             SELECT "voidedAt", "voidedByUserId", "voidReversalEntryId" FROM vendor_payments`,
        );

        const columnsBefore = await voidColumns(qr);
        const checksBefore = await voidChecks(qr);
        const rowsBefore = await paymentSnapshot(qr);

        await qr.query('SAVEPOINT sp_void_down_atomic');
        await expect(migration.down(qr)).rejects.toThrow(/depend/);
        await qr.query('ROLLBACK TO SAVEPOINT sp_void_down_atomic');

        expect(await voidColumns(qr)).toEqual(columnsBefore);
        expect(await voidChecks(qr)).toEqual(checksBefore);
        expect(await paymentSnapshot(qr)).toEqual(rowsBefore);
        expect(await voidFk(qr)).toHaveLength(1);
      });
    });
  });
});
