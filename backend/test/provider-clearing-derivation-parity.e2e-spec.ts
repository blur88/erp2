import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { seedCategory, seedProduct } from './e2e/helpers/seed';
import { configureTestAppValidation } from './utils/configure-test-app-validation';
import {
  E2E_ADMIN_PASSWORD,
  removeSuiteAdmin,
  seedSuiteAdmin,
} from './utils/shared-e2e-fixture';
import { removeSuiteTraces } from './utils/shared-e2e-traces-fixture';
import { accountIdByCode, methodIdByCode } from './utils/payment-method-matrix-fixture';
import { PostingType } from '../src/common/accounting-posting/enums';
import { ProviderSettlementDerivationService } from '../src/modules/provider-settlements/services/provider-settlement-derivation.service';
import { ProviderSettlementEligibilityService } from '../src/modules/provider-settlements/services/provider-settlement-eligibility.service';

/**
 * #1285 drift gate. The TS derivation is authoritative; the SQL mirror exists
 * only so the picker can filter before pagination. This suite feeds both the
 * SAME real journal rows and asserts they agree, fixture by fixture.
 *
 * The fixture matrix deliberately includes every rejection path the TS
 * derivation implements, plus the two soft-delete cases and the "posting
 * history, not the live mapping" case. A change to either implementation that
 * is not mirrored by the other turns exactly one fixture red.
 */
const runId = randomUUID().slice(0, 8);

const UNIQUE_EVENT_INDEX = 'UQ_journal_entry_source_event';

type FixturePayment = { id: string; salesOrderId: string; amount: string };
/**
 * `stage` runs INSIDE the transaction both derivations read in, and that
 * transaction is always rolled back. Use it for states the schema forbids:
 * PostgreSQL DDL is transactional, so an index dropped there is restored by the
 * rollback even if the process dies mid-test — nothing outside can observe it.
 */
type FixtureBuild = { payment: FixturePayment; stage?: (m: EntityManager) => Promise<void> };
type Fixture = [
  name: string,
  build: () => Promise<FixturePayment | FixtureBuild>,
  expected: string | null,
];

