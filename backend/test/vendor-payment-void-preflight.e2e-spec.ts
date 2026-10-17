import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource, QueryRunner } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureTestAppValidation } from './utils/configure-test-app-validation';

/**
 * e2e for backend/scripts/preflight-vendor-payments-void.sql (issue #1401).
 *
 * The script is read-only. It runs here with BEGIN READ ONLY;/ROLLBACK;
 * stripped because the whole suite runs inside a transaction that is always
 * rolled back. Every case seeds raw rows and asserts the exact findings.
 */

let app: INestApplication;
let ds: DataSource;

interface Finding {
  gate: 'blocking' | 'damage' | 'convert';
  reason: string;
  payment_id: string;
  purchase_order_id: string | null;
  journal_entry_ids: string[];
  detail: string;
}

interface ReasonCount {
  gate: string;
  reason: string;
  count: number;
}

const PREFLIGHT_PATH = path.join(
  process.cwd(),
  'scripts/preflight-vendor-payments-void.sql',
);

const uuid = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const SUPPLIER_ID = uuid(1);
const DELETED_AT = new Date('2026-01-20T10:00:00.000Z');

let journalSeq = 0;
const nextJournalNo = (): string => `VP-PRE-${++journalSeq}`;

const sortedIds = (...ids: string[]): string[] => [...ids].sort();

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

/**
 * The script reads pre-migration columns only and the cases seed pre-migration
 * row shapes, so the void-state CHECKs added by VoidVendorPayments1792179464025
 * are dropped first. `IF EXISTS` keeps this working on an unmigrated database;
 * the rollback restores the schema.
 */
async function dropPostMigrationConstraints(qr: QueryRunner): Promise<void> {
  await qr.query(
    `ALTER TABLE "vendor_payments" DROP CONSTRAINT IF EXISTS "CHK_vendor_payments_void_state"`,
  );
  await qr.query(
    `ALTER TABLE "vendor_payments" DROP CONSTRAINT IF EXISTS "CHK_vendor_payments_never_soft_deleted"`,
  );
}

/** Runs `fn` inside a transaction that is ALWAYS rolled back. */
async function inRolledBackTxn(fn: (qr: QueryRunner) => Promise<void>): Promise<void> {
  const qr = ds.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    await dropPostMigrationConstraints(qr);
    await fn(qr);
  } finally {
    await qr.rollbackTransaction();
    await qr.release();
  }
}

