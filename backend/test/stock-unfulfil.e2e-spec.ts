import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { SalesOrderFulfillmentService } from '../src/modules/sales/services/sales-order-fulfillment.service';
import {
  seedCategory,
  seedDocumentNumberSettings,
  seedPaymentMethod,
  seedProduct,
} from './e2e/helpers/seed';
import { formatMoney, toMinorUnits } from '../src/common/utils/money';
import {
  UNFULFILL_EVIDENCE_INCOMPLETE,
  UNFULFILL_PRE_RECORDING,
} from '../src/modules/inventory/stock-undo-unavailable';
import { SalesOrder, SalesOrderPaymentStatus, SalesOrderStatus } from '../src/database/entities/sales-order.entity';
import { configureTestAppValidation } from './utils/configure-test-app-validation';
import { SESSION_PROTOCOL } from './utils/session-protocol';
import { holdRowLock, waitForBlockedBy } from './utils/auth-session-fixture';
import { resetSuiteBusinessRows } from './utils/shared-e2e-business-fixture';
import {
  E2E_ADMIN_PASSWORD,
  E2E_ADMIN_USERNAMES,
  removeSuiteAdmin,
  seedSuiteAdmin,
} from './utils/shared-e2e-fixture';
import { removeSuiteTraces } from './utils/shared-e2e-traces-fixture';

/**
 * Unfulfil restores exactly what the fulfilment recorded, without deleting
 * anything (#1406). Every check runs before a write; a state the evidence
 * cannot prove is refused, not guessed.
 */