describe('Provider clearing-account derivation parity (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let token = '';
  let post: (path: string, body?: any) => request.Test;
  let put: (path: string, body?: any) => request.Test;

  let adminUserId = '';
  let adminUsername = '';
  let customerId = '';
  let productId = '';
  let categoryId = '';
  let shopeeMethodId = '';
  let cimbMethodId = '';
  let depositAccountId = '';
  let clearingShopeeAccountId = '';
  let cashAccountId = '';

  let derivation: ProviderSettlementDerivationService;
  let eligibility: ProviderSettlementEligibilityService;

  const ownedEntityIds: string[] = [];
  const ownedRefs: string[] = [];
  const ownedSalesOrderIds: string[] = [];

  let journalSeq = 0;
  const nextJournalNo = () => `PAR-${runId}-${++journalSeq}`;
  const trackRef = (ref: string): string => {
    ownedRefs.push(ref);
    return ref;
  };

  // Restores deferred by a fixture (the CIMB remap), drained in the it.each
  // `finally` so the remap is still in effect while both derivations read.
  const pendingRestores: Array<() => Promise<void>> = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();
    ds = moduleFixture.get(DataSource);

    derivation = moduleFixture.get(ProviderSettlementDerivationService);
    eligibility = moduleFixture.get(ProviderSettlementEligibilityService);

    const category = await seedCategory(ds, `parity-e2e-${runId}`);
    categoryId = category.id;
    const product = await seedProduct(ds, categoryId, {
      stockQuantity: 500,
      baseCost: 10,
    });
    productId = product.id;
    ownedEntityIds.push(productId, categoryId);

    adminUsername = `e2espec_parity_admin_${runId}`;
    const admin = await seedSuiteAdmin(ds, adminUsername);
    adminUserId = admin.id;

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ usernameOrEmail: adminUsername, password: E2E_ADMIN_PASSWORD });
    token = loginRes.body?.data?.accessToken ?? loginRes.body?.accessToken;
    expect(token).toBeTruthy();

    const server = app.getHttpServer();
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    post = (path: string, body: any = {}) =>
      auth(request(server).post(path).send(body));
    put = (path: string, body: any = {}) =>
      auth(request(server).put(path).send(body));

    // BASELINE rows, shared with every other suite. Read them; never mutate
    // or delete them.
    shopeeMethodId = await methodIdByCode(ds, 'SHOPEE');
    cimbMethodId = await methodIdByCode(ds, 'CIMB');
    clearingShopeeAccountId = await accountIdByCode(ds, '1220');
    cashAccountId = await accountIdByCode(ds, '1100');
    const [deposit] = await ds.query(
      `SELECT a.id FROM accounting_settings s
         JOIN chart_of_account a ON a.id = s."customerDepositAccountId"
        WHERE s.id = true`,
    );
    expect(deposit?.id).toBeTruthy();
    depositAccountId = deposit.id;

    const customerRes = await post('/customers', {
      type: 'business',
      name: `Parity Customer ${runId}`,
    }).expect(201);
    customerId = (customerRes.body.data ?? customerRes.body).id;
    ownedEntityIds.push(customerId);
  });

  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        if (ownedRefs.length) {
          await ds.query(
            `DELETE FROM journal_entry_line WHERE "entryId" IN (SELECT id FROM journal_entry WHERE "sourceRef" = ANY($1))`,
            [ownedRefs],
          );
          await ds.query(`DELETE FROM journal_entry WHERE "sourceRef" = ANY($1)`, [
            ownedRefs,
          ]);
        }
        if (ownedSalesOrderIds.length) {
          await ds.query(
            `DELETE FROM sales_order_payments WHERE "salesOrderId" = ANY($1)`,
            [ownedSalesOrderIds],
          );
          await ds.query(
            `DELETE FROM sales_order_items WHERE "salesOrderId" = ANY($1)`,
            [ownedSalesOrderIds],
          );
          await ds.query(`DELETE FROM sales_orders WHERE id = ANY($1)`, [
            ownedSalesOrderIds,
          ]);
        }
        await ds.query(`DELETE FROM products WHERE id = $1`, [productId]);
        await ds.query(`DELETE FROM categories WHERE id = $1`, [categoryId]);
        await ds.query(`DELETE FROM customers WHERE id = $1`, [customerId]);

        await removeSuiteTraces(ds, {
          userIds: [adminUserId],
          entityIds: [...ownedEntityIds, ...ownedSalesOrderIds],
        });
        await removeSuiteAdmin(ds, adminUsername);
      }
    } finally {
      await app.close();
    }
  });

  /**
   * Record a payment against an EXISTING order. Returns the PAYMENT row id.
   * Copied verbatim from provider-settlements.e2e-spec.ts: POST returns 200
   * and the SALES ORDER, so the payment row is read back separately.
   */
  async function payExisting(
    orderId: string, amount: string, methodId = shopeeMethodId, paymentDate = '2026-09-01',
    referenceNumber?: string,
  ): Promise<string> {
    await post(`/sales-orders/${orderId}/payments`, {
      amount, paymentMethodId: methodId, paymentDate,
      ...(referenceNumber ? { referenceNumber } : {}),
    }).expect(200);
    const [row] = await ds.query(
      `SELECT id FROM sales_order_payments
        WHERE "salesOrderId" = $1 AND amount > 0
        ORDER BY "createdAt" DESC, id DESC LIMIT 1`,
      [orderId],
    );
    expect(row?.id).toBeTruthy();
    return row.id;
  }

  async function newOrder(amount: string): Promise<{ orderId: string; orderNumber: string }> {
    const res = await post('/sales-orders', {
      customerId,
      items: [{ productId, quantity: 1, unitPrice: amount }],
    }).expect(201);
    const order = res.body.data ?? res.body;
    ownedSalesOrderIds.push(order.id);
    ownedRefs.push(order.orderNumber);
    ownedEntityIds.push(order.id);
    return { orderId: order.id, orderNumber: order.orderNumber };
  }

  /**
   * POST /sales-orders/:id/refunds takes { refunds: [...] }, returns 201 and an
   * array. Copied verbatim from provider-settlements.e2e-spec.ts.
   */
  async function refundOrder(
    orderId: string, amount: string, methodId = shopeeMethodId, paymentDate = '2026-09-02',
    referenceNumber?: string,
  ): Promise<string> {
    await post(`/sales-orders/${orderId}/refunds`, {
      refunds: [{ amount, paymentMethodId: methodId, paymentDate, ...(referenceNumber ? { referenceNumber } : {}) }],
    }).expect(201);

    const [row] = await ds.query(
      `SELECT id FROM sales_order_payments
        WHERE "salesOrderId" = $1 AND amount < 0
        ORDER BY "createdAt" DESC, id DESC LIMIT 1`,
      [orderId],
    );
    expect(row?.id).toBeTruthy();
    return row.id;
  }

  async function paymentRow(paymentId: string): Promise<FixturePayment> {
    const [row] = await ds.query(
      `SELECT id, "salesOrderId", amount::text AS amount FROM sales_order_payments WHERE id = $1`,
      [paymentId],
    );
    expect(row?.id).toBeTruthy();
    return row;
  }

  async function entryIdFor(paymentId: string, postingType: PostingType): Promise<string> {
    const [entry] = await ds.query(
      `SELECT id FROM journal_entry
        WHERE "sourceEventId" = $1 AND "sourceType" = 'SALES_ORDER'
          AND "postingType" = $2 AND "reversalOfEntryId" IS NULL
        ORDER BY "createdAt" DESC, id DESC LIMIT 1`,
      [paymentId, postingType],
    );
    expect(entry?.id).toBeTruthy();
    return entry.id;
  }

  /** Insert a bare reversal of `entryId` under an owned sourceRef. */
  async function insertReversal(entryId: string, ref: string): Promise<string> {
    const [orig] = await ds.query(
      `SELECT "entryDate", "sourceType", "sourceDocumentId", "sourceEventId", "postingType"
         FROM journal_entry WHERE id = $1`,
      [entryId],
    );
    const [reversal] = await ds.query(
      `INSERT INTO journal_entry
         ("journalNo", "entryDate", "sourceType", "sourceDocumentId", "sourceEventId",
          "sourceRef", "postingType", "description", "reversalOfEntryId", "createdBy")
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'parity reversal', $8, 'system')
       RETURNING id`,
      [nextJournalNo(), orig.entryDate, orig.sourceType, orig.sourceDocumentId, orig.sourceEventId, ref, orig.postingType, entryId],
    );
    return reversal.id;
  }

  /** Clone `entryId` and its lines on `m` (a rolled-back staging transaction). */
  async function insertDuplicate(m: EntityManager, entryId: string, ref: string): Promise<string> {
    const [orig] = await m.query(
      `SELECT "entryDate", "sourceType", "sourceDocumentId", "sourceEventId", "postingType", "description"
         FROM journal_entry WHERE id = $1`,
      [entryId],
    );
    const [dup] = await m.query(
      `INSERT INTO journal_entry
         ("journalNo", "entryDate", "sourceType", "sourceDocumentId", "sourceEventId",
          "sourceRef", "postingType", "description", "createdBy")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'system')
       RETURNING id`,
      [nextJournalNo(), orig.entryDate, orig.sourceType, orig.sourceDocumentId, orig.sourceEventId, ref, orig.postingType, orig.description ?? 'parity duplicate'],
    );
    const lines = await m.query(
      `SELECT "accountId", debit, credit FROM journal_entry_line WHERE "entryId" = $1`,
      [entryId],
    );
    for (const l of lines) {
      await m.query(
        `INSERT INTO journal_entry_line ("entryId", "accountId", debit, credit) VALUES ($1, $2, $3, $4)`,
        [dup.id, l.accountId, l.debit, l.credit],
      );
    }
    return dup.id;
  }

  /**
   * TS = derivation (BadRequest => null); SQL = eligibility map lookup (absent => null).
   * Both read inside ONE transaction that is always rolled back, after `stage`.
   */
  async function both(
    p: FixturePayment,
    stage?: (m: EntityManager) => Promise<void>,
  ): Promise<{ ts: string | null; sql: string | null }> {
    const qr = ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const m = qr.manager;
      if (stage) await stage(m);
      let ts: string | null = null;
      try { ts = await derivation.deriveClearingAccountId([p], m); }
      catch (e) { if (!(e instanceof BadRequestException)) throw e; }
      const sql = (await eligibility.derivedClearingAccounts([p.id], m)).get(p.id) ?? null;
      return { ts, sql };
    } finally {
      await qr.rollbackTransaction();
      await qr.release();
    }
  }

  const fixtures: Fixture[] = [
    ['valid Shopee payment', async () => {
      const { orderId } = await newOrder('50.00');
      const paymentId = await payExisting(orderId, '50.00', shopeeMethodId);
      return paymentRow(paymentId);
    }, '1220'],

    ['valid Shopee refund', async () => {
      const { orderId } = await newOrder('50.00');
      await payExisting(orderId, '50.00', shopeeMethodId);
      const refundId = await refundOrder(orderId, '20.00', shopeeMethodId);
      return paymentRow(refundId);
    }, '1220'],

    ['missing entry', async () => {
      const { orderId } = await newOrder('50.00');
      const paymentId = await payExisting(orderId, '50.00', shopeeMethodId);
      const entryId = await entryIdFor(paymentId, PostingType.SALES_PAYMENT);
      await ds.query(`DELETE FROM journal_entry_line WHERE "entryId" = $1`, [entryId]);
      await ds.query(`DELETE FROM journal_entry WHERE id = $1`, [entryId]);
      return paymentRow(paymentId);
    }, null],

    ['reversed entry', async () => {
      const { orderId } = await newOrder('50.00');
      const paymentId = await payExisting(orderId, '50.00', shopeeMethodId);
      const entryId = await entryIdFor(paymentId, PostingType.SALES_PAYMENT);
      await insertReversal(entryId, trackRef(`PARITY-REV-${runId}-${++journalSeq}`));
      return paymentRow(paymentId);
    }, null],

    ['duplicate active entries', async () => {
      // Two active entries on one event key are exactly what
      // UQ_journal_entry_source_event forbids, so they are staged inside the
      // rolled-back transaction: the index is dropped and the duplicate inserted
      // there, and the rollback reinstates both.
      const { orderId } = await newOrder('50.00');
      const paymentId = await payExisting(orderId, '50.00', shopeeMethodId);
      const entryId = await entryIdFor(paymentId, PostingType.SALES_PAYMENT);
      return {
        payment: await paymentRow(paymentId),
        stage: async (m: EntityManager) => {
          await m.query(`DROP INDEX "${UNIQUE_EVENT_INDEX}"`);
          await insertDuplicate(m, entryId, `PARITY-DUP-${runId}-${++journalSeq}`);
        },
      };
    }, null],

    ['three-line entry', async () => {
      const { orderId } = await newOrder('50.00');
      const paymentId = await payExisting(orderId, '50.00', shopeeMethodId);
      const entryId = await entryIdFor(paymentId, PostingType.SALES_PAYMENT);
      await ds.query(
        `INSERT INTO journal_entry_line ("entryId", "accountId", debit, credit) VALUES ($1, $2, 0, 0)`,
        [entryId, clearingShopeeAccountId],
      );
      return paymentRow(paymentId);
    }, null],

    ['wrong deposit account', async () => {
      const { orderId } = await newOrder('50.00');
      const paymentId = await payExisting(orderId, '50.00', shopeeMethodId);
      const entryId = await entryIdFor(paymentId, PostingType.SALES_PAYMENT);
      await ds.query(
        `UPDATE journal_entry_line SET "accountId" = $1 WHERE "entryId" = $2 AND "accountId" = $3`,
        [cashAccountId, entryId, depositAccountId],
      );
      return paymentRow(paymentId);
    }, null],

    ['nonzero opposite side', async () => {
      const { orderId } = await newOrder('50.00');
      const paymentId = await payExisting(orderId, '50.00', shopeeMethodId);
      const entryId = await entryIdFor(paymentId, PostingType.SALES_PAYMENT);
      await ds.query(
        `UPDATE journal_entry_line SET credit = 1 WHERE "entryId" = $1 AND "accountId" = $2`,
        [entryId, clearingShopeeAccountId],
      );
      return paymentRow(paymentId);
    }, null],

    ['amount mismatch (deposit)', async () => {
      const { orderId } = await newOrder('50.00');
      const paymentId = await payExisting(orderId, '50.00', shopeeMethodId);
      const entryId = await entryIdFor(paymentId, PostingType.SALES_PAYMENT);
      await ds.query(
        `UPDATE journal_entry_line SET credit = 49 WHERE "entryId" = $1 AND "accountId" = $2`,
        [entryId, depositAccountId],
      );
      return paymentRow(paymentId);
    }, null],

    ['amount mismatch (clearing)', async () => {
      const { orderId } = await newOrder('50.00');
      const paymentId = await payExisting(orderId, '50.00', shopeeMethodId);
      const entryId = await entryIdFor(paymentId, PostingType.SALES_PAYMENT);
      await ds.query(
        `UPDATE journal_entry_line SET debit = 49 WHERE "entryId" = $1 AND "accountId" = $2`,
        [entryId, clearingShopeeAccountId],
      );
      return paymentRow(paymentId);
    }, null],

    ['soft-deleted line', async () => {
      const { orderId } = await newOrder('50.00');
      const paymentId = await payExisting(orderId, '50.00', shopeeMethodId);
      const entryId = await entryIdFor(paymentId, PostingType.SALES_PAYMENT);
      await ds.query(
        `UPDATE journal_entry_line SET "deletedAt" = now() WHERE "entryId" = $1 AND "accountId" = $2`,
        [entryId, clearingShopeeAccountId],
      );
      return paymentRow(paymentId);
    }, null],

    ['soft-deleted entry', async () => {
      const { orderId } = await newOrder('50.00');
      const paymentId = await payExisting(orderId, '50.00', shopeeMethodId);
      const entryId = await entryIdFor(paymentId, PostingType.SALES_PAYMENT);
      await ds.query(`UPDATE journal_entry SET "deletedAt" = now() WHERE id = $1`, [entryId]);
      return paymentRow(paymentId);
    }, null],

    ['soft-deleted reversal entry', async () => {
      const { orderId } = await newOrder('50.00');
      const paymentId = await payExisting(orderId, '50.00', shopeeMethodId);
      const entryId = await entryIdFor(paymentId, PostingType.SALES_PAYMENT);
      const reversalId = await insertReversal(
        entryId,
        trackRef(`PARITY-SDREV-${runId}-${++journalSeq}`),
      );
      await ds.query(`UPDATE journal_entry SET "deletedAt" = now() WHERE id = $1`, [reversalId]);
      return paymentRow(paymentId);
    }, '1220'],

    ['remapped CIMB', async () => {
      const { orderId } = await newOrder('50.00');
      const paymentId = await payExisting(orderId, '50.00', cimbMethodId);
      const [original] = await ds.query(
        `SELECT m."accountId" FROM payment_method_account_mappings m
           JOIN payment_methods pm ON pm.id = m."paymentMethodId"
          WHERE pm.code = 'CIMB'`,
      );
      expect(original?.accountId).toBeTruthy();
      await put('/accounting/settings/payment-method-mappings', {
        mappings: [{ paymentMethodId: cimbMethodId, accountId: clearingShopeeAccountId }],
      }).expect(200);
      pendingRestores.push(async () => {
        // Asserted: CIMB is a baseline row shared with every later suite, so a
        // silently failed restore would leave it posting into 1220.
        await put('/accounting/settings/payment-method-mappings', {
          mappings: [{ paymentMethodId: cimbMethodId, accountId: original.accountId }],
        }).expect(200);
        const [restored] = await ds.query(
          `SELECT "accountId" FROM payment_method_account_mappings WHERE "paymentMethodId" = $1`,
          [cimbMethodId],
        );
        expect(restored?.accountId).toBe(original.accountId);
      });
      return paymentRow(paymentId);
    }, '1200'],
  ];

  it.each(fixtures)('%s: SQL and TS agree', async (_name, build, expected) => {
    try {
      const built = await build();
      const { payment: p, stage } = 'payment' in built ? built : { payment: built, stage: undefined };
      const { ts, sql } = await both(p, stage);
      expect(sql).toBe(ts);
      expect(ts).toBe(expected === null ? null : await accountIdByCode(ds, expected));
    } finally {
      for (const restore of pendingRestores.splice(0)) await restore();
    }
  });

  // The duplicate fixture drops this index inside its rolled-back staging
  // transaction. Declared after the matrix so it runs after it: the index must
  // still exist, or later suites would post without their idempotency guard.
  it('leaves UQ_journal_entry_source_event in place after the matrix', async () => {
    const rows = await ds.query(
      `SELECT indexdef FROM pg_indexes WHERE indexname = $1`, [UNIQUE_EVENT_INDEX],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toContain('UNIQUE');
  });
});