async function seedSupplier(qr: QueryRunner): Promise<void> {
  await qr.query(
    `INSERT INTO suppliers (id, "companyName") VALUES ($1, 'Void preflight supplier')
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

async function seedPayment(
  qr: QueryRunner,
  payment: {
    id: string;
    amount: number | string;
    purchaseOrderId?: string | null;
    status?: string;
    isActive?: boolean;
    deletedAt?: Date | null;
  },
): Promise<void> {
  await qr.query(
    `INSERT INTO vendor_payments
       (id, "supplierId", "purchaseOrderId", amount, "paymentDate", status, "isActive", "deletedAt")
     VALUES ($1, $2, $3, $4, DATE '2026-01-15', $5, $6, $7)`,
    [
      payment.id,
      SUPPLIER_ID,
      payment.purchaseOrderId ?? null,
      payment.amount,
      payment.status ?? 'completed',
      payment.isActive ?? true,
      payment.deletedAt ?? null,
    ],
  );
}

async function seedEntry(
  qr: QueryRunner,
  entry: {
    id: string;
    paymentId: string;
    postingType: 'PURCHASE_PAYMENT' | 'PURCHASE_REFUND';
    sourceDocumentId: string | null;
    reversalOfEntryId?: string | null;
  },
): Promise<void> {
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

/** The script body as runnable statements: comments, BEGIN READ ONLY; and ROLLBACK; removed. */
function preflightStatements(): string[] {
  const raw = fs.readFileSync(PREFLIGHT_PATH, 'utf8');
  expect(raw).toMatch(/BEGIN READ ONLY;/i);
  expect(raw).toMatch(/ROLLBACK;/i);
  const withoutTxn = raw.replace(/BEGIN READ ONLY;/i, '').replace(/ROLLBACK;/i, '');
  return withoutTxn
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

async function runPreflight(
  qr: QueryRunner,
): Promise<{ findings: Finding[]; counts: ReasonCount[] }> {
  const statements = preflightStatements();
  expect(statements).toHaveLength(2);
  const findings: Finding[] = await qr.query(statements[0]);
  const counts: ReasonCount[] = await qr.query(statements[1]);
  return { findings, counts };
}

function expectFinding(
  findings: Finding[],
  expected: {
    gate: Finding['gate'];
    reason: string;
    paymentId: string;
    purchaseOrderId?: string | null;
    journalEntryIds: string[];
  },
): void {
  const matches = findings.filter((finding) => finding.payment_id === expected.paymentId);
  expect(matches).toHaveLength(1);
  const finding = matches[0];
  expect(finding.gate).toBe(expected.gate);
  expect(finding.reason).toBe(expected.reason);
  expect(finding.payment_id).toBe(expected.paymentId);
  expect(finding.journal_entry_ids).toEqual(expected.journalEntryIds);
  expect(finding.detail).toEqual(expect.any(String));
  if (expected.purchaseOrderId !== undefined) {
    expect(finding.purchase_order_id).toBe(expected.purchaseOrderId);
  }
}

describe('preflight-vendor-payments-void.sql (read-only before check)', () => {
  it('an original with its reversal is not a finding', async () => {
    await inRolledBackTxn(async (qr) => {
      const poLive = uuid(1001);
      const poDeleted = uuid(1002);
      await seedPo(qr, poLive, 'PO-VP-PRE-1001');
      await seedPo(qr, poDeleted, 'PO-VP-PRE-1002');

      // A live payment with one unreversed original: healthy, no finding.
      const livePayment = uuid(2001);
      const liveOriginal = uuid(3001);
      await seedPayment(qr, { id: livePayment, purchaseOrderId: poLive, amount: '100.0000' });
      await seedEntry(qr, {
        id: liveOriginal,
        paymentId: livePayment,
        postingType: 'PURCHASE_PAYMENT',
        sourceDocumentId: poLive,
      });

      // A soft-deleted payment whose original has its reversal: only convert.
      const deletedPayment = uuid(2002);
      const deletedOriginal = uuid(3002);
      const deletedReversal = uuid(3003);
      await seedPayment(qr, {
        id: deletedPayment,
        purchaseOrderId: poDeleted,
        amount: '50.0000',
        isActive: false,
        deletedAt: DELETED_AT,
      });
      await seedEntry(qr, {
        id: deletedOriginal,
        paymentId: deletedPayment,
        postingType: 'PURCHASE_PAYMENT',
        sourceDocumentId: poDeleted,
      });
      await seedEntry(qr, {
        id: deletedReversal,
        paymentId: deletedPayment,
        postingType: 'PURCHASE_PAYMENT',
        sourceDocumentId: poDeleted,
        reversalOfEntryId: deletedOriginal,
      });

      const { findings } = await runPreflight(qr);

      expect(findings.filter((finding) => finding.payment_id === livePayment)).toHaveLength(0);
      expectFinding(findings, {
        gate: 'convert',
        reason: 'soft_deleted_linkable',
        paymentId: deletedPayment,
        purchaseOrderId: poDeleted,
        journalEntryIds: sortedIds(deletedOriginal, deletedReversal),
      });
      // The original and its reversal are one chain, never a multiple-entries finding.
      expect(findings.filter((finding) => finding.payment_id === deletedPayment)).toHaveLength(1);
    });
  });

  it('converts soft_deleted_linkable', async () => {
    await inRolledBackTxn(async (qr) => {
      const poId = uuid(1003);
      const payment = uuid(2003);
      const original = uuid(3004);
      const reversal = uuid(3005);
      await seedPo(qr, poId, 'PO-VP-PRE-1003');
      await seedPayment(qr, {
        id: payment,
        purchaseOrderId: poId,
        amount: '80.0000',
        isActive: false,
        deletedAt: DELETED_AT,
      });
      await seedEntry(qr, {
        id: original,
        paymentId: payment,
        postingType: 'PURCHASE_PAYMENT',
        sourceDocumentId: poId,
      });
      await seedEntry(qr, {
        id: reversal,
        paymentId: payment,
        postingType: 'PURCHASE_PAYMENT',
        sourceDocumentId: poId,
        reversalOfEntryId: original,
      });

      const { findings } = await runPreflight(qr);

      expectFinding(findings, {
        gate: 'convert',
        reason: 'soft_deleted_linkable',
        paymentId: payment,
        purchaseOrderId: poId,
        journalEntryIds: sortedIds(original, reversal),
      });
    });
  });

  it('blocks soft_deleted_still_active', async () => {
    await inRolledBackTxn(async (qr) => {
      const poId = uuid(1010);
      const payment = uuid(2010);
      await seedPo(qr, poId, 'PO-VP-PRE-1010');
      await seedPayment(qr, {
        id: payment,
        purchaseOrderId: poId,
        amount: '10.0000',
        isActive: true,
        deletedAt: DELETED_AT,
      });

      const { findings } = await runPreflight(qr);

      expectFinding(findings, {
        gate: 'blocking',
        reason: 'soft_deleted_still_active',
        paymentId: payment,
        purchaseOrderId: poId,
        journalEntryIds: [],
      });
    });
  });

  it('blocks inactive_not_soft_deleted', async () => {
    await inRolledBackTxn(async (qr) => {
      const poId = uuid(1011);
      const payment = uuid(2011);
      await seedPo(qr, poId, 'PO-VP-PRE-1011');
      await seedPayment(qr, {
        id: payment,
        purchaseOrderId: poId,
        amount: '10.0000',
        isActive: false,
        deletedAt: null,
      });

      const { findings } = await runPreflight(qr);

      expectFinding(findings, {
        gate: 'blocking',
        reason: 'inactive_not_soft_deleted',
        paymentId: payment,
        purchaseOrderId: poId,
        journalEntryIds: [],
      });
    });
  });

  it('blocks soft_deleted_not_completed', async () => {
    await inRolledBackTxn(async (qr) => {
      const poId = uuid(1012);
      const payment = uuid(2012);
      await seedPo(qr, poId, 'PO-VP-PRE-1012');
      await seedPayment(qr, {
        id: payment,
        purchaseOrderId: poId,
        amount: '10.0000',
        status: 'pending',
        isActive: false,
        deletedAt: DELETED_AT,
      });

      const { findings } = await runPreflight(qr);

      expectFinding(findings, {
        gate: 'blocking',
        reason: 'soft_deleted_not_completed',
        paymentId: payment,
        purchaseOrderId: poId,
        journalEntryIds: [],
      });
    });
  });

  it('blocks already_voided', async () => {
    await inRolledBackTxn(async (qr) => {
      const poId = uuid(1013);
      const payment = uuid(2013);
      await seedPo(qr, poId, 'PO-VP-PRE-1013');
      await seedPayment(qr, {
        id: payment,
        purchaseOrderId: poId,
        amount: '10.0000',
        status: 'voided',
      });

      const { findings } = await runPreflight(qr);

      expectFinding(findings, {
        gate: 'blocking',
        reason: 'already_voided',
        paymentId: payment,
        purchaseOrderId: poId,
        journalEntryIds: [],
      });
    });
  });

  it('blocks zero_amount on a soft-deleted row', async () => {
    await inRolledBackTxn(async (qr) => {
      const poId = uuid(1014);
      const payment = uuid(2014);
      await seedPo(qr, poId, 'PO-VP-PRE-1014');
      await seedPayment(qr, {
        id: payment,
        purchaseOrderId: poId,
        amount: 0,
        isActive: false,
        deletedAt: DELETED_AT,
      });

      const { findings } = await runPreflight(qr);

      expectFinding(findings, {
        gate: 'blocking',
        reason: 'zero_amount',
        paymentId: payment,
        purchaseOrderId: poId,
        journalEntryIds: [],
      });
    });
  });

  it('blocks no_purchase_order on a soft-deleted row', async () => {
    await inRolledBackTxn(async (qr) => {
      const payment = uuid(2015);
      await seedSupplier(qr);
      await seedPayment(qr, {
        id: payment,
        purchaseOrderId: null,
        amount: '10.0000',
        isActive: false,
        deletedAt: DELETED_AT,
      });

      const { findings } = await runPreflight(qr);

      expectFinding(findings, {
        gate: 'blocking',
        reason: 'no_purchase_order',
        paymentId: payment,
        purchaseOrderId: null,
        journalEntryIds: [],
      });
    });
  });

  it('blocks unexpected_posting_type on a soft-deleted row', async () => {
    await inRolledBackTxn(async (qr) => {
      const poId = uuid(1016);
      const payment = uuid(2016);
      const original = uuid(3016);
      await seedPo(qr, poId, 'PO-VP-PRE-1016');
      await seedPayment(qr, {
        id: payment,
        purchaseOrderId: poId,
        amount: '100.0000',
        isActive: false,
        deletedAt: DELETED_AT,
      });
      // A positive payment expects PURCHASE_PAYMENT; a refund original is foreign.
      await seedEntry(qr, {
        id: original,
        paymentId: payment,
        postingType: 'PURCHASE_REFUND',
        sourceDocumentId: poId,
      });

      const { findings } = await runPreflight(qr);

      expectFinding(findings, {
        gate: 'blocking',
        reason: 'unexpected_posting_type',
        paymentId: payment,
        purchaseOrderId: poId,
        journalEntryIds: [original],
      });
    });
  });

  it('blocks foreign_document on a soft-deleted row', async () => {
    await inRolledBackTxn(async (qr) => {
      const poId = uuid(1017);
      const otherPoId = uuid(1018);
      const payment = uuid(2017);
      const original = uuid(3017);
      await seedPo(qr, poId, 'PO-VP-PRE-1017');
      await seedPayment(qr, {
        id: payment,
        purchaseOrderId: poId,
        amount: '100.0000',
        isActive: false,
        deletedAt: DELETED_AT,
      });
      await seedEntry(qr, {
        id: original,
        paymentId: payment,
        postingType: 'PURCHASE_PAYMENT',
        sourceDocumentId: otherPoId,
      });

      const { findings } = await runPreflight(qr);

      expectFinding(findings, {
        gate: 'blocking',
        reason: 'foreign_document',
        paymentId: payment,
        purchaseOrderId: poId,
        journalEntryIds: [original],
      });
    });
  });

  it('flags live_original_reversed', async () => {
    await inRolledBackTxn(async (qr) => {
      const poId = uuid(1020);
      const payment = uuid(2020);
      const original = uuid(3020);
      const reversal = uuid(3021);
      await seedPo(qr, poId, 'PO-VP-PRE-1020');
      await seedPayment(qr, { id: payment, purchaseOrderId: poId, amount: '100.0000' });
      await seedEntry(qr, {
        id: original,
        paymentId: payment,
        postingType: 'PURCHASE_PAYMENT',
        sourceDocumentId: poId,
      });
      await seedEntry(qr, {
        id: reversal,
        paymentId: payment,
        postingType: 'PURCHASE_PAYMENT',
        sourceDocumentId: poId,
        reversalOfEntryId: original,
      });

      const { findings } = await runPreflight(qr);

      expectFinding(findings, {
        gate: 'damage',
        reason: 'live_original_reversed',
        paymentId: payment,
        purchaseOrderId: poId,
        journalEntryIds: sortedIds(original, reversal),
      });
    });
  });

  it('flags live_without_original', async () => {
    await inRolledBackTxn(async (qr) => {
      const poId = uuid(1021);
      const payment = uuid(2021);
      await seedPo(qr, poId, 'PO-VP-PRE-1021');
      await seedPayment(qr, { id: payment, purchaseOrderId: poId, amount: '100.0000' });

      const { findings } = await runPreflight(qr);

      expectFinding(findings, {
        gate: 'damage',
        reason: 'live_without_original',
        paymentId: payment,
        purchaseOrderId: poId,
        journalEntryIds: [],
      });
    });
  });

  it('flags live_lookup_rejected with the lookup rejection in detail', async () => {
    await inRolledBackTxn(async (qr) => {
      const poId = uuid(1022);
      const otherPoId = uuid(1023);
      const payment = uuid(2022);
      const original = uuid(3022);
      await seedPo(qr, poId, 'PO-VP-PRE-1022');
      await seedPayment(qr, { id: payment, purchaseOrderId: poId, amount: '100.0000' });
      await seedEntry(qr, {
        id: original,
        paymentId: payment,
        postingType: 'PURCHASE_PAYMENT',
        sourceDocumentId: otherPoId,
      });

      const { findings } = await runPreflight(qr);

      expectFinding(findings, {
        gate: 'damage',
        reason: 'live_lookup_rejected',
        paymentId: payment,
        purchaseOrderId: poId,
        journalEntryIds: [original],
      });
      expect(findings[0].detail).toContain('foreign_document');
    });
  });

  it('flags soft_deleted_unreversed', async () => {
    await inRolledBackTxn(async (qr) => {
      const poId = uuid(1024);
      const payment = uuid(2024);
      const original = uuid(3024);
      await seedPo(qr, poId, 'PO-VP-PRE-1024');
      await seedPayment(qr, {
        id: payment,
        purchaseOrderId: poId,
        amount: '100.0000',
        isActive: false,
        deletedAt: DELETED_AT,
      });
      await seedEntry(qr, {
        id: original,
        paymentId: payment,
        postingType: 'PURCHASE_PAYMENT',
        sourceDocumentId: poId,
      });

      const { findings } = await runPreflight(qr);

      expectFinding(findings, {
        gate: 'damage',
        reason: 'soft_deleted_unreversed',
        paymentId: payment,
        purchaseOrderId: poId,
        journalEntryIds: [original],
      });
    });
  });

  it('flags soft_deleted_no_original', async () => {
    await inRolledBackTxn(async (qr) => {
      const poId = uuid(1025);
      const payment = uuid(2025);
      await seedPo(qr, poId, 'PO-VP-PRE-1025');
      await seedPayment(qr, {
        id: payment,
        purchaseOrderId: poId,
        amount: '100.0000',
        isActive: false,
        deletedAt: DELETED_AT,
      });

      const { findings } = await runPreflight(qr);

      expectFinding(findings, {
        gate: 'damage',
        reason: 'soft_deleted_no_original',
        paymentId: payment,
        purchaseOrderId: poId,
        journalEntryIds: [],
      });
    });
  });

  it('flags restore_candidate on a live row whose PO holds soft-deleted rows', async () => {
    await inRolledBackTxn(async (qr) => {
      const poId = uuid(1030);
      await seedPo(qr, poId, 'PO-VP-PRE-1030');

      const livePayment = uuid(2030);
      const liveOriginal = uuid(3030);
      await seedPayment(qr, { id: livePayment, purchaseOrderId: poId, amount: '100.0000' });
      await seedEntry(qr, {
        id: liveOriginal,
        paymentId: livePayment,
        postingType: 'PURCHASE_PAYMENT',
        sourceDocumentId: poId,
      });

      const deletedPayment = uuid(2031);
      const deletedOriginal = uuid(3031);
      const deletedReversal = uuid(3032);
      await seedPayment(qr, {
        id: deletedPayment,
        purchaseOrderId: poId,
        amount: '40.0000',
        isActive: false,
        deletedAt: DELETED_AT,
      });
      await seedEntry(qr, {
        id: deletedOriginal,
        paymentId: deletedPayment,
        postingType: 'PURCHASE_PAYMENT',
        sourceDocumentId: poId,
      });
      await seedEntry(qr, {
        id: deletedReversal,
        paymentId: deletedPayment,
        postingType: 'PURCHASE_PAYMENT',
        sourceDocumentId: poId,
        reversalOfEntryId: deletedOriginal,
      });

      const { findings } = await runPreflight(qr);

      expectFinding(findings, {
        gate: 'damage',
        reason: 'restore_candidate',
        paymentId: livePayment,
        purchaseOrderId: poId,
        journalEntryIds: [liveOriginal],
      });
      expectFinding(findings, {
        gate: 'convert',
        reason: 'soft_deleted_linkable',
        paymentId: deletedPayment,
        purchaseOrderId: poId,
        journalEntryIds: sortedIds(deletedOriginal, deletedReversal),
      });
    });
  });

  it('two originals of different types for one payment id is unexpected_posting_type', async () => {
    await inRolledBackTxn(async (qr) => {
      const poId = uuid(1040);
      const payment = uuid(2040);
      const paymentOriginal = uuid(3040);
      const refundOriginal = uuid(3041);
      await seedPo(qr, poId, 'PO-VP-PRE-1040');
      await seedPayment(qr, {
        id: payment,
        purchaseOrderId: poId,
        amount: '100.0000',
        isActive: false,
        deletedAt: DELETED_AT,
      });
      await seedEntry(qr, {
        id: paymentOriginal,
        paymentId: payment,
        postingType: 'PURCHASE_PAYMENT',
        sourceDocumentId: poId,
      });
      await seedEntry(qr, {
        id: refundOriginal,
        paymentId: payment,
        postingType: 'PURCHASE_REFUND',
        sourceDocumentId: poId,
      });

      const { findings } = await runPreflight(qr);

      expectFinding(findings, {
        gate: 'blocking',
        reason: 'unexpected_posting_type',
        paymentId: payment,
        purchaseOrderId: poId,
        journalEntryIds: sortedIds(paymentOriginal, refundOriginal),
      });
    });
  });

  it('lists findings ordered by gate, reason and payment_id', async () => {
    await inRolledBackTxn(async (qr) => {
      const poId = uuid(1050);
      const poId2 = uuid(1051);
      await seedPo(qr, poId, 'PO-VP-PRE-1050');
      await seedPo(qr, poId2, 'PO-VP-PRE-1051');

      const voidedPayment = uuid(2050);
      await seedPayment(qr, {
        id: voidedPayment,
        purchaseOrderId: poId,
        amount: '10.0000',
        status: 'voided',
      });

      for (const [paymentId, poIdFor] of [
        [uuid(2051), poId],
        [uuid(2052), poId2],
      ] as const) {
        const original = uuid(Number(paymentId.slice(-4)) + 1000);
        const reversal = uuid(Number(paymentId.slice(-4)) + 2000);
        await seedPayment(qr, {
          id: paymentId,
          purchaseOrderId: poIdFor,
          amount: '25.0000',
          isActive: false,
          deletedAt: DELETED_AT,
        });
        await seedEntry(qr, {
          id: original,
          paymentId,
          postingType: 'PURCHASE_PAYMENT',
          sourceDocumentId: poIdFor,
        });
        await seedEntry(qr, {
          id: reversal,
          paymentId,
          postingType: 'PURCHASE_PAYMENT',
          sourceDocumentId: poIdFor,
          reversalOfEntryId: original,
        });
      }

      const { findings } = await runPreflight(qr);

      expect(findings.map((finding) => `${finding.gate}|${finding.reason}|${finding.payment_id}`)).toEqual([
        `blocking|already_voided|${voidedPayment}`,
        `convert|soft_deleted_linkable|${uuid(2051)}`,
        `convert|soft_deleted_linkable|${uuid(2052)}`,
      ]);
    });
  });

  it('the script writes nothing', async () => {
    await inRolledBackTxn(async (qr) => {
      const poId = uuid(1060);
      const payment = uuid(2060);
      await seedPo(qr, poId, 'PO-VP-PRE-1060');
      await seedPayment(qr, {
        id: payment,
        purchaseOrderId: poId,
        amount: '75.0000',
        isActive: false,
        deletedAt: DELETED_AT,
      });
      await seedEntry(qr, {
        id: uuid(3060),
        paymentId: payment,
        postingType: 'PURCHASE_PAYMENT',
        sourceDocumentId: poId,
      });

      const countRows = async (): Promise<Record<string, number>> => {
        const rows: Array<{ table_name: string; row_count: number }> = await qr.query(`
          SELECT 'vendor_payments' AS table_name, count(*)::int AS row_count FROM vendor_payments
          UNION ALL SELECT 'journal_entry', count(*)::int FROM journal_entry
          UNION ALL SELECT 'suppliers', count(*)::int FROM suppliers
          UNION ALL SELECT 'purchase_orders', count(*)::int FROM purchase_orders
          ORDER BY table_name`);
        return Object.fromEntries(rows.map((row) => [row.table_name, row.row_count]));
      };

      const before = await countRows();
      const { findings, counts } = await runPreflight(qr);
      const after = await countRows();

      expect(before.vendor_payments).toBeGreaterThan(0);
      expect(after).toEqual(before);

      const expectedCounts = new Map<string, number>();
      for (const finding of findings) {
        const key = `${finding.gate}|${finding.reason}`;
        expectedCounts.set(key, (expectedCounts.get(key) ?? 0) + 1);
      }
      expect(counts.map((row) => `${row.gate}|${row.reason}=${row.count}`).sort()).toEqual(
        [...expectedCounts.entries()].map(([key, count]) => `${key}=${count}`).sort(),
      );
    });
  });
});