describe('Stock unfulfil — restore recorded provenance (#1406, e2e)', () => {
  const USERNAME = E2E_ADMIN_USERNAMES.stockUnfulfil;
  const run = `${process.pid}-${Date.now().toString(36)}`;
  const REASON = 'Customer changed their mind, return to ready';

  let app: INestApplication;
  let ds: DataSource;
  let token: string;

  let categoryId: string;
  let supplierId: string;
  let customerId: string;
  let paymentMethodId: string;

  const productIds: string[] = [];
  const ownedOrderIds: string[] = [];
  const ownedPoIds: string[] = [];

  const auth = () => ({ Authorization: `Bearer ${token}` });

  async function newProduct(): Promise<string> {
    const product = await seedProduct(ds, categoryId, { stockQuantity: 0, baseCost: 0 });
    productIds.push(product.id);
    return product.id;
  }

  async function receive(productId: string, quantity: number, unitPrice: number) {
    const po = await request(app.getHttpServer())
      .post('/purchasing/orders')
      .set(auth())
      .send({ supplierId, orderDate: '2026-09-01', items: [{ productId, quantity, unitPrice }] })
      .expect(201);
    const id = (po.body.data ?? po.body).id;
    ownedPoIds.push(id);
    await request(app.getHttpServer())
      .post(`/purchasing/orders/${id}/payments`)
      .set(auth())
      .send({
        payments: [
          {
            paymentMethodId,
            amount: formatMoney(toMinorUnits((po.body.data ?? po.body).totalAmount)),
            paymentDate: '2026-09-01',
          },
        ],
      })
      .expect(200);
    await request(app.getHttpServer()).post(`/purchasing/orders/${id}/receive`).set(auth()).expect(200);
  }

  async function newOrder(items: { productId: string; quantity: number; unitPrice: number }[]) {
    const res = await request(app.getHttpServer())
      .post('/sales-orders')
      .set(auth())
      .send({ customerId, items })
      .expect(201);
    const order = res.body.data ?? res.body;
    ownedOrderIds.push(order.id);
    await request(app.getHttpServer())
      .post(`/sales-orders/${order.id}/payments`)
      .set(auth())
      .send({
        paymentMethodId,
        amount: formatMoney(toMinorUnits(order.totalAmount)),
        paymentDate: '2026-09-10',
      })
      .expect(200);
    return order;
  }

  async function fulfil(orderId: string) {
    await request(app.getHttpServer()).post(`/sales-orders/${orderId}/fulfill`).set(auth()).expect(201);
  }

  function unfulfil(orderId: string, reason = REASON) {
    return request(app.getHttpServer())
      .post(`/sales-orders/${orderId}/unfulfill`)
      .set(auth())
      .send({ reason });
  }

  async function stockOf(productId: string): Promise<number> {
    const [row] = await ds.query(`SELECT "stockQuantity" FROM products WHERE id = $1`, [productId]);
    return Number(row.stockQuantity);
  }

  async function batchesOf(productId: string) {
    return ds.query(
      `SELECT id, "receivedQuantity"::text AS received, "remainingQuantity"::text AS remaining
         FROM purchase_cost_history WHERE "productId" = $1 ORDER BY "receivedDate" ASC, id ASC`,
      [productId],
    );
  }

  async function liveFulfilmentOrderIds(orderId: string) {
    const rows = await ds.query(
      `SELECT id FROM stock_occurrences
        WHERE "documentType" = 'sales_order' AND "documentId" = $1 AND kind = 'fulfilment'
          AND NOT EXISTS (
            SELECT 1 FROM stock_occurrences r WHERE r."reversesOccurrenceId" = stock_occurrences.id
          )`,
      [orderId],
    );
    return rows.map((r: { id: string }) => r.id);
  }

  async function occurrencesFor(orderId: string) {
    return ds.query(
      `SELECT id, kind, "reversesOccurrenceId", reason, "postedAmount"::text AS "postedAmount"
         FROM stock_occurrences WHERE "documentType" = 'sales_order' AND "documentId" = $1`,
      [orderId],
    );
  }

  async function journalFor(occurrenceId: string) {
    return ds.query(
      `SELECT e.id, e."postingType", e."reversalOfEntryId",
              COALESCE((SELECT sum(l.debit) FROM journal_entry_line l WHERE l."entryId" = e.id), 0)::text AS debit
         FROM journal_entry e WHERE e."sourceEventId" = $1 ORDER BY e."createdAt" ASC, e.id ASC`,
      [occurrenceId],
    );
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();

    ds = app.get(DataSource);
    await seedSuiteAdmin(ds, USERNAME);
    categoryId = (await seedCategory(ds, `stock-unfulfil-${run}`)).id;
    paymentMethodId = (await seedPaymentMethod(ds)).id;
    await seedDocumentNumberSettings(ds);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .set(...SESSION_PROTOCOL)
      .send({ usernameOrEmail: USERNAME, password: E2E_ADMIN_PASSWORD })
      .expect(200);
    token = login.body?.data?.accessToken ?? login.body?.accessToken;
    expect(token).toBeTruthy();

    const supplier = await request(app.getHttpServer())
      .post('/purchasing/suppliers')
      .set(auth())
      .send({ type: 'local', companyName: `Unfulfil Supplier ${run}` })
      .expect(201);
    supplierId = (supplier.body.data ?? supplier.body).id;

    const customer = await request(app.getHttpServer())
      .post('/customers')
      .set(auth())
      .send({ type: 'business', name: `Unfulfil Customer ${run}` })
      .expect(201);
    customerId = (customer.body.data ?? customer.body).id;
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      const documentIds = [...ownedOrderIds, ...ownedPoIds];
      const or = (ids: string[]) => (ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
      const occurrenceIds: string[] = (
        await ds.query(`SELECT id FROM stock_occurrences WHERE "documentId" = ANY($1)`, [or(documentIds)])
      ).map((r: { id: string }) => r.id);
      await ds.query(
        `DELETE FROM journal_entry WHERE "sourceDocumentId" = ANY($1) OR "sourceEventId" = ANY($2)`,
        [or(documentIds), or(occurrenceIds)],
      );
      const admins: { id: string }[] = await ds.query(`SELECT id FROM users WHERE username = $1`, [USERNAME]);
      await removeSuiteTraces(ds, {
        userIds: admins.map((r) => r.id),
        usernames: [USERNAME],
        entityIds: [categoryId, supplierId, customerId, ...productIds, ...documentIds, ...occurrenceIds].filter(Boolean),
      });
      await resetSuiteBusinessRows(ds, {
        categoryIds: [categoryId],
        customerIds: [customerId],
        supplierIds: [supplierId],
        productIds,
      });
      await ds.query(`DELETE FROM document_number_settings WHERE "documentName" = 'Goods Received'`);
      await removeSuiteAdmin(ds, USERNAME);
    }
    await app.close();
  });

  it('restores exactly what the fulfilment consumed and links one reversal', async () => {
    const product = await newProduct();
    await receive(product, 4, 10);
    await receive(product, 5, 20); // two batches, FIFO: 10 then 20
    // Two lines of the SAME product. Line 2 must continue where line 1 stopped:
    // it exhausts batch 1 (2 left from line 1's 2) and spills into batch 2. If the
    // lines did not share one balance view, line 2 would re-take batch 1.
    const order = await newOrder([
      { productId: product, quantity: 2, unitPrice: 50 },
      { productId: product, quantity: 3, unitPrice: 50 },
    ]);
    await fulfil(order.id);

    const before = await batchesOf(product);
    expect(before.map((b: any) => Number(b.remaining))).toEqual([0, 4]);
    const stockAfterFulfil = await stockOf(product); // 9 - 5
    expect(stockAfterFulfil).toBe(4);

    const [live] = await liveFulfilmentOrderIds(order.id);
    expect(live).toBeTruthy();
    const saleMovements: { id: string; quantity: string; totalValue: string }[] = await ds.query(
      `SELECT id, quantity::text AS quantity, "totalValue"::text AS "totalValue"
         FROM stock_movements WHERE "occurrenceId" = $1 ORDER BY id`,
      [live],
    );
    expect(saleMovements).toHaveLength(2);
    const movementCountBefore = Number(
      (await ds.query(`SELECT count(*)::int AS n FROM stock_movements WHERE "productId" = $1`, [product]))[0].n,
    );
    const consumptionCountBefore = Number(
      (
        await ds.query(
          `SELECT count(*)::int AS n FROM stock_batch_consumptions c
             JOIN stock_movements m ON m.id = c."movementId" WHERE m."productId" = $1`,
          [product],
        )
      )[0].n,
    );

    const res = await unfulfil(order.id).expect(201);
    expect(res.body).toBeDefined();

    // Batches restored exactly; stock back.
    const after = await batchesOf(product);
    expect(after.map((b: any) => Number(b.remaining))).toEqual([4, 5]);
    expect(await stockOf(product)).toBe(9);

    // One reversal occurrence linked to the original.
    const occs = await occurrencesFor(order.id);
    const reversals = occs.filter((o: any) => o.kind === 'fulfilment_reversal');
    expect(reversals).toHaveLength(1);
    expect(reversals[0].reversesOccurrenceId).toBe(live);

    // One SALE_REVERSAL per sale movement, mirroring value and link.
    const reversalMovements: {
      id: string;
      quantity: string;
      totalValue: string;
      reversesMovementId: string;
      occurrenceId: string;
      reason: string;
    }[] = await ds.query(
      `SELECT id, quantity::text AS quantity, "totalValue"::text AS "totalValue",
              "reversesMovementId", "occurrenceId", reason
         FROM stock_movements WHERE "occurrenceId" = $1 AND "reversesMovementId" IS NOT NULL`,
      [reversals[0].id],
    );
    expect(reversalMovements).toHaveLength(2);
    const originalsById = new Map(saleMovements.map((m) => [m.id, m]));
    for (const rm of reversalMovements) {
      const original = originalsById.get(rm.reversesMovementId)!;
      expect(original).toBeTruthy();
      expect(toMinorUnits(rm.totalValue)).toBe(toMinorUnits(original.totalValue));
      expect(toMinorUnits(rm.quantity)).toBe(toMinorUnits(original.quantity.replace('-', '')));
    }

    // Journal reversals equal the originals to the cent.
    const entries = await journalFor(live);
    const revenue = entries.find((e: any) => e.postingType === 'SALES_FULFILLMENT_REVENUE' && !e.reversalOfEntryId);
    const cogs = entries.find((e: any) => e.postingType === 'SALES_FULFILLMENT_COGS' && !e.reversalOfEntryId);
    const revenueReversal = entries.find((e: any) => e.reversalOfEntryId === revenue.id);
    const cogsReversal = entries.find((e: any) => e.reversalOfEntryId === cogs.id);
    expect(revenueReversal).toBeTruthy();
    expect(cogsReversal).toBeTruthy();
    expect(revenueReversal.debit).toBe(revenue.debit);
    expect(cogsReversal.debit).toBe(cogs.debit);

    // Order is READY again; nothing deleted, rows only added.
    const [o] = await ds.query(`SELECT status, "fulfilledAt" FROM sales_orders WHERE id = $1`, [order.id]);
    expect(o.status).toBe(SalesOrderStatus.READY);
    expect(o.fulfilledAt).toBeNull();
    const movementCountAfter = Number(
      (await ds.query(`SELECT count(*)::int AS n FROM stock_movements WHERE "productId" = $1`, [product]))[0].n,
    );
    const consumptionCountAfter = Number(
      (
        await ds.query(
          `SELECT count(*)::int AS n FROM stock_batch_consumptions c
             JOIN stock_movements m ON m.id = c."movementId" WHERE m."productId" = $1`,
          [product],
        )
      )[0].n,
    );
    expect(movementCountAfter).toBe(movementCountBefore + 2);
    expect(consumptionCountAfter).toBe(consumptionCountBefore);
  });

  it('fulfil → unfulfil → fulfil → unfulfil reverses each occurrence once', async () => {
    const product = await newProduct();
    await receive(product, 4, 10);
    const order = await newOrder([{ productId: product, quantity: 2, unitPrice: 50 }]);

    await fulfil(order.id);
    const [live1] = await liveFulfilmentOrderIds(order.id);
    await unfulfil(order.id).expect(201);

    await fulfil(order.id);
    const [live2] = await liveFulfilmentOrderIds(order.id);
    await unfulfil(order.id).expect(201);

    expect(live2).not.toBe(live1);
    const occs = await occurrencesFor(order.id);
    const fulfilments = occs.filter((o: any) => o.kind === 'fulfilment');
    const reversals = occs.filter((o: any) => o.kind === 'fulfilment_reversal');
    expect(fulfilments).toHaveLength(2);
    expect(reversals).toHaveLength(2);
    expect(new Set(reversals.map((r: any) => r.reversesOccurrenceId))).toEqual(new Set([live1, live2]));
    expect(await stockOf(product)).toBe(4);
  });

  it('refuses an order fulfilled before recording, changing nothing', async () => {
    const product = await newProduct();
    await receive(product, 3, 10);
    // Seed a FULFILLED order directly: no occurrence, as a pre-deploy fulfilment.
    const repo = ds.getRepository(SalesOrder);
    const order = await repo.save(
      repo.create({
        orderNumber: `SO-UNF-PRE-${run}`.slice(0, 30),
        orderDate: '2026-01-05' as any,
        customerId,
        status: SalesOrderStatus.FULFILLED,
        paymentStatus: SalesOrderPaymentStatus.PAID,
        subtotal: 300,
        shippingAmount: 0,
        totalAmount: '300.0000',
        paidAmount: '300.0000',
        balanceDue: '0.0000',
        fulfilledAt: new Date('2026-01-06T00:00:00Z'),
      }),
    );
    ownedOrderIds.push(order.id);

    const res = await unfulfil(order.id).expect(409);
    expect(res.body.message).toBe(UNFULFILL_PRE_RECORDING);
    expect(await occurrencesFor(order.id)).toHaveLength(0);
    const [row] = await ds.query(`SELECT status FROM sales_orders WHERE id = $1`, [order.id]);
    expect(row.status).toBe(SalesOrderStatus.FULFILLED);
  });

  it('refuses incomplete provenance', async () => {
    const product = await newProduct();
    await receive(product, 5, 10);
    const order = await newOrder([{ productId: product, quantity: 2, unitPrice: 50 }]);
    await fulfil(order.id);
    const [live] = await liveFulfilmentOrderIds(order.id);

    await ds.query(
      `UPDATE stock_batch_consumptions SET quantity = quantity - 1
         WHERE "movementId" IN (SELECT id FROM stock_movements WHERE "occurrenceId" = $1)`,
      [live],
    );

    const res = await unfulfil(order.id).expect(409);
    expect(res.body.message).toBe(UNFULFILL_EVIDENCE_INCOMPLETE);
  });

  it('refuses movement totals that differ from the posted COGS', async () => {
    const product = await newProduct();
    await receive(product, 5, 10);
    const order = await newOrder([{ productId: product, quantity: 1, unitPrice: 50 }]);
    await fulfil(order.id);
    const [live] = await liveFulfilmentOrderIds(order.id);

    await ds.query(
      `UPDATE stock_movements SET "totalValue" = "totalValue" + 1 WHERE "occurrenceId" = $1`,
      [live],
    );

    const res = await unfulfil(order.id).expect(409);
    expect(res.body.message).toBe(UNFULFILL_EVIDENCE_INCOMPLETE);
  });

  it('refuses when the revenue entry is missing', async () => {
    const product = await newProduct();
    await receive(product, 5, 10);
    const order = await newOrder([{ productId: product, quantity: 1, unitPrice: 50 }]);
    await fulfil(order.id);
    const [live] = await liveFulfilmentOrderIds(order.id);

    await ds.query(
      `UPDATE journal_entry SET "sourceEventId" = gen_random_uuid()
         WHERE "sourceEventId" = $1 AND "postingType" = 'SALES_FULFILLMENT_REVENUE' AND "reversalOfEntryId" IS NULL`,
      [live],
    );

    const res = await unfulfil(order.id).expect(409);
    expect(res.body.message).toBe(UNFULFILL_EVIDENCE_INCOMPLETE);
  });

  it('refuses a batch that belongs to another product', async () => {
    const product = await newProduct();
    const other = await newProduct();
    await receive(product, 5, 10);
    await receive(other, 5, 7);
    const order = await newOrder([{ productId: product, quantity: 1, unitPrice: 50 }]);
    await fulfil(order.id);
    const [live] = await liveFulfilmentOrderIds(order.id);

    const [otherBatch] = await batchesOf(other);
    await ds.query(
      `UPDATE stock_batch_consumptions SET "batchId" = $1
         WHERE "movementId" IN (SELECT id FROM stock_movements WHERE "occurrenceId" = $2)`,
      [otherBatch.id, live],
    );

    const res = await unfulfil(order.id).expect(409);
    expect(res.body.message).toBe(UNFULFILL_EVIDENCE_INCOMPLETE);
  });

  it('refuses a restoration beyond a batch’s received quantity', async () => {
    const product = await newProduct();
    await receive(product, 1, 10);
    const order = await newOrder([{ productId: product, quantity: 1, unitPrice: 50 }]);
    await fulfil(order.id);

    // The batch is empty; pretending it had never held the unit makes the
    // planned restoration exceed what it received.
    await ds.query(`UPDATE purchase_cost_history SET "receivedQuantity" = 0 WHERE "productId" = $1`, [
      product,
    ]);

    const res = await unfulfil(order.id).expect(409);
    expect(res.body.message).toBe(UNFULFILL_EVIDENCE_INCOMPLETE);
  });

  it('refuses a second reversal row for the same occurrence at the database', async () => {
    const product = await newProduct();
    await receive(product, 5, 10);
    const order = await newOrder([{ productId: product, quantity: 1, unitPrice: 50 }]);
    await fulfil(order.id);
    const [live] = await liveFulfilmentOrderIds(order.id);
    await unfulfil(order.id).expect(201);

    await expect(
      ds.query(
        `INSERT INTO stock_occurrences (kind, "documentType", "documentId", "occurredAt", "reversesOccurrenceId", "isLegacy", reason)
         VALUES ('fulfilment_reversal', 'sales_order', $1, now(), $2, false, 'duplicate reversal test')`,
        [order.id, live],
      ),
    ).rejects.toThrow(/23505|UQ_stock_occurrence_reverses/);
  });

  it('lets exactly one of two concurrent unfulfils win', async () => {
    const product = await newProduct();
    await receive(product, 5, 10);
    const order = await newOrder([{ productId: product, quantity: 1, unitPrice: 50 }]);
    await fulfil(order.id);

    const lock = await holdRowLock(ds, `SELECT id FROM sales_orders WHERE id = $1 FOR UPDATE`, [order.id]);
    const service = app.get(SalesOrderFulfillmentService);
    let released = false;
    const release = async () => {
      if (!released) {
        released = true;
        await lock.release();
      }
    };
    try {
      const first = service.unfulfillOrder(order.id, REASON);
      const second = service.unfulfillOrder(order.id, REASON);
      await waitForBlockedBy(ds, lock, 2);
      await release();

      const results = await Promise.allSettled([first, second]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(String(rejected[0].reason?.message ?? rejected[0].reason)).toMatch(/not fulfilled/i);
    } finally {
      // Never leak the held lock into teardown, even if an expectation throws.
      await release();
    }

    const occs = await occurrencesFor(order.id);
    expect(occs.filter((o: any) => o.kind === 'fulfilment_reversal')).toHaveLength(1);
  });

  it('an edit queued behind a fulfilment rejects its stale stock and preserves the fulfilment balance', async () => {
    const productId = await newProduct();
    await receive(productId, 5, 10);
    const order = await newOrder([{ productId, quantity: 1, unitPrice: 50 }]);

    // Queue the real fulfilment first on the product row, then queue an edit
    // carrying the stock value it saw before fulfilment. The lock makes that
    // stale value observable and the edit must not overwrite the sale.
    const lock = await holdRowLock(ds, `SELECT id FROM products WHERE id = $1 FOR UPDATE`, [productId]);
    let released = false;
    const release = async () => {
      if (!released) {
        released = true;
        await lock.release();
      }
    };
    try {
      const fulfilment = app.get(SalesOrderFulfillmentService).fulfillOrder(order.id);
      await waitForBlockedBy(ds, lock, 1);
      const editResponse = request(app.getHttpServer())
        .patch(`/inventory/products/${productId}`)
        .set(auth())
        .send({ stockQuantity: 5 })
        .then((response) => response);
      await waitForBlockedBy(ds, lock, 2);
      await release();

      await fulfilment;
      expect((await editResponse).status).toBe(400);
    } finally {
      await release();
    }

    expect(await stockOf(productId)).toBe(4);
  });

  it('unfulfils a zero-cost batch-backed order with no COGS reversal', async () => {
    const product = await newProduct();
    await ds.query(`UPDATE products SET "stockQuantity" = 5 WHERE id = $1`, [product]);
    await ds.query(
      `INSERT INTO purchase_cost_history
         ("productId", "unitCost", "shippingPerUnit", "landedCost", "receivedQuantity", "remainingQuantity", "receivedDate")
       VALUES ($1, 0, 0, 0, 5, 5, now())`,
      [product],
    );
    const order = await newOrder([{ productId: product, quantity: 1, unitPrice: 50 }]);
    await fulfil(order.id);
    const [live] = await liveFulfilmentOrderIds(order.id);
    const [occ] = await ds.query(`SELECT "postedAmount"::text AS "postedAmount" FROM stock_occurrences WHERE id = $1`, [live]);
    expect(toMinorUnits(occ.postedAmount)).toBe(0n);

    await unfulfil(order.id).expect(201);

    const entries = await journalFor(live);
    expect(entries.find((e: any) => e.postingType === 'SALES_FULFILLMENT_REVENUE' && e.reversalOfEntryId)).toBeTruthy();
    expect(entries.filter((e: any) => e.postingType === 'SALES_FULFILLMENT_COGS')).toHaveLength(0);
    expect(await stockOf(product)).toBe(5);
  });

  it('stores the reason on the reversal occurrence, its movements and the audit row', async () => {
    const product = await newProduct();
    await receive(product, 5, 10);
    const order = await newOrder([{ productId: product, quantity: 1, unitPrice: 50 }]);
    await fulfil(order.id);

    const reason = `Damaged in transit ${run}`;
    await unfulfil(order.id, reason).expect(201);

    const occs = await occurrencesFor(order.id);
    const reversal = occs.find((o: any) => o.kind === 'fulfilment_reversal');
    expect(reversal.reason).toBe(reason);

    const movements = await ds.query(
      `SELECT reason FROM stock_movements WHERE "occurrenceId" = $1 AND "reversesMovementId" IS NOT NULL`,
      [reversal.id],
    );
    expect(movements.length).toBeGreaterThan(0);
    for (const m of movements) {
      expect(m.reason).toBe(`Reversal: ${reason}`);
    }

    const audit = await ds.query(
      `SELECT "newValues" FROM audit_logs WHERE "entityId" = $1 AND action = 'UNFULFILL' ORDER BY "createdAt" DESC LIMIT 1`,
      [order.id],
    );
    expect(audit).toHaveLength(1);
    expect(audit[0].newValues.reason).toBe(reason);
  });

  it('refuses a missing or too-short reason with 400', async () => {
    const product = await newProduct();
    await receive(product, 5, 10);
    const order = await newOrder([{ productId: product, quantity: 1, unitPrice: 50 }]);
    await fulfil(order.id);

    const missing = await request(app.getHttpServer())
      .post(`/sales-orders/${order.id}/unfulfill`)
      .set(auth())
      .send({})
      .expect(400);
    expect(JSON.stringify(missing.body.message)).toContain('A reason of 3 to 500 characters is required');

    const short = await request(app.getHttpServer())
      .post(`/sales-orders/${order.id}/unfulfill`)
      .set(auth())
      .send({ reason: 'ab' })
      .expect(400);
    expect(JSON.stringify(short.body.message)).toContain('A reason of 3 to 500 characters is required');

    const whitespace = await request(app.getHttpServer())
      .post(`/sales-orders/${order.id}/unfulfill`)
      .set(auth())
      .send({ reason: '   ' })
      .expect(400);
    expect(JSON.stringify(whitespace.body.message)).toContain(
      'A reason of 3 to 500 characters is required',
    );

    const overlong = await request(app.getHttpServer())
      .post(`/sales-orders/${order.id}/unfulfill`)
      .set(auth())
      .send({ reason: 'x'.repeat(501) })
      .expect(400);
    expect(JSON.stringify(overlong.body.message)).toContain(
      'A reason of 3 to 500 characters is required',
    );

    // Nothing changed by the refused attempts.
    expect(await liveFulfilmentOrderIds(order.id)).toHaveLength(1);
  });
});
