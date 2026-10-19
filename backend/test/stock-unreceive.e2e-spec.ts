import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PurchaseOrderLifecycleService } from '../src/modules/purchasing/services/purchase-order-lifecycle.service';
import { SalesOrderFulfillmentService } from '../src/modules/sales/services/sales-order-fulfillment.service';
import {
  seedCategory,
  seedDocumentNumberSettings,
  seedPaymentMethod,
  seedProduct,
} from './e2e/helpers/seed';
import { formatMoney, toMinorUnits } from '../src/common/utils/money';
import {
  RECEIPT_LATER_DECREASE,
  RECEIPT_BATCH_TOUCHED,
} from '../src/modules/inventory/stock-undo-unavailable';
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
 * Non-destructive unreceive (#1406): returning a received purchase order to
 * Ready reverses exactly what the receipt recorded — the occurrence, its
 * movements, its batches and its journal entry — without deleting anything. A
 * state the evidence cannot prove is refused, not guessed.
 */
describe('Stock unreceive — reverse an evidenced receipt (#1406, e2e)', () => {
  const USERNAME = E2E_ADMIN_USERNAMES.stockUnreceive;
  const run = `${process.pid}-${Date.now().toString(36)}`;
  const REASON = 'Goods returned to the supplier';
  const HORIZON = '2026-01-01T00:00:00Z';

  let app: INestApplication;
  let ds: DataSource;
  let token: string;
  let categoryId: string;
  let supplierId: string;
  let customerId: string;
  let paymentMethodId: string;

  const productIds: string[] = [];
  const ownedPoIds: string[] = [];
  const ownedOrderIds: string[] = [];
  const zero = '00000000-0000-0000-0000-000000000000';

  const auth = () => ({ Authorization: `Bearer ${token}` });

  async function newProduct(): Promise<{ id: string; name: string }> {
    const product = await seedProduct(ds, categoryId, {
      stockQuantity: 0,
      baseCost: 10,
      name: `Unreceive Product ${run}-${productIds.length + 1}`,
    });
    productIds.push(product.id);
    return { id: product.id, name: product.name };
  }

  async function createPo(productId: string, quantity: number, unitPrice: number): Promise<string> {
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
    return id;
  }

  async function createPoWithLines(
    lines: Array<{ productId: string; quantity: number; unitPrice: number }>,
    shippingAmount = 0,
  ): Promise<string> {
    const po = await request(app.getHttpServer())
      .post('/purchasing/orders')
      .set(auth())
      .send({ supplierId, orderDate: '2026-09-01', shippingAmount, items: lines })
      .expect(201);
    const order = po.body.data ?? po.body;
    ownedPoIds.push(order.id);
    await request(app.getHttpServer())
      .post(`/purchasing/orders/${order.id}/payments`)
      .set(auth())
      .send({
        payments: [
          {
            paymentMethodId,
            amount: formatMoney(toMinorUnits(order.totalAmount)),
            paymentDate: '2026-09-01',
          },
        ],
      })
      .expect(200);
    return order.id;
  }

  async function createSalesOrder(productId: string, quantity: number, unitPrice: number): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/sales-orders')
      .set(auth())
      .send({ customerId, items: [{ productId, quantity, unitPrice }] })
      .expect(201);
    const order = response.body.data ?? response.body;
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
    return order.id;
  }

  function receive(poId: string) {
    return request(app.getHttpServer()).post(`/purchasing/orders/${poId}/receive`).set(auth());
  }

  function unreceive(poId: string, reason = REASON) {
    return request(app.getHttpServer())
      .post(`/purchasing/orders/${poId}/return`)
      .set(auth())
      .send(reason === undefined ? {} : { reason });
  }

  async function snapshot(poId: string, productId: string) {
    const [po] = await ds.query(
      `SELECT status, "receivedDate"::text AS "receivedDate" FROM purchase_orders WHERE id = $1`,
      [poId],
    );
    const [p] = await ds.query(`SELECT "stockQuantity"::text AS "stockQuantity" FROM products WHERE id = $1`, [
      productId,
    ]);
    const [m] = await ds.query(
      `SELECT count(*)::int AS n FROM stock_movements WHERE "referenceType" = 'purchase_order' AND "referenceId" = $1`,
      [poId],
    );
    const [b] = await ds.query(
      `SELECT count(*)::int AS n, COALESCE(sum("remainingQuantity"),0)::text AS remaining
         FROM purchase_cost_history WHERE "purchaseOrderId" = $1`,
      [poId],
    );
    const journals: { id: string }[] = await ds.query(
      `SELECT id FROM journal_entry WHERE "sourceDocumentId" = $1 ORDER BY id`,
      [poId],
    );
    const occurrences: { id: string }[] = await ds.query(
      `SELECT id FROM stock_occurrences WHERE "documentId" = $1 ORDER BY id`,
      [poId],
    );
    return {
      status: po.status,
      receivedDate: po.receivedDate,
      stock: p.stockQuantity,
      movements: m.n,
      batches: b.n,
      batchRemaining: b.remaining,
      journals: journals.map((j) => j.id),
      occurrences: occurrences.map((o) => o.id),
    };
  }

  async function makeLegacy(poId: string, receivedDate: string): Promise<void> {
    await ds.query(
      `UPDATE stock_movements SET "occurrenceId" = NULL, "productSequence" = NULL, "purchaseOrderItemId" = NULL
        WHERE "referenceType" = 'purchase_order' AND "referenceId" = $1`,
      [poId],
    );
    await ds.query(
      `UPDATE purchase_cost_history SET "occurrenceId" = NULL, "purchaseOrderItemId" = NULL WHERE "purchaseOrderId" = $1`,
      [poId],
    );
    await ds.query(
      `UPDATE journal_entry SET "sourceEventId" = NULL
        WHERE "sourceEventId" IN (SELECT id FROM stock_occurrences WHERE "documentId" = $1)`,
      [poId],
    );
    await ds.query(`DELETE FROM stock_occurrences WHERE "documentId" = $1`, [poId]);
    await ds.query(`UPDATE purchase_orders SET "receivedDate" = $2 WHERE id = $1`, [poId, receivedDate]);
  }

  beforeAll(async () => {
    // The unreceive route reads the horizon at module init. This suite approves
    // one so the legacy-success path is exercised; it is deleted immediately
    // after init so it cannot leak into another suite sharing the worker.
    const previousHorizon = process.env.STOCK_EVIDENCE_HORIZON;
    process.env.STOCK_EVIDENCE_HORIZON = HORIZON;
    try {
      const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = moduleFixture.createNestApplication();
      configureTestAppValidation(app);
      await app.init();
    } finally {
      if (previousHorizon === undefined) delete process.env.STOCK_EVIDENCE_HORIZON;
      else process.env.STOCK_EVIDENCE_HORIZON = previousHorizon;
    }

    ds = app.get(DataSource);
    await seedSuiteAdmin(ds, USERNAME);
    categoryId = (await seedCategory(ds, `stock-unreceive-${run}`)).id;
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
      .send({ type: 'local', companyName: `Unreceive Supplier ${run}` })
      .expect(201);
    supplierId = (supplier.body.data ?? supplier.body).id;

    const customer = await request(app.getHttpServer())
      .post('/customers')
      .set(auth())
      .send({ type: 'business', name: `Unreceive Customer ${run}` })
      .expect(201);
    customerId = (customer.body.data ?? customer.body).id;
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      const documentIds = [...ownedPoIds, ...ownedOrderIds];
      const or = (ids: string[]) => (ids.length ? ids : [zero]);
      const occurrenceIds: string[] = (
        await ds.query(`SELECT id FROM stock_occurrences WHERE "documentId" = ANY($1)`, [or(documentIds)])
      ).map((r: { id: string }) => r.id);
      await ds.query(
        `UPDATE vendor_payments SET "voidReversalEntryId" = NULL WHERE "voidReversalEntryId" IN (
           SELECT id FROM journal_entry WHERE "sourceDocumentId" = ANY($1) OR "sourceEventId" = ANY($2)
         )`,
        [or(documentIds), or(occurrenceIds)],
      );
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

  it('unreceive reverses one occurrence exactly', async () => {
    const product = await newProduct();
    const poId = await createPo(product.id, 5, 10);
    await receive(poId).expect(200);

    const [receiptOcc] = await ds.query(
      `SELECT id FROM stock_occurrences WHERE "documentId" = $1 AND kind = 'receipt'`,
      [poId],
    );
    const receiptMovements: { id: string; totalValue: string }[] = await ds.query(
      `SELECT id, "totalValue"::text AS "totalValue" FROM stock_movements WHERE "occurrenceId" = $1`,
      [receiptOcc.id],
    );
    expect(receiptMovements).toHaveLength(1);

    await unreceive(poId).expect(200);

    // A linked reversal occurrence, never deleting the receipt one.
    const occs = await ds.query(
      `SELECT id, kind, "reversesOccurrenceId" FROM stock_occurrences WHERE "documentId" = $1 ORDER BY "createdAt"`,
      [poId],
    );
    expect(occs).toHaveLength(2);
    const reversal = occs.find((o: any) => o.kind === 'receipt_reversal');
    expect(reversal.reversesOccurrenceId).toBe(receiptOcc.id);

    // One reversal movement, negative, linked, same value.
    const revMovements: { quantity: string; reversesMovementId: string; totalValue: string }[] =
      await ds.query(
        `SELECT quantity::text AS quantity, "reversesMovementId", "totalValue"::text AS "totalValue"
           FROM stock_movements WHERE "occurrenceId" = $1`,
        [reversal.id],
      );
    expect(revMovements).toHaveLength(1);
    expect(Number(revMovements[0].quantity)).toBe(-5);
    expect(revMovements[0].reversesMovementId).toBe(receiptMovements[0].id);
    expect(revMovements[0].totalValue).toBe(receiptMovements[0].totalValue);

    // Batch kept, zeroed and marked.
    const batches: { remaining: string; reversedAt: string | null; reversedByOccurrenceId: string }[] =
      await ds.query(
        `SELECT "remainingQuantity"::text AS remaining, "reversedAt", "reversedByOccurrenceId"
           FROM purchase_cost_history WHERE "purchaseOrderId" = $1`,
        [poId],
      );
    expect(batches).toHaveLength(1);
    expect(Number(batches[0].remaining)).toBe(0);
    expect(batches[0].reversedAt).not.toBeNull();
    expect(batches[0].reversedByOccurrenceId).toBe(reversal.id);

    // The journal reversal equals the original; the original is kept.
    const entries: {
      id: string;
      postingType: string;
      sourceEventId: string | null;
      reversalOfEntryId: string | null;
      debit: string;
    }[] =
      await ds.query(
      `SELECT e.id, e."postingType", e."sourceEventId", e."reversalOfEntryId",
                COALESCE((SELECT sum(l.debit) FROM journal_entry_line l WHERE l."entryId" = e.id),0)::text AS debit
           FROM journal_entry e WHERE e."sourceDocumentId" = $1 AND e."postingType" = 'PURCHASE_RECEIVE' ORDER BY e."createdAt"`,
        [poId],
      );
    expect(entries).toHaveLength(2);
    const originals = entries.filter((e) => e.reversalOfEntryId === null);
    const reversals = entries.filter((e) => e.reversalOfEntryId !== null);
    expect(originals).toHaveLength(1);
    expect(reversals).toHaveLength(1);
    const [original] = originals;
    const [reversing] = reversals;
    expect(original.sourceEventId).toBe(receiptOcc.id);
    expect(reversing.reversalOfEntryId).toBe(original.id);
    expect(toMinorUnits(reversing.debit)).toBe(toMinorUnits(original.debit));

    // PO back to READY, receivedDate cleared, item received reset, reference base cost retained.
    const [po] = await ds.query(
      `SELECT status, "receivedDate" FROM purchase_orders WHERE id = $1`,
      [poId],
    );
    expect(po.status).toBe('READY');
    expect(po.receivedDate).toBeNull();
    const [item] = await ds.query(
      `SELECT "receivedQuantity"::text AS q FROM purchase_order_items WHERE "purchaseOrderId" = $1`,
      [poId],
    );
    expect(Number(item.q)).toBe(0);
    expect(await stockOf(product.id)).toBe(0);
    // No batches remain, so the FIFO strategy falls back to the product's existing
    // base cost; the retained reference cost does not imply stock value remains.
    const [p] = await ds.query(`SELECT "baseCost"::text AS c FROM products WHERE id = $1`, [product.id]);
    expect(Number(p.c)).toBe(10);
    const [b] = await ds.query(
      `SELECT COALESCE(sum("remainingQuantity"),0)::text AS r FROM purchase_cost_history WHERE "purchaseOrderId" = $1`,
      [poId],
    );
    expect(Number(b.r)).toBe(0);

    // Then the payment can be refunded.
    await request(app.getHttpServer())
      .post(`/purchasing/orders/${poId}/unpay`)
      .set(auth())
      .expect(200);
  });

  it('receive → unreceive → receive → unreceive reverses each occurrence once', async () => {
    const product = await newProduct();
    const poId = await createPo(product.id, 3, 10);

    await receive(poId).expect(200);
    await unreceive(poId).expect(200);
    await receive(poId).expect(200);
    await unreceive(poId).expect(200);

    const occs = await ds.query(
      `SELECT id, kind, "reversesOccurrenceId" FROM stock_occurrences WHERE "documentId" = $1 ORDER BY "createdAt"`,
      [poId],
    );
    const receipts = occs.filter((o: any) => o.kind === 'receipt');
    const reversals = occs.filter((o: any) => o.kind === 'receipt_reversal');
    expect(receipts).toHaveLength(2);
    expect(reversals).toHaveLength(2);
    expect(reversals.map((r: any) => r.reversesOccurrenceId).sort()).toEqual(
      receipts.map((r: any) => r.id).sort(),
    );
    expect(await stockOf(product.id)).toBe(0);
  });

  it('receive → return → receive → return preserves repeated-product line identity per occurrence', async () => {
    const product = await newProduct();
    const poId = await createPoWithLines([
      { productId: product.id, quantity: 2, unitPrice: 10 },
      { productId: product.id, quantity: 3, unitPrice: 15 },
    ]);
    const cycleMovementIds: string[][] = [];
    const stableItemIds: string[] = [];
    const receiptIds: string[] = [];
    const reversalByReceiptId = new Map<string, string>();

    for (let cycle = 0; cycle < 2; cycle += 1) {
      await receive(poId).expect(200);
      const [receipt] = await ds.query(
        `SELECT id FROM stock_occurrences WHERE "documentId" = $1 AND kind = 'receipt' ORDER BY "createdAt" DESC LIMIT 1`,
        [poId],
      );
      const receiptLines: { itemId: string; movementId: string; batchId: string }[] = await ds.query(
        `SELECT i.id AS "itemId", m.id AS "movementId", b.id AS "batchId"
           FROM purchase_order_items i
           JOIN stock_movements m ON m."purchaseOrderItemId" = i.id AND m."occurrenceId" = $2
           JOIN purchase_cost_history b ON b."purchaseOrderItemId" = i.id AND b."occurrenceId" = $2
          WHERE i."purchaseOrderId" = $1 ORDER BY i."lineNumber"`,
        [poId, receipt.id],
      );
      expect(receiptLines).toHaveLength(2);
      receiptIds.push(receipt.id);
      if (cycle === 0) stableItemIds.push(...receiptLines.map((line) => line.itemId));
      expect(receiptLines.map((line) => line.itemId)).toEqual(stableItemIds);
      cycleMovementIds.push(receiptLines.map((line) => line.movementId));

      await unreceive(poId).expect(200);
      const [reversal] = await ds.query(
        `SELECT id FROM stock_occurrences WHERE "documentId" = $1 AND kind = 'receipt_reversal'
          ORDER BY "createdAt" DESC LIMIT 1`,
        [poId],
      );
      reversalByReceiptId.set(receipt.id, reversal.id);
      const reversed: { purchaseOrderItemId: string; reversesMovementId: string }[] = await ds.query(
        `SELECT "purchaseOrderItemId", "reversesMovementId" FROM stock_movements
          WHERE "occurrenceId" = $1 ORDER BY "purchaseOrderItemId"`,
        [reversal.id],
      );
      expect(reversed.map((line) => [line.purchaseOrderItemId, line.reversesMovementId])).toEqual(
        receiptLines
          .map((line) => [line.itemId, line.movementId])
          .sort(([left], [right]) => left.localeCompare(right)),
      );
      const reversedBatches: { purchaseOrderItemId: string; reversedByOccurrenceId: string }[] =
        await ds.query(
          `SELECT "purchaseOrderItemId", "reversedByOccurrenceId" FROM purchase_cost_history
            WHERE "occurrenceId" = $1 ORDER BY "purchaseOrderItemId"`,
          [receipt.id],
        );
      expect(
        reversedBatches
          .map((batch) => [batch.purchaseOrderItemId, batch.reversedByOccurrenceId])
          .sort(([left], [right]) => left.localeCompare(right)),
      ).toEqual(
        stableItemIds
          .map((itemId) => [itemId, reversal.id])
          .sort(([left], [right]) => left.localeCompare(right)),
      );
    }

    expect(cycleMovementIds[0]).not.toEqual(cycleMovementIds[1]);
    const batchHistory: {
      occurrenceId: string;
      reversedByOccurrenceId: string;
    }[] = await ds.query(
      `SELECT "occurrenceId", "reversedByOccurrenceId" FROM purchase_cost_history
        WHERE "purchaseOrderId" = $1 AND "occurrenceId" = ANY($2)
        ORDER BY "occurrenceId", "purchaseOrderItemId"`,
      [poId, receiptIds],
    );
    expect(batchHistory).toHaveLength(4);
    for (const batch of batchHistory) {
      expect(batch.reversedByOccurrenceId).toBe(reversalByReceiptId.get(batch.occurrenceId));
    }
    expect(await stockOf(product.id)).toBe(0);
    const [totals] = await ds.query(
      `SELECT sum(l.debit)::text AS debit, sum(l.credit)::text AS credit
         FROM journal_entry e JOIN journal_entry_line l ON l."entryId" = e.id
        WHERE e."sourceDocumentId" = $1 AND e."postingType" = 'PURCHASE_RECEIVE'`,
      [poId],
    );
    expect(toMinorUnits(totals.debit)).toBe(toMinorUnits(totals.credit));
  });

  it('reversal movement values exactly mirror receipt cent allocations with shared shipping', async () => {
    const product = await newProduct();
    const poId = await createPoWithLines(
      [
        { productId: product.id, quantity: 1, unitPrice: 10 },
        { productId: product.id, quantity: 1, unitPrice: 10 },
        { productId: product.id, quantity: 1, unitPrice: 10 },
      ],
      10,
    );
    await receive(poId).expect(200);

    const [receipt] = await ds.query(
      `SELECT id FROM stock_occurrences WHERE "documentId" = $1 AND kind = 'receipt'`,
      [poId],
    );
    await unreceive(poId).expect(200);
    const [reversal] = await ds.query(
      `SELECT id FROM stock_occurrences WHERE "documentId" = $1 AND kind = 'receipt_reversal'`,
      [poId],
    );
    const movementValues: { originalValue: string; reversalValue: string }[] = await ds.query(
      `SELECT original."totalValue"::text AS "originalValue",
              reversal."totalValue"::text AS "reversalValue"
         FROM stock_movements reversal
         JOIN stock_movements original ON original.id = reversal."reversesMovementId"
        WHERE reversal."occurrenceId" = $1 AND original."occurrenceId" = $2
        ORDER BY original."purchaseOrderItemId"`,
      [reversal.id, receipt.id],
    );

    expect(movementValues).toHaveLength(3);
    expect(new Set(movementValues.map((line) => line.originalValue))).toEqual(
      new Set(['13.3300', '13.3400']),
    );
    expect(movementValues.map((line) => line.reversalValue)).toEqual(
      movementValues.map((line) => line.originalValue),
    );
  });

  it('returns equal repeated-product receipt lines with one reversal per movement', async () => {
    const product = await newProduct();
    const poId = await createPoWithLines([
      { productId: product.id, quantity: 2, unitPrice: 10 },
      { productId: product.id, quantity: 2, unitPrice: 10 },
    ]);
    await receive(poId).expect(200);

    const [receipt] = await ds.query(
      `SELECT id FROM stock_occurrences WHERE "documentId" = $1 AND kind = 'receipt'`,
      [poId],
    );
    const originalMovements: { id: string }[] = await ds.query(
      `SELECT id FROM stock_movements WHERE "occurrenceId" = $1 ORDER BY id`,
      [receipt.id],
    );
    expect(originalMovements).toHaveLength(2);
    expect(new Set(originalMovements.map((row) => row.id)).size).toBe(2);

    const receiptLines: {
      itemId: string;
      movementId: string;
      batchId: string;
      itemQuantity: string;
      movementQuantity: string;
      batchQuantity: string;
      movementUnitValue: string;
      batchUnitCost: string;
    }[] = await ds.query(
      `SELECT i.id AS "itemId", m.id AS "movementId", b.id AS "batchId",
              i.quantity::text AS "itemQuantity", m.quantity::text AS "movementQuantity",
              b."receivedQuantity"::text AS "batchQuantity",
              m."unitValue"::text AS "movementUnitValue", b."unitCost"::text AS "batchUnitCost"
         FROM purchase_order_items i
         JOIN stock_movements m ON m."purchaseOrderItemId" = i.id AND m."occurrenceId" = $2
         JOIN purchase_cost_history b ON b."purchaseOrderItemId" = i.id AND b."occurrenceId" = $2
        WHERE i."purchaseOrderId" = $1 ORDER BY i."lineNumber"`,
      [poId, receipt.id],
    );
    expect(receiptLines).toHaveLength(2);
    expect(new Set(receiptLines.map((line) => line.itemId)).size).toBe(2);
    expect(new Set(receiptLines.map((line) => line.movementId)).size).toBe(2);
    expect(new Set(receiptLines.map((line) => line.batchId)).size).toBe(2);
    for (const line of receiptLines) {
      expect(Number(line.itemQuantity)).toBe(2);
      expect(Number(line.movementQuantity)).toBe(2);
      expect(Number(line.batchQuantity)).toBe(2);
      expect(line.movementUnitValue).toBe(line.batchUnitCost);
    }

    await unreceive(poId).expect(200);

    const [reversal] = await ds.query(
      `SELECT id FROM stock_occurrences WHERE "documentId" = $1 AND kind = 'receipt_reversal'`,
      [poId],
    );
    const reversalMovements: { purchaseOrderItemId: string; reversesMovementId: string }[] = await ds.query(
      `SELECT "purchaseOrderItemId", "reversesMovementId"
         FROM stock_movements WHERE "occurrenceId" = $1 ORDER BY "purchaseOrderItemId"`,
      [reversal.id],
    );
    expect(reversalMovements).toHaveLength(2);
    expect(reversalMovements.map((row) => row.reversesMovementId).sort()).toEqual(
      originalMovements.map((row) => row.id).sort(),
    );
    expect(reversalMovements.map((row) => row.purchaseOrderItemId).sort()).toEqual(
      receiptLines.map((line) => line.itemId).sort(),
    );
    const reversedBatches: { purchaseOrderItemId: string; remainingQuantity: string; reversedByOccurrenceId: string }[] =
      await ds.query(
        `SELECT "purchaseOrderItemId", "remainingQuantity"::text AS "remainingQuantity", "reversedByOccurrenceId"
           FROM purchase_cost_history WHERE "purchaseOrderId" = $1 ORDER BY "purchaseOrderItemId"`,
        [poId],
      );
    expect(reversedBatches).toHaveLength(2);
    expect(reversedBatches.map((row) => row.purchaseOrderItemId).sort()).toEqual(
      receiptLines.map((line) => line.itemId).sort(),
    );
    expect(reversedBatches.every((row) => Number(row.remainingQuantity) === 0)).toBe(true);
    expect(reversedBatches.every((row) => row.reversedByOccurrenceId === reversal.id)).toBe(true);

    const journalLines: {
      postingType: string;
      reversalOfEntryId: string | null;
      accountId: string;
      debit: string;
      credit: string;
    }[] = await ds.query(
      `SELECT e."postingType", e."reversalOfEntryId", l."accountId",
              sum(l.debit)::text AS debit, sum(l.credit)::text AS credit
         FROM journal_entry e JOIN journal_entry_line l ON l."entryId" = e.id
        WHERE e."sourceDocumentId" = $1 AND e."postingType" = 'PURCHASE_RECEIVE'
        GROUP BY e.id, e."postingType", e."reversalOfEntryId", l."accountId" ORDER BY e.id, l."accountId"`,
      [poId],
    );
    const originalJournalLines = journalLines.filter((line) => line.reversalOfEntryId === null);
    const reversedJournalLines = journalLines.filter((line) => line.reversalOfEntryId !== null);
    expect(originalJournalLines.length).toBeGreaterThan(0);
    expect(reversedJournalLines).toHaveLength(originalJournalLines.length);
    for (const original of originalJournalLines) {
      const reversalLine = reversedJournalLines.find((line) => line.accountId === original.accountId);
      expect(reversalLine).toBeDefined();
      expect(Number(reversalLine!.debit)).toBe(Number(original.credit));
      expect(Number(reversalLine!.credit)).toBe(Number(original.debit));
    }
    expect(await stockOf(product.id)).toBe(0);
  });

  it('returns different-quantity and different-cost repeated-product lines to their own batches', async () => {
    const product = await newProduct();
    const poId = await createPoWithLines([
      { productId: product.id, quantity: 2, unitPrice: 10 },
      { productId: product.id, quantity: 5, unitPrice: 15 },
    ]);
    await receive(poId).expect(200);

    const [receipt] = await ds.query(
      `SELECT id FROM stock_occurrences WHERE "documentId" = $1 AND kind = 'receipt'`,
      [poId],
    );
    const originalLines: {
      itemId: string;
      movementId: string;
      quantity: string;
      unitValue: string;
      batchId: string;
      batchQuantity: string;
      unitCost: string;
    }[] = await ds.query(
      `SELECT i.id AS "itemId", m.id AS "movementId", m.quantity::text AS quantity,
              m."unitValue"::text AS "unitValue", b.id AS "batchId",
              b."receivedQuantity"::text AS "batchQuantity", b."unitCost"::text AS "unitCost"
         FROM purchase_order_items i
         JOIN stock_movements m ON m."purchaseOrderItemId" = i.id AND m."occurrenceId" = $2
         JOIN purchase_cost_history b ON b."purchaseOrderItemId" = i.id AND b."occurrenceId" = $2
        WHERE i."purchaseOrderId" = $1 ORDER BY i."lineNumber"`,
      [poId, receipt.id],
    );
    expect(originalLines.map((line) => Number(line.quantity))).toEqual([2, 5]);
    expect(originalLines.map((line) => Number(line.batchQuantity))).toEqual([2, 5]);
    expect(originalLines.map((line) => Number(line.unitValue))).toEqual([10, 15]);
    expect(originalLines.map((line) => Number(line.unitCost))).toEqual([10, 15]);

    await unreceive(poId).expect(200);
    const [reversal] = await ds.query(
      `SELECT id FROM stock_occurrences WHERE "documentId" = $1 AND kind = 'receipt_reversal'`,
      [poId],
    );
    const reversals: { purchaseOrderItemId: string; reversesMovementId: string; quantity: string }[] =
      await ds.query(
        `SELECT "purchaseOrderItemId", "reversesMovementId", quantity::text AS quantity
           FROM stock_movements WHERE "occurrenceId" = $1 ORDER BY "purchaseOrderItemId"`,
        [reversal.id],
      );
    const originalsByMovement = new Map(
      originalLines.map((line) => [line.movementId, line]),
    );
    for (const reversalLine of reversals) {
      const original = originalsByMovement.get(reversalLine.reversesMovementId);
      expect(original).toBeDefined();
      expect(reversalLine.purchaseOrderItemId).toBe(original!.itemId);
      expect(Number(reversalLine.quantity)).toBe(-Number(original!.quantity));
    }
    const [entryTotals] = await ds.query(
      `SELECT count(*)::int AS entries,
              sum(l.debit)::text AS debits, sum(l.credit)::text AS credits
         FROM journal_entry e JOIN journal_entry_line l ON l."entryId" = e.id
        WHERE e."sourceDocumentId" = $1 AND e."postingType" = 'PURCHASE_RECEIVE'`,
      [poId],
    );
    expect(entryTotals.entries).toBeGreaterThanOrEqual(2);
    expect(toMinorUnits(entryTotals.debits)).toBe(toMinorUnits(entryTotals.credits));
    expect(await stockOf(product.id)).toBe(0);
  });

  it('keeps retained PO item IDs when editing line values after unreceive', async () => {
    const product = await newProduct();
    const poId = await createPoWithLines([
      { productId: product.id, quantity: 2, unitPrice: 10 },
      { productId: product.id, quantity: 3, unitPrice: 15 },
    ]);
    await receive(poId).expect(200);
    await unreceive(poId).expect(200);

    const originalItems: { id: string; lineNumber: number }[] = await ds.query(
      `SELECT id, "lineNumber" FROM purchase_order_items WHERE "purchaseOrderId" = $1 ORDER BY "lineNumber"`,
      [poId],
    );
    const update = await request(app.getHttpServer())
      .put(`/purchasing/orders/${poId}`)
      .set(auth())
      .send({
        items: [
          {
            id: originalItems[0].id,
            productId: product.id,
            quantity: 4,
            unitPrice: 11,
            discountType: 'percentage',
            discountPercent: 0,
            discountAmount: 0,
          },
          {
            id: originalItems[1].id,
            productId: product.id,
            quantity: 3,
            unitPrice: 16,
            discountType: 'percentage',
            discountPercent: 0,
            discountAmount: 0,
          },
        ],
      })
      .expect(200);

    expect(update.body.data ?? update.body).toBeTruthy();
    const updatedItems: { id: string; lineNumber: number; quantity: string; unitCost: string }[] =
      await ds.query(
        `SELECT id, "lineNumber", quantity::text AS quantity, "unitCost"::text AS "unitCost"
           FROM purchase_order_items WHERE "purchaseOrderId" = $1 ORDER BY "lineNumber"`,
        [poId],
      );
    expect(updatedItems.map((item) => item.id)).toEqual(originalItems.map((item) => item.id));
    expect(updatedItems.map((item) => Number(item.quantity))).toEqual([4, 3]);
    expect(updatedItems.map((item) => Number(item.unitCost))).toEqual([11, 16]);
  });

  it('rejects removing or reassigning a referenced PO item without partial writes', async () => {
    const product = await newProduct();
    const otherProduct = await newProduct();
    const poId = await createPoWithLines([
      { productId: product.id, quantity: 2, unitPrice: 10 },
      { productId: product.id, quantity: 3, unitPrice: 15 },
    ]);
    await receive(poId).expect(200);
    await unreceive(poId).expect(200);
    const before = await snapshot(poId, product.id);
    const originalItems: { id: string; productId: string }[] = await ds.query(
      `SELECT id, "productId" FROM purchase_order_items WHERE "purchaseOrderId" = $1 ORDER BY "lineNumber"`,
      [poId],
    );

    await request(app.getHttpServer())
      .put(`/purchasing/orders/${poId}`)
      .set(auth())
      .send({
        items: [{
          id: originalItems[0].id,
          productId: product.id,
          quantity: 2,
          unitPrice: 10,
          discountType: 'percentage',
          discountPercent: 0,
          discountAmount: 0,
        }],
      })
      .expect(409);
    expect(await snapshot(poId, product.id)).toEqual(before);

    await request(app.getHttpServer())
      .put(`/purchasing/orders/${poId}`)
      .set(auth())
      .send({
        items: originalItems.map((item, index) => ({
          id: item.id,
          productId: index === 0 ? otherProduct.id : product.id,
          quantity: index === 0 ? 2 : 3,
          unitPrice: index === 0 ? 10 : 15,
          discountType: 'percentage',
          discountPercent: 0,
          discountAmount: 0,
        })),
      })
      .expect(409);
    expect(await snapshot(poId, product.id)).toEqual(before);
    const afterItems: { id: string; productId: string }[] = await ds.query(
      `SELECT id, "productId" FROM purchase_order_items WHERE "purchaseOrderId" = $1 ORDER BY "lineNumber"`,
      [poId],
    );
    expect(afterItems).toEqual(originalItems);
  });

  it('rejects removing or reassigning a referenced PO item without partial writes', async () => {
    const product = await newProduct();
    const otherProduct = await newProduct();
    const poId = await createPoWithLines([
      { productId: product.id, quantity: 2, unitPrice: 10 },
      { productId: product.id, quantity: 3, unitPrice: 15 },
    ]);
    await receive(poId).expect(200);
    await unreceive(poId).expect(200);
    const before = await snapshot(poId, product.id);
    const originalItems: { id: string; productId: string }[] = await ds.query(
      `SELECT id, "productId" FROM purchase_order_items WHERE "purchaseOrderId" = $1 ORDER BY "lineNumber"`,
      [poId],
    );

    await request(app.getHttpServer())
      .put(`/purchasing/orders/${poId}`)
      .set(auth())
      .send({
        items: [{
          id: originalItems[0].id,
          productId: product.id,
          quantity: 2,
          unitPrice: 10,
          discountType: 'percentage',
          discountPercent: 0,
          discountAmount: 0,
        }],
      })
      .expect(409);
    expect(await snapshot(poId, product.id)).toEqual(before);

    await request(app.getHttpServer())
      .put(`/purchasing/orders/${poId}`)
      .set(auth())
      .send({
        items: originalItems.map((item, index) => ({
          id: item.id,
          productId: index === 0 ? otherProduct.id : product.id,
          quantity: index === 0 ? 2 : 3,
          unitPrice: index === 0 ? 10 : 15,
          discountType: 'percentage',
          discountPercent: 0,
          discountAmount: 0,
        })),
      })
      .expect(409);
    expect(await snapshot(poId, product.id)).toEqual(before);
    const afterItems: { id: string; productId: string }[] = await ds.query(
      `SELECT id, "productId" FROM purchase_order_items WHERE "purchaseOrderId" = $1 ORDER BY "lineNumber"`,
      [poId],
    );
    expect(afterItems).toEqual(originalItems);
  });

  it('reverses a legacy receipt after the approved horizon and records it', async () => {
    const product = await newProduct();
    const poId = await createPo(product.id, 4, 10);
    await receive(poId).expect(200);
    await makeLegacy(poId, '2026-09-01');

    await unreceive(poId).expect(200);

    const [reversal] = await ds.query(
      `SELECT kind, "isLegacy", "legacyJournalEntryId", "reversesOccurrenceId"
         FROM stock_occurrences WHERE "documentId" = $1 AND kind = 'receipt_reversal'`,
      [poId],
    );
    expect(reversal).toBeTruthy();
    expect(reversal.isLegacy).toBe(true);
    expect(reversal.legacyJournalEntryId).toBeTruthy();
    expect(reversal.reversesOccurrenceId).toBeNull();
    expect(await stockOf(product.id)).toBe(0);
  });

  it('refuses an ambiguous repeated-product legacy receipt without partial writes', async () => {
    const product = await newProduct();
    const poId = await createPoWithLines([
      { productId: product.id, quantity: 2, unitPrice: 10 },
      { productId: product.id, quantity: 2, unitPrice: 10 },
    ]);
    await receive(poId).expect(200);
    await makeLegacy(poId, '2026-09-01');
    const before = await snapshot(poId, product.id);

    const response = await unreceive(poId).expect(409);

    expect(response.body.message).toContain('stock records do not match its receipt entry');
    expect(await snapshot(poId, product.id)).toEqual(before);
  });

  it('refuses missing line identity on a versioned receipt without legacy fallback or partial writes', async () => {
    const product = await newProduct();
    const poId = await createPoWithLines([
      { productId: product.id, quantity: 2, unitPrice: 10 },
      { productId: product.id, quantity: 2, unitPrice: 10 },
    ]);
    await receive(poId).expect(200);
    await ds.query(
      `UPDATE stock_movements SET "purchaseOrderItemId" = NULL
        WHERE "referenceType" = 'purchase_order' AND "referenceId" = $1 AND id = (
          SELECT id FROM stock_movements WHERE "referenceType" = 'purchase_order' AND "referenceId" = $1 ORDER BY id LIMIT 1
        )`,
      [poId],
    );
    const before = await snapshot(poId, product.id);

    const response = await unreceive(poId).expect(409);

    expect(response.body.message).toContain('stock records do not match its receipt entry');
    expect(await snapshot(poId, product.id)).toEqual(before);
  });

  it('stores the reason on the reversal occurrence, its movements and the audit row', async () => {
    const product = await newProduct();
    const poId = await createPo(product.id, 2, 10);
    await receive(poId).expect(200);
    const reason = `Supplier recall ${run}`;

    await unreceive(poId, reason).expect(200);

    const [rev] = await ds.query(
      `SELECT id, reason FROM stock_occurrences WHERE "documentId" = $1 AND kind = 'receipt_reversal'`,
      [poId],
    );
    expect(rev.reason).toBe(reason);
    const movements: { reason: string }[] = await ds.query(
      `SELECT reason FROM stock_movements WHERE "occurrenceId" = $1`,
      [rev.id],
    );
    expect(movements.every((m) => m.reason === `Reversal: ${reason}`)).toBe(true);
    const [audit] = await ds.query(
      `SELECT description, "newValues" FROM audit_logs WHERE "entityId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
      [poId],
    );
    expect(audit.description).toMatch(/Returned purchase order/);
    expect(audit.newValues?.reason).toBe(reason);
  });

  it('refuses a missing reason with 400', async () => {
    const product = await newProduct();
    const poId = await createPo(product.id, 2, 10);
    await receive(poId).expect(200);

    await request(app.getHttpServer())
      .post(`/purchasing/orders/${poId}/return`)
      .set(auth())
      .send({})
      .expect(400);
    await request(app.getHttpServer())
      .post(`/purchasing/orders/${poId}/return`)
      .set(auth())
      .send({ reason: 'no' })
      .expect(400);
  });

  it('refuses a later decrease with 409 and changes nothing', async () => {
    const product = await newProduct();
    const poId = await createPo(product.id, 5, 10);
    await receive(poId).expect(200);
    await ds.query(
      `INSERT INTO stock_movements ("movementType","movementDate",quantity,"previousBalance","newBalance","productId","productSequence","referenceType","isActive")
       VALUES ('damage', '2026-09-05', -2, 5, 3, $1,
               (SELECT COALESCE(MAX("productSequence"),0)+1 FROM stock_movements WHERE "productId" = $1), 'stock_adjustment', true)`,
      [product.id],
    );
    const before = await snapshot(poId, product.id);

    const res = await unreceive(poId).expect(409);
    expect(res.body.message).toBe(RECEIPT_LATER_DECREASE(product.name, 'Damage', '2026-09-05'));
    expect(await snapshot(poId, product.id)).toEqual(before);
  });

  it('refuses a touched batch with 409 and changes nothing', async () => {
    const product = await newProduct();
    const poId = await createPo(product.id, 5, 10);
    await receive(poId).expect(200);
    await ds.query(
      `UPDATE purchase_cost_history SET "remainingQuantity" = "remainingQuantity" - 1 WHERE "purchaseOrderId" = $1`,
      [poId],
    );
    const before = await snapshot(poId, product.id);

    const res = await unreceive(poId).expect(409);
    expect(res.body.message).toBe(RECEIPT_BATCH_TOUCHED(product.name));
    expect(await snapshot(poId, product.id)).toEqual(before);
  });

  it('lets exactly one of two concurrent unreceives win', async () => {
    const product = await newProduct();
    const poId = await createPo(product.id, 2, 10);
    await receive(poId).expect(200);

    const lock = await holdRowLock(ds, `SELECT id FROM purchase_orders WHERE id = $1 FOR UPDATE`, [poId]);
    const service = app.get(PurchaseOrderLifecycleService);
    let released = false;
    const release = async () => {
      if (!released) {
        released = true;
        await lock.release();
      }
    };
    try {
      const first = service.return(poId, REASON);
      const second = service.return(poId, REASON);
      await waitForBlockedBy(ds, lock, 2);
      await release();

      const results = await Promise.allSettled([first, second]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(String(rejected[0].reason?.message ?? rejected[0].reason)).toMatch(/not received/i);
    } finally {
      await release();
    }

    const reversals = await ds.query(
      `SELECT id FROM stock_occurrences WHERE "documentId" = $1 AND kind = 'receipt_reversal'`,
      [poId],
    );
    expect(reversals).toHaveLength(1);
    expect(await stockOf(product.id)).toBe(0);
  });

  it.each([
    ['fulfilment acquires the product lock first', 'fulfilment'],
    ['unreceive acquires the product lock first', 'unreceive'],
  ] as const)('%s: the competing transaction sees the committed stock', async (_label, first) => {
    const product = await newProduct();
    const poId = await createPo(product.id, 5, 10);
    await receive(poId).expect(200);
    const salesOrderId = await createSalesOrder(product.id, 3, 50);

    // Both real lifecycle transactions first wait on this lock. Starting one,
    // observing it blocked, then starting the other controls their lock queue.
    const lock = await holdRowLock(ds, `SELECT id FROM products WHERE id = $1 FOR UPDATE`, [product.id]);
    const unreceiveService = app.get(PurchaseOrderLifecycleService);
    const fulfilmentService = app.get(SalesOrderFulfillmentService);
    const runFirst = () =>
      first === 'unreceive'
        ? unreceiveService.return(poId, REASON)
        : fulfilmentService.fulfillOrder(salesOrderId);
    const runSecond = () =>
      first === 'unreceive'
        ? fulfilmentService.fulfillOrder(salesOrderId)
        : unreceiveService.return(poId, REASON);

    let released = false;
    const release = async () => {
      if (!released) {
        released = true;
        await lock.release();
      }
    };
    let results: PromiseSettledResult<unknown>[];
    try {
      const firstResult = runFirst();
      await waitForBlockedBy(ds, lock, 1);
      const secondResult = runSecond();
      await waitForBlockedBy(ds, lock, 2);
      await release();
      results = await Promise.allSettled([firstResult, secondResult]);
    } finally {
      await release();
    }

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const [po] = await ds.query(`SELECT status FROM purchase_orders WHERE id = $1`, [poId]);
    const [order] = await ds.query(`SELECT status FROM sales_orders WHERE id = $1`, [salesOrderId]);
    const [saleMovements] = await ds.query(
      `SELECT count(*)::int AS n FROM stock_movements WHERE "referenceType" = 'sales_order' AND "referenceId" = $1`,
      [salesOrderId],
    );
    const reversals = await ds.query(
      `SELECT id FROM stock_occurrences WHERE "documentId" = $1 AND kind = 'receipt_reversal'`,
      [poId],
    );

    if (first === 'fulfilment') {
      const failure = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
      expect(String(failure.reason?.message ?? failure.reason)).toMatch(/has left since this receipt/i);
      expect(order.status).toBe('FULFILLED');
      expect(saleMovements.n).toBeGreaterThan(0);
      expect(po.status).toBe('RECEIVED');
      expect(reversals).toHaveLength(0);
      expect(await stockOf(product.id)).toBe(2);
    } else {
      const failure = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
      expect(String(failure.reason?.message ?? failure.reason)).toMatch(/insufficient stock/i);
      expect(order.status).toBe('READY');
      expect(saleMovements.n).toBe(0);
      expect(po.status).toBe('READY');
      expect(reversals).toHaveLength(1);
      expect(await stockOf(product.id)).toBe(0);
    }
  });

  async function stockOf(productId: string): Promise<number> {
    const [row] = await ds.query(`SELECT "stockQuantity" FROM products WHERE id = $1`, [productId]);
    return Number(row.stockQuantity);
  }
});
