import { SESSION_PROTOCOL } from './utils/session-protocol';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
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
import { cents, methodIdByCode } from './utils/payment-method-matrix-fixture';

// Issue #1401 (project 3, task 5). Unpay VOIDS each live vendor payment —
// keeping the row, recording who/when voided it and linking the reversal of
// its own journal entry — and paying again always creates a NEW row. Every
// assertion reads the database, not the API response, except where the
// response shape itself is the contract (404/409/400 discrimination).
const runId = randomUUID().slice(0, 8);

// Backstop names for the audit-failure test (test 8). Dropped in `finally`
// there; afterAll drops them again with IF EXISTS in case the worker died
// mid-test and left them on this shared database.
const failTrigger = `vpvoid_fail_audit_${runId}`;
const failFunction = `vpvoid_fail_audit_fn_${runId}`;

describe('Unpay voids vendor payments; pay-again creates new rows (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  let adminUserId = '';
  let adminUsername = '';
  let token = '';
  let post: (path: string, body?: any) => request.Test;
  let get: (path: string) => request.Test;

  const ownedEntityIds: string[] = [];
  const ownedPurchaseOrderIds: string[] = [];
  let supplierId = '';
  let analyticsSupplierId = '';
  let productId = '';
  let categoryId = '';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();
    ds = moduleFixture.get(DataSource);

    const category = await seedCategory(ds, `vpvoid-e2e-${runId}`);
    categoryId = category.id;
    const product = await seedProduct(ds, categoryId, {
      stockQuantity: 0,
      baseCost: 10,
    });
    productId = product.id;
    ownedEntityIds.push(productId, categoryId);

    adminUsername = `e2espec_vpvoid_admin_${runId}`;
    const admin = await seedSuiteAdmin(ds, adminUsername);
    adminUserId = admin.id;

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .set(...SESSION_PROTOCOL)
      .send({ usernameOrEmail: adminUsername, password: E2E_ADMIN_PASSWORD });
    token = loginRes.body?.data?.accessToken ?? loginRes.body?.accessToken;
    expect(token).toBeTruthy();

    const server = app.getHttpServer();
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    post = (path: string, body: any = {}) =>
      auth(request(server).post(path).send(body));
    get = (path: string) => auth(request(server).get(path));

    const supplierRes = await post('/purchasing/suppliers', {
      type: 'local',
      companyName: `Void Supplier ${runId}`,
    }).expect(201);
    const supplier = supplierRes.body.data ?? supplierRes.body;
    supplierId = supplier.id;
    ownedEntityIds.push(supplierId);
  });

  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        // Idempotent backstop for a worker killed inside test 8.
        await ds.query(`DROP TRIGGER IF EXISTS ${failTrigger} ON audit_logs`);
        await ds.query(`DROP FUNCTION IF EXISTS ${failFunction}()`);

        if (ownedPurchaseOrderIds.length) {
          // vendor_payments FIRST: voidReversalEntryId -> journal_entry is
          // ON DELETE RESTRICT, so a payment row pins its reversal entry.
          await ds.query(
            `DELETE FROM vendor_payments WHERE "purchaseOrderId" = ANY($1)`,
            [ownedPurchaseOrderIds],
          );
          await ds.query(
            `DELETE FROM journal_entry_line WHERE "entryId" IN (
               SELECT id FROM journal_entry WHERE "sourceDocumentId" = ANY($1)
             )`,
            [ownedPurchaseOrderIds],
          );
          await ds.query(
            `DELETE FROM journal_entry WHERE "sourceDocumentId" = ANY($1)`,
            [ownedPurchaseOrderIds],
          );
          await ds.query(
            `DELETE FROM purchase_order_items WHERE "purchaseOrderId" = ANY($1)`,
            [ownedPurchaseOrderIds],
          );
          await ds.query(`DELETE FROM purchase_orders WHERE id = ANY($1)`, [
            ownedPurchaseOrderIds,
          ]);
        }
        if (productId) {
          await ds.query(`DELETE FROM stock_movements WHERE "productId" = $1`, [
            productId,
          ]);
          await ds.query(`DELETE FROM products WHERE id = $1`, [productId]);
        }
        if (categoryId) {
          await ds.query(`DELETE FROM categories WHERE id = $1`, [categoryId]);
        }
        if (supplierId) {
          await ds.query(`DELETE FROM suppliers WHERE id = $1`, [supplierId]);
        }
        if (analyticsSupplierId) {
          await ds.query(`DELETE FROM suppliers WHERE id = $1`, [analyticsSupplierId]);
        }

        // Own-traces before removing the user (issue #1204).
        if (adminUserId || adminUsername) {
          await removeSuiteTraces(ds, {
            userIds: adminUserId ? [adminUserId] : [],
            usernames: adminUsername ? [adminUsername] : [],
            entityIds: ownedEntityIds,
          });
        }
        if (adminUsername) await removeSuiteAdmin(ds, adminUsername);
      }
    } finally {
      if (ds?.isInitialized) await ds.destroy();
      if (app) await app.close();
    }
  });

  async function createOrder(
    total: string,
    orderDate = '2026-09-17',
    forSupplierId = supplierId,
  ): Promise<{
    id: string;
    orderNumber: string;
  }> {
    const res = await post('/purchasing/orders', {
      supplierId: forSupplierId,
      orderDate,
      items: [{ productId, quantity: 1, unitPrice: Number(total) }],
    }).expect(201);
    const order = res.body.data ?? res.body;
    ownedPurchaseOrderIds.push(order.id);
    ownedEntityIds.push(order.id);
    return { id: order.id, orderNumber: order.orderNumber };
  }

  async function pay(
    orderId: string,
    amount: string,
    extra: { reference?: string } = {},
  ): Promise<void> {
    const methodId = await methodIdByCode(ds, 'CASH');
    await post(`/purchasing/orders/${orderId}/payments`, {
      payments: [
        {
          amount,
          paymentMethodId: methodId,
          paymentDate: '2026-09-17',
          ...extra,
        },
      ],
    }).expect(200);
  }

  async function livePaymentIds(orderId: string): Promise<string[]> {
    const res = await get(`/purchasing/orders/${orderId}/payments`).expect(200);
    const rows = res.body.data ?? res.body;
    for (const row of rows) {
      if (!ownedEntityIds.includes(row.id)) ownedEntityIds.push(row.id);
    }
    return rows.map((r: any) => r.id);
  }

  function paymentRow(id: string): Promise<any> {
    return ds
      .query(
        `SELECT id, amount, status, "isActive", "deletedAt", "voidedAt",
                "voidedByUserId", "voidReversalEntryId", "paymentMethodId",
                "paymentDate"::text AS "paymentDate", "referenceNumber", notes
           FROM vendor_payments WHERE id = $1`,
        [id],
      )
      .then((rows: any[]) => rows[0]);
  }

  async function paymentsForOrder(orderId: string): Promise<any[]> {
    return ds.query(
      `SELECT id, amount, status, "isActive", "deletedAt", "voidedAt",
              "voidedByUserId", "voidReversalEntryId"
         FROM vendor_payments WHERE "purchaseOrderId" = $1
         ORDER BY "createdAt", id`,
      [orderId],
    );
  }

  function poRow(orderId: string): Promise<any> {
    return ds
      .query(
        `SELECT status, "paymentStatus", "paidAmount" FROM purchase_orders WHERE id = $1`,
        [orderId],
      )
      .then((rows: any[]) => rows[0]);
  }

  async function entriesForDocument(orderId: string): Promise<any[]> {
    return ds.query(
      `SELECT id, "journalNo", "postingType", "sourceType", "sourceEventId",
              "reversalOfEntryId"
         FROM journal_entry WHERE "sourceDocumentId" = $1
         ORDER BY id`,
      [orderId],
    );
  }

  async function originalsFor(paymentId: string): Promise<any[]> {
    return ds.query(
      `SELECT id, "postingType", "sourceDocumentId" FROM journal_entry
        WHERE "sourceEventId" = $1 AND "reversalOfEntryId" IS NULL
        ORDER BY id`,
      [paymentId],
    );
  }

  async function reversalFor(entryId: string): Promise<any> {
    return (
      await ds.query(
        `SELECT id, "postingType", "reversalOfEntryId" FROM journal_entry
          WHERE "reversalOfEntryId" = $1`,
        [entryId],
      )
    )[0];
  }

  it('unpay keeps the payment row and records who and when voided it', async () => {
    const order = await createOrder('100.00');
    await pay(order.id, '100.00', { reference: 'VP-REF-1' });
    const [paymentId] = await livePaymentIds(order.id);
    // The API cannot set notes; write one directly so "keeps the row" also
    // covers a column the void update must NOT touch (column-scoped update).
    await ds.query(`UPDATE vendor_payments SET notes = 'memo-1' WHERE id = $1`, [
      paymentId,
    ]);

    const before = await paymentRow(paymentId);
    const [original] = await originalsFor(paymentId);
    expect(original.postingType).toBe('PURCHASE_PAYMENT');
    expect(original.sourceDocumentId).toBe(order.id);
    expect(before.status).toBe('completed');
    expect(before.isActive).toBe(true);
    expect(before.deletedAt).toBeNull();
    expect(before.voidedAt).toBeNull();

    const unpayRes = await post(`/purchasing/orders/${order.id}/unpay`).expect(200);
    expect(unpayRes.body.data.paymentStatus).toBe('UNPAID');
    expect(unpayRes.body.data.status).toBe('DRAFT');
    expect(cents(unpayRes.body.data.paidAmount)).toBe(0);

    const after = await paymentRow(paymentId);
    expect(after.status).toBe('voided');
    expect(after.isActive).toBe(false);
    expect(after.deletedAt).toBeNull();
    expect(after.voidedAt).not.toBeNull();
    expect(after.voidedByUserId).toBe(adminUserId);
    expect(after.voidReversalEntryId).not.toBeNull();
    // The row keeps every detail it had while live.
    expect(after.amount).toBe(before.amount);
    expect(after.paymentMethodId).toBe(before.paymentMethodId);
    expect(after.paymentDate).toBe(before.paymentDate);
    expect(after.referenceNumber).toBe('VP-REF-1');
    expect(after.notes).toBe('memo-1');

    const reversal = await reversalFor(original.id);
    expect(reversal.reversalOfEntryId).toBe(original.id);
    expect(reversal.postingType).toBe('PURCHASE_PAYMENT');
    expect(after.voidReversalEntryId).toBe(reversal.id);

    // The unpay response and the payments listing show no live row any more.
    expect(await livePaymentIds(order.id)).toHaveLength(0);
    const po = await poRow(order.id);
    expect(cents(po.paidAmount)).toBe(0);
    expect(po.paymentStatus).toBe('UNPAID');

    const audits = await ds.query(
      `SELECT action, "entityType", "oldValues", "newValues", metadata, "userId"
         FROM audit_logs WHERE action = 'VOID' AND "entityId" = $1`,
      [paymentId],
    );
    expect(audits).toHaveLength(1);
    expect(audits[0].entityType).toBe('VendorPayment');
    expect(audits[0].userId).toBe(adminUserId);
    expect(audits[0].oldValues.status).toBe('completed');
    expect(audits[0].newValues.status).toBe('voided');
    expect(audits[0].newValues.voidReversalEntryId).toBe(reversal.id);
    expect(audits[0].metadata.purchaseOrderId).toBe(order.id);

    // Nothing was left for the legacy sweep to reverse, so no sweep row.
    const sweep = await ds.query(
      `SELECT count(*)::int AS count FROM audit_logs
        WHERE action = 'UNPAY_SWEEP' AND "entityId" = $1`,
      [order.id],
    );
    expect(sweep[0].count).toBe(0);
  });

  it('pay-again after unpay creates a new row and posts it', async () => {
    const order = await createOrder('100.00');
    await pay(order.id, '30.00', { reference: 'FIRST-1' });
    const [aId] = await livePaymentIds(order.id);

    await post(`/purchasing/orders/${order.id}/unpay`).expect(200);
    const aAfterUnpay = await paymentRow(aId);
    expect(aAfterUnpay.status).toBe('voided');

    // A different amount AND a different reference: if anything restored the
    // voided row instead of inserting, the amount would come back as 30.00.
    await pay(order.id, '45.50', { reference: 'SECOND-1' });
    const live = await livePaymentIds(order.id);
    expect(live).toHaveLength(1);
    const bId = live[0];
    expect(bId).not.toBe(aId);

    const bRow = await paymentRow(bId);
    expect(bRow.amount).toBe('45.5000');
    expect(bRow.referenceNumber).toBe('SECOND-1');
    expect(bRow.status).toBe('completed');
    expect(bRow.deletedAt).toBeNull();
    expect(bRow.voidedAt).toBeNull();

    // The voided row is not restorable: re-paying did not touch it.
    const aNow = await paymentRow(aId);
    expect(aNow.status).toBe('voided');
    expect(aNow.amount).toBe('30.0000');
    expect(aNow.referenceNumber).toBe('FIRST-1');
    expect(aNow.voidedAt).toEqual(aAfterUnpay.voidedAt);
    expect(aNow.voidReversalEntryId).toBe(aAfterUnpay.voidReversalEntryId);
    expect(aNow.deletedAt).toBeNull();

    // The new row has its own posting, not a reused one.
    const [originalB] = await originalsFor(bId);
    expect(originalB.postingType).toBe('PURCHASE_PAYMENT');
    expect(originalB.sourceDocumentId).toBe(order.id);
    expect(await reversalFor(originalB.id)).toBeUndefined();

    const po = await poRow(order.id);
    expect(cents(po.paidAmount)).toBe(4550);
    expect(po.paymentStatus).toBe('PARTIAL');
  });

  it('unpay voids refund rows with their own reversals', async () => {
    const order = await createOrder('100.00');
    await pay(order.id, '100.00');
    const [aId] = await livePaymentIds(order.id);

    const methodId = await methodIdByCode(ds, 'CASH');
    await post(`/purchasing/orders/${order.id}/refunds`, {
      refunds: [
        { paymentMethodId: methodId, amount: '25.00', reference: 'RF-1' },
      ],
    }).expect(200);
    const liveBefore = await livePaymentIds(order.id);
    expect(liveBefore).toHaveLength(2);
    const cId = liveBefore.find((id) => id !== aId)!;

    await post(`/purchasing/orders/${order.id}/unpay`).expect(200);

    for (const paymentId of [aId, cId]) {
      const row = await paymentRow(paymentId);
      expect(row.status).toBe('voided');
      expect(row.voidedByUserId).toBe(adminUserId);
      const [original] = await originalsFor(paymentId);
      const reversal = await reversalFor(original.id);
      expect(reversal.reversalOfEntryId).toBe(original.id);
      expect(row.voidReversalEntryId).toBe(reversal.id);
    }

    const [cOriginal] = await originalsFor(cId);
    const cRow = await paymentRow(cId);
    const cReversal = await reversalFor(cOriginal.id);
    expect(cOriginal.postingType).toBe('PURCHASE_REFUND');
    expect(cReversal.postingType).toBe('PURCHASE_REFUND');
    expect(cRow.voidReversalEntryId).toBe(cReversal.id);

    expect(await livePaymentIds(order.id)).toHaveLength(0);
    const po = await poRow(order.id);
    expect(cents(po.paidAmount)).toBe(0);
    expect(po.paymentStatus).toBe('UNPAID');
  });

  it('a second unpay is 404 and reverses nothing', async () => {
    const order = await createOrder('100.00');
    await pay(order.id, '100.00');
    const [paymentId] = await livePaymentIds(order.id);
    await post(`/purchasing/orders/${order.id}/unpay`).expect(200);

    const paymentSnapshot = JSON.stringify(await paymentRow(paymentId));
    const entriesSnapshot = await entriesForDocument(order.id);
    const [original] = await originalsFor(paymentId);

    await post(`/purchasing/orders/${order.id}/unpay`).expect(404);

    expect(JSON.stringify(await paymentRow(paymentId))).toBe(paymentSnapshot);
    expect(await entriesForDocument(order.id)).toEqual(entriesSnapshot);
    expect(await reversalFor(original.id)).toBeDefined();
    const reversals = await ds.query(
      `SELECT count(*)::int AS count FROM journal_entry WHERE "reversalOfEntryId" = $1`,
      [original.id],
    );
    expect(reversals[0].count).toBe(1);
  });

  it('an original of the wrong posting type rejects the unpay (409) and changes nothing', async () => {
    const order = await createOrder('100.00');
    await pay(order.id, '100.00');
    const [paymentId] = await livePaymentIds(order.id);
    const [original] = await originalsFor(paymentId);

    // A second ORIGINAL for the same event with the other posting type: the
    // event is ambiguous, so the void must refuse rather than guess.
    await ds.query(
      `INSERT INTO journal_entry
         ("journalNo", "createdBy", "entryDate", "sourceType", "sourceDocumentId",
          "sourceEventId", "sourceRef", "postingType", description)
       VALUES ($1, 'e2e', '2026-09-17'::date,
               'PURCHASE_ORDER'::"public"."journal_entry_sourcetype_enum",
               $2, $3, $4,
               'PURCHASE_REFUND'::"public"."journal_entry_postingtype_enum",
               'ambiguous original for #1401 e2e')`,
      [`AMB-${runId}`, order.id, paymentId, order.orderNumber],
    );

    const paymentSnapshot = JSON.stringify(await paymentRow(paymentId));
    const entriesSnapshot = await entriesForDocument(order.id);

    const res = await post(`/purchasing/orders/${order.id}/unpay`);
    expect(res.status).toBe(409);
    expect(res.body.message.reason).toBe('unexpected_posting_type');
    expect(res.body.message.sourceEventId).toBe(paymentId);

    expect(JSON.stringify(await paymentRow(paymentId))).toBe(paymentSnapshot);
    expect(await entriesForDocument(order.id)).toEqual(entriesSnapshot);
    expect(await reversalFor(original.id)).toBeUndefined();
  });

  it('two concurrent unpays void once and the loser is 404', async () => {
    const order = await createOrder('100.00');
    await pay(order.id, '100.00');
    const [paymentId] = await livePaymentIds(order.id);
    const [original] = await originalsFor(paymentId);

    const results = await Promise.all([
      post(`/purchasing/orders/${order.id}/unpay`),
      post(`/purchasing/orders/${order.id}/unpay`),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 404]);

    const row = await paymentRow(paymentId);
    expect(row.status).toBe('voided');
    expect(row.voidedAt).not.toBeNull();

    const reversals = await ds.query(
      `SELECT count(*)::int AS count FROM journal_entry WHERE "reversalOfEntryId" = $1`,
      [original.id],
    );
    expect(reversals[0].count).toBe(1);

    const po = await poRow(order.id);
    expect(cents(po.paidAmount)).toBe(0);
  });

  it('a concurrent pay and unpay leave a consistent order', async () => {
    const order = await createOrder('100.00');
    await pay(order.id, '30.00');
    const [aId] = await livePaymentIds(order.id);

    const results = await Promise.all([
      post(`/purchasing/orders/${order.id}/payments`, {
        payments: [
          {
            amount: '30.00',
            paymentMethodId: await methodIdByCode(ds, 'CASH'),
            paymentDate: '2026-09-17',
          },
        ],
      }),
      post(`/purchasing/orders/${order.id}/unpay`),
    ]);
    // Both orderings are legal: pay wins the lock and both rows are voided, or
    // unpay wins and the new payment lands after the void.
    expect(results.map((r) => r.status)).toEqual([200, 200]);

    const rows = await paymentsForOrder(order.id);
    for (const row of rows) {
      if (!ownedEntityIds.includes(row.id)) ownedEntityIds.push(row.id);
    }
    const live = rows.filter((r) => r.status !== 'voided');
    const voided = rows.filter((r) => r.status === 'voided');

    // A is voided no matter which request won the lock.
    expect(voided.map((r) => r.id)).toContain(aId);

    const po = await poRow(order.id);
    expect(cents(po.paidAmount)).toBe(
      live.reduce((sum, r) => sum + cents(r.amount), 0),
    );

    // Every voided row links the reversal of its own original, and that
    // original is never reversed twice.
    for (const row of voided) {
      expect(row.voidedAt).not.toBeNull();
      expect(row.voidReversalEntryId).not.toBeNull();
      const [original] = await originalsFor(row.id);
      const reversal = await reversalFor(original.id);
      expect(reversal.reversalOfEntryId).toBe(original.id);
      expect(row.voidReversalEntryId).toBe(reversal.id);
      const count = await ds.query(
        `SELECT count(*)::int AS count FROM journal_entry WHERE "reversalOfEntryId" = $1`,
        [original.id],
      );
      expect(count[0].count).toBe(1);
    }

    // Every live row has exactly one unreversed original entry.
    for (const row of live) {
      const unreversed = await ds.query(
        `SELECT id FROM journal_entry e
          WHERE e."sourceEventId" = $1 AND e."reversalOfEntryId" IS NULL
            AND NOT EXISTS (SELECT 1 FROM journal_entry r WHERE r."reversalOfEntryId" = e.id)`,
        [row.id],
      );
      expect(unreversed).toHaveLength(1);
    }

    // No original anywhere in this order was reversed twice.
    const doubled = await ds.query(
      `SELECT "reversalOfEntryId", count(*)::int AS count
         FROM journal_entry
        WHERE "sourceDocumentId" = $1 AND "reversalOfEntryId" IS NOT NULL
        GROUP BY "reversalOfEntryId" HAVING count(*) > 1`,
      [order.id],
    );
    expect(doubled).toHaveLength(0);
  });

  it('a failed VOID audit write rolls the whole unpay back', async () => {
    const order = await createOrder('100.00');
    await pay(order.id, '100.00');
    const [paymentId] = await livePaymentIds(order.id);
    const [original] = await originalsFor(paymentId);

    const paymentSnapshot = JSON.stringify(await paymentRow(paymentId));
    const entriesSnapshot = await entriesForDocument(order.id);
    const poSnapshot = await poRow(order.id);

    // Why DB_999 and not merely 400: this codebase's global
    // HttpExceptionFilter maps every QueryFailedError to 400 with
    // error: 'Database Error'. A CHECK-constraint failure (DB_004) is also a
    // 400 — that is exactly what a regression back to soft-delete returns —
    // so the discriminator MUST be the unknown-error code DB_999, which only
    // the injected RAISE produces. Asserting a bare 400 would let the
    // regression masquerade as a passing test.
    await ds.query(`
      CREATE OR REPLACE FUNCTION ${failFunction}() RETURNS trigger AS $$
      BEGIN
        IF NEW.action = 'VOID' AND NEW."entityId" = '${paymentId}' THEN
          RAISE EXCEPTION 'injected audit failure';
        END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql;
    `);
    await ds.query(`
      CREATE TRIGGER ${failTrigger} BEFORE INSERT ON audit_logs
        FOR EACH ROW EXECUTE FUNCTION ${failFunction}();
    `);
    try {
      const res = await post(`/purchasing/orders/${order.id}/unpay`);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Database Error');
      expect(res.body.code).toBe('DB_999');
    } finally {
      await ds.query(`DROP TRIGGER IF EXISTS ${failTrigger} ON audit_logs`);
      await ds.query(`DROP FUNCTION IF EXISTS ${failFunction}()`);
    }

    // The audit failure must have rolled back the void, the reversal the
    // unpay posted before the audit write, and every order field.
    expect(JSON.stringify(await paymentRow(paymentId))).toBe(paymentSnapshot);
    expect(await entriesForDocument(order.id)).toEqual(entriesSnapshot);
    expect(await poRow(order.id)).toEqual(poSnapshot);
    expect(await reversalFor(original.id)).toBeUndefined();

    const traces = await ds.query(
      `SELECT count(*)::int AS count FROM audit_logs
        WHERE action IN ('VOID', 'UNPAY_SWEEP')
          AND "entityId" = ANY($1)`,
      [[paymentId, order.id]],
    );
    expect(traces[0].count).toBe(0);
  });

  it('analytics ignore voided payments', async () => {
    // A dedicated supplier keeps the dashboard hermetic: recentOrders carries
    // no date window, so sharing a supplier with the other tests would leak
    // their orders into the assertions.
    const analyticsSupplierRes = await post('/purchasing/suppliers', {
      type: 'local',
      companyName: `Void Analytics Supplier ${runId}`,
    }).expect(201);
    const analyticsSupplier =
      analyticsSupplierRes.body.data ?? analyticsSupplierRes.body;
    analyticsSupplierId = analyticsSupplier.id;
    ownedEntityIds.push(analyticsSupplierId);

    const order = await createOrder('100.00', '2024-03-03', analyticsSupplierId);
    await pay(order.id, '100.00', { reference: 'ANA-A' });
    const [aId] = await livePaymentIds(order.id);
    await post(`/purchasing/orders/${order.id}/unpay`).expect(200);
    expect((await paymentRow(aId)).status).toBe('voided');
    await pay(order.id, '30.00', { reference: 'ANA-B' });
    const [bId] = await livePaymentIds(order.id);

    const base =
      `/purchasing/analytics/dashboard?supplierId=${analyticsSupplierId}` +
      `&startDate=2024-03-01&endDate=2024-03-31`;

    // Live payments sum to B (30 of 100) -> "partial". Counting the voided A
    // as well would sum to 130 -> "overpaid", so each filter discriminates.
    const partialRes = await get(`${base}&paymentStatus=partial`).expect(200);
    const partial = partialRes.body.data ?? partialRes.body;
    expect(partial.current.periodData).toEqual([
      { period: '2024-03', spent: 100, orders: 1 },
    ]);
    expect(partial.recentOrders.map((o: any) => o.orderNumber)).toEqual([
      order.orderNumber,
    ]);

    const overpaidRes = await get(`${base}&paymentStatus=overpaid`).expect(200);
    const overpaid = overpaidRes.body.data ?? overpaidRes.body;
    expect(overpaid.current.periodData).toEqual([]);
    expect(overpaid.recentOrders).toEqual([]);

    // The order itself reports B, not the voided A.
    const po = await poRow(order.id);
    expect(cents(po.paidAmount)).toBe(3000);
    expect(po.paymentStatus).toBe('PARTIAL');
    expect(bId).not.toBe(aId);
  });

  it("the order's vendorPayments list only live rows", async () => {
    const order = await createOrder('100.00');
    await pay(order.id, '100.00', { reference: 'LIST-A' });
    const [aId] = await livePaymentIds(order.id);
    await post(`/purchasing/orders/${order.id}/unpay`).expect(200);
    await pay(order.id, '45.50', { reference: 'LIST-B' });
    const [bId] = await livePaymentIds(order.id);

    const byIdRes = await get(`/purchasing/orders/${order.id}`).expect(200);
    const byId = byIdRes.body.data ?? byIdRes.body;
    expect(byId.vendorPayments.map((p: any) => p.id)).toEqual([bId]);
    expect(byId.vendorPayments[0].status).toBe('completed');
    expect(cents(byId.paidAmount)).toBe(4550);
    expect(byId.paymentStatus).toBe('PARTIAL');

    const byNumberRes = await get(
      `/purchasing/orders/by-number/${order.orderNumber}`,
    ).expect(200);
    const byNumber = byNumberRes.body.data ?? byNumberRes.body;
    expect(byNumber.id).toBe(order.id);
    expect(byNumber.vendorPayments.map((p: any) => p.id)).toEqual([bId]);
    expect(byNumber.vendorPayments[0].status).toBe('completed');

    // The voided row still exists; only the list hides it.
    expect((await paymentRow(aId)).status).toBe('voided');
  });

  it('supplier payment history keeps voided rows', async () => {
    const order = await createOrder('100.00');
    await pay(order.id, '100.00', { reference: 'HIST-A' });
    const [aId] = await livePaymentIds(order.id);
    await post(`/purchasing/orders/${order.id}/unpay`).expect(200);
    await pay(order.id, '45.50', { reference: 'HIST-B' });
    const [bId] = await livePaymentIds(order.id);

    const res = await get(
      `/purchasing/suppliers/${supplierId}/payments?page=1&limit=100`,
    ).expect(200);
    const rows = res.body.data ?? res.body;
    const a = rows.find((r: any) => r.id === aId);
    const b = rows.find((r: any) => r.id === bId);

    // History: the voided row stays visible with its void state...
    expect(a).toBeDefined();
    expect(a.status).toBe('voided');
    expect(a.voidedAt).not.toBeNull();
    // ...and the live row is normal.
    expect(b).toBeDefined();
    expect(b.status).toBe('completed');
    expect(b.voidedAt).toBeNull();
  });
});
