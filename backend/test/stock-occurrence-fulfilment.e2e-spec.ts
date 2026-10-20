import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import {
  seedCategory,
  seedDocumentNumberSettings,
  seedPaymentMethod,
  seedProduct,
} from './e2e/helpers/seed';
import { formatMoney, toMinorUnits } from '../src/common/utils/money';
import { ACCOUNTING_POSTING_PORT } from '../src/common/accounting-posting/accounting-posting.port';
import { SalesOrderFulfillmentService } from '../src/modules/sales/services/sales-order-fulfillment.service';
import { StockMovementService } from '../src/modules/inventory/services/stock-movement.service';
import { StockMovementType } from '../src/database/entities/stock-movement.entity';
import { configureTestAppValidation } from './utils/configure-test-app-validation';
import { SESSION_PROTOCOL } from './utils/session-protocol';
import { resetSuiteBusinessRows } from './utils/shared-e2e-business-fixture';
import {
  E2E_ADMIN_PASSWORD,
  E2E_ADMIN_USERNAMES,
  removeSuiteAdmin,
  seedSuiteAdmin,
} from './utils/shared-e2e-fixture';
import { removeSuiteTraces } from './utils/shared-e2e-traces-fixture';

/**
 * A fulfilment records one occurrence, per-movement provenance and reconciled
 * values (#1406).
 *
 * The hard case is an order that lists the same product on two lines: both draw
 * the same batches, so the whole order must be planned against one shared view of
 * the batch balances — otherwise the second line re-allocates what the first
 * consumed. These tests drive the real HTTP API and read the rows directly.
 */
describe('Stock occurrence — fulfilment (#1406, e2e)', () => {
  const USERNAME = E2E_ADMIN_USERNAMES.stockOccurrenceFulfilment;
  const run = `${process.pid}-${Date.now().toString(36)}`;

  let app: INestApplication;
  let ds: DataSource;
  let token: string;
  let fulfillment: SalesOrderFulfillmentService;
  let stockMovementService: StockMovementService;
  let postingPort: any;

  let categoryId: string;
  let supplierId: string;
  let customerId: string;
  let paymentMethodId: string;
  let productA: string;
  let productB: string;
  let productC: string;

  const ownedOrderIds: string[] = [];
  const ownedPoIds: string[] = [];
  const productIds: string[] = [];

  const auth = () => ({ Authorization: `Bearer ${token}` });

  async function createPo(productId: string, quantity: number, unitPrice: number) {
    const res = await request(app.getHttpServer())
      .post('/purchasing/orders')
      .set(auth())
      .send({
        supplierId,
        orderDate: '2026-09-01',
        items: [{ productId, quantity, unitPrice }],
      })
      .expect(201);
    const po = res.body.data ?? res.body;
    ownedPoIds.push(po.id);
    await request(app.getHttpServer())
      .post(`/purchasing/orders/${po.id}/payments`)
      .set(auth())
      .send({
        payments: [
          { paymentMethodId, amount: formatMoney(toMinorUnits(po.totalAmount)), paymentDate: '2026-09-01' },
        ],
      })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/purchasing/orders/${po.id}/receive`)
      .set(auth())
      .expect(200);
    return po;
  }

  async function createPaidOrder(
    items: { productId: string; quantity: number; unitPrice: number }[],
  ) {
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
    await request(app.getHttpServer())
      .post(`/sales-orders/${orderId}/fulfill`)
      .set(auth())
      .expect(201);
  }

  async function stockOf(productId: string): Promise<number> {
    const [row] = await ds.query(`SELECT "stockQuantity" FROM products WHERE id = $1`, [productId]);
    return Number(row.stockQuantity);
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();

    ds = app.get(DataSource);
    fulfillment = app.get(SalesOrderFulfillmentService);
    stockMovementService = app.get(StockMovementService);
    postingPort = app.get(ACCOUNTING_POSTING_PORT);

    await seedSuiteAdmin(ds, USERNAME);
    const category = await seedCategory(ds, `stock-occ-fulfilment-${run}`);
    categoryId = category.id;
    productA = (await seedProduct(ds, category.id, { stockQuantity: 0, baseCost: 10 })).id;
    productB = (await seedProduct(ds, category.id, { stockQuantity: 0, baseCost: 5 })).id;
    // Product C has stock but no cost-history batches: a zero-cost fulfilment.
    productC = (await seedProduct(ds, category.id, { stockQuantity: 5, baseCost: 0 })).id;
    productIds.push(productA, productB, productC);
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
      .send({ type: 'local', companyName: `Stock Occ Fulfilment Supplier ${run}` })
      .expect(201);
    supplierId = (supplier.body.data ?? supplier.body).id;

    const customer = await request(app.getHttpServer())
      .post('/customers')
      .set(auth())
      .send({ type: 'business', name: `Stock Occ Fulfilment Customer ${run}` })
      .expect(201);
    customerId = (customer.body.data ?? customer.body).id;

    // Two batches of A at DIFFERENT landed costs, oldest first (FIFO): RM10 then
    // RM20. One batch of B at RM5.
    await createPo(productA, 5, 10);
    await createPo(productA, 5, 20);
    await createPo(productB, 5, 5);
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      const idsOr = (ids: string[]) =>
        ids.length ? ids : ['00000000-0000-0000-0000-000000000000'];
      const documentIds = [...ownedOrderIds, ...ownedPoIds];
      const occurrenceIds: string[] = (
        await ds.query(`SELECT id FROM stock_occurrences WHERE "documentId" = ANY($1)`, [
          idsOr(documentIds),
        ])
      ).map((r: { id: string }) => r.id);
      await ds.query(
        `DELETE FROM journal_entry WHERE "sourceDocumentId" = ANY($1) OR "sourceEventId" = ANY($2)`,
        [idsOr(documentIds), idsOr(occurrenceIds)],
      );
      const adminRows: { id: string }[] = await ds.query(
        `SELECT id FROM users WHERE username = $1`,
        [USERNAME],
      );
      await removeSuiteTraces(ds, {
        userIds: adminRows.map((r) => r.id),
        usernames: [USERNAME],
        entityIds: [
          categoryId,
          supplierId,
          customerId,
          ...productIds,
          ...documentIds,
          ...occurrenceIds,
        ].filter(Boolean),
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

  it('a fulfilment is one occurrence with provenance that sums to its lines', async () => {
    // Three lines, two of them product A drawing across both A batches.
    const order = await createPaidOrder([
      { productId: productA, quantity: 3, unitPrice: 50 },
      { productId: productA, quantity: 3, unitPrice: 50 },
      { productId: productB, quantity: 1, unitPrice: 50 },
    ]);

    await fulfil(order.id);

    const occurrences = await ds.query(
      `SELECT id, "postedAmount" FROM stock_occurrences WHERE "documentId" = $1 AND kind = 'fulfilment'`,
      [order.id],
    );
    expect(occurrences).toHaveLength(1);
    const occurrence = occurrences[0];

    // COGS entry keyed to the occurrence; its debit is the recorded amount.
    const [cogsEntry] = await ds.query(
      `SELECT id FROM journal_entry WHERE "sourceEventId" = $1 AND "postingType" = 'SALES_FULFILLMENT_COGS'`,
      [occurrence.id],
    );
    expect(cogsEntry).toBeTruthy();
    const cogsLines: { debit: string }[] = await ds.query(
      `SELECT debit FROM journal_entry_line WHERE "entryId" = $1`,
      [cogsEntry.id],
    );
    const cogsDebitMinor = cogsLines.reduce((sum, l) => sum + toMinorUnits(l.debit), 0n);
    expect(cogsDebitMinor).toBe(toMinorUnits(occurrence.postedAmount));

    // The revenue entry is keyed to the same occurrence.
    const [revenueEntry] = await ds.query(
      `SELECT id FROM journal_entry WHERE "sourceEventId" = $1 AND "postingType" = 'SALES_FULFILLMENT_REVENUE'`,
      [occurrence.id],
    );
    expect(revenueEntry).toBeTruthy();

    const movements: {
      id: string;
      productId: string;
      quantity: string;
      totalValue: string;
    }[] = await ds.query(
      `SELECT id, "productId", quantity, "totalValue"
         FROM stock_movements WHERE "occurrenceId" = $1`,
      [occurrence.id],
    );
    expect(movements).toHaveLength(3);

    const movementValueMinor = movements.reduce(
      (sum, m) => sum + toMinorUnits(m.totalValue),
      0n,
    );
    expect(movementValueMinor).toBe(toMinorUnits(occurrence.postedAmount));

    for (const movement of movements) {
      const provenance: { quantity: string; valueScale8: string }[] = await ds.query(
        `SELECT quantity, "valueScale8" FROM stock_batch_consumptions WHERE "movementId" = $1`,
        [movement.id],
      );
      // Provenance sums to the movement's own quantity...
      const provenanceQtyMinor = provenance.reduce(
        (sum, p) => sum + toMinorUnits(p.quantity),
        0n,
      );
      expect(provenanceQtyMinor).toBe(toMinorUnits(movement.quantity.replace('-', '')));
      // ...and its scale-8 value is exactly the movement's recorded value.
      const provenanceValueScale8 = provenance.reduce(
        (sum, p) => sum + BigInt(p.valueScale8.replace('.', '')),
        0n,
      );
      expect(provenanceValueScale8).toBe(toMinorUnits(movement.totalValue) * 10000n);
    }

    // Only 6 units of A came out of two 5-unit batches, so both batches were
    // touched and 4 units remain in total — no double consumption.
    const [batchTotals] = await ds.query(
      `SELECT COALESCE(sum("remainingQuantity"), 0)::text AS remaining,
              COALESCE(sum("receivedQuantity"), 0)::text AS received
         FROM purchase_cost_history WHERE "productId" = $1`,
      [productA],
    );
    expect(Number(batchTotals.received)).toBe(10);
    expect(Number(batchTotals.remaining)).toBe(4);

    const productAMinus = movements.filter((m) => m.productId === productA);
    expect(productAMinus).toHaveLength(2);
    const productAMinor = productAMinus.reduce((sum, m) => sum + toMinorUnits(m.totalValue), 0n);
    expect(productAMinor).toBe(toMinorUnits('70.0000')); // 5 x RM10 + 1 x RM20
    expect(await stockOf(productA)).toBe(4);
    expect(await stockOf(productB)).toBe(4);
  });

  it('a zero-cost fulfilment records postedAmount 0 and no COGS entry', async () => {
    const order = await createPaidOrder([{ productId: productC, quantity: 1, unitPrice: 50 }]);

    await fulfil(order.id);

    const [occurrence] = await ds.query(
      `SELECT id, "postedAmount", "hasValuationGap" FROM stock_occurrences WHERE "documentId" = $1 AND kind = 'fulfilment'`,
      [order.id],
    );
    expect(occurrence).toBeTruthy();
    expect(toMinorUnits(occurrence.postedAmount)).toBe(0n);
    expect(occurrence.hasValuationGap).toBe(true);

    const [movement] = await ds.query(
      `SELECT id, quantity FROM stock_movements WHERE "occurrenceId" = $1 AND quantity < 0`,
      [occurrence.id],
    );
    const [gap] = await ds.query(
      `SELECT quantity, "valueScale8", status FROM stock_movement_valuation_gaps WHERE "movementId" = $1`,
      [movement.id],
    );
    expect(toMinorUnits(gap.quantity)).toBe(toMinorUnits('1.0000'));
    expect(gap.valueScale8).toBe('0.00000000');
    expect(gap.status).toBe('unvalued_gap');
    await expect(
      ds.query(`UPDATE stock_occurrences SET "hasValuationGap" = false WHERE id = $1`, [
        occurrence.id,
      ]),
    ).rejects.toThrow(/valuation.gap records do not agree with occurrence marker/i);

    const before = {
      stock: await stockOf(productC),
      movements: Number((await ds.query(
        `SELECT count(*)::int AS n FROM stock_movements WHERE "referenceId" = $1`,
        [order.id],
      ))[0].n),
      journal: Number((await ds.query(
        `SELECT count(*)::int AS n FROM journal_entry WHERE "sourceDocumentId" = $1`,
        [order.id],
      ))[0].n),
      gapCount: Number((await ds.query(
        `SELECT count(*)::int AS n FROM stock_movement_valuation_gaps WHERE "movementId" = $1`,
        [movement.id],
      ))[0].n),
    };
    await expect(
      fulfillment.unfulfillOrder(order.id, 'customer requested cancellation'),
    ).rejects.toThrow(/unvalued stock.*cannot be automatically unfulfilled/i);
    const [orderState] = await ds.query(`SELECT status FROM sales_orders WHERE id = $1`, [order.id]);
    expect(orderState.status).toBe('FULFILLED');
    expect(await stockOf(productC)).toBe(before.stock);
    expect(Number((await ds.query(
      `SELECT count(*)::int AS n FROM stock_movements WHERE "referenceId" = $1`,
      [order.id],
    ))[0].n)).toBe(before.movements);
    expect(Number((await ds.query(
      `SELECT count(*)::int AS n FROM journal_entry WHERE "sourceDocumentId" = $1`,
      [order.id],
    ))[0].n)).toBe(before.journal);
    expect(Number((await ds.query(
      `SELECT count(*)::int AS n FROM stock_movement_valuation_gaps WHERE "movementId" = $1`,
      [movement.id],
    ))[0].n)).toBe(before.gapCount);

    const cogs = await ds.query(
      `SELECT id FROM journal_entry WHERE "sourceEventId" = $1 AND "postingType" = 'SALES_FULFILLMENT_COGS'`,
      [occurrence.id],
    );
    expect(cogs).toHaveLength(0);
    const revenue = await ds.query(
      `SELECT id FROM journal_entry WHERE "sourceEventId" = $1 AND "postingType" = 'SALES_FULFILLMENT_REVENUE'`,
      [occurrence.id],
    );
    expect(revenue).toHaveLength(1);

    // Service-style stock is still decremented.
    expect(await stockOf(productC)).toBe(4);
  });

  it('partially covered fulfillment records only the uncovered quantity as an unvalued gap', async () => {
    // The earlier split-line fulfilment consumed 6 of the original 10 batch
    // units, leaving 4. Receive 6 more so this case has 10 batch-backed units
    // plus the 2 unbatched units below for its 12-unit order.
    await createPo(productA, 6, 10);
    await stockMovementService.create({
      productId: productA,
      movementType: StockMovementType.ADJUSTMENT_INCREASE,
      quantity: 2,
      reason: 'Unbatched stock for valuation-gap coverage',
    } as any);
    const order = await createPaidOrder([{ productId: productA, quantity: 12, unitPrice: 50 }]);

    await fulfil(order.id);

    const [occurrence] = await ds.query(
      `SELECT id, "postedAmount", "hasValuationGap" FROM stock_occurrences WHERE "documentId" = $1 AND kind = 'fulfilment'`,
      [order.id],
    );
    expect(occurrence.hasValuationGap).toBe(true);
    // Four remaining units are landed at 20 each and six new receipt units at
    // 10 each: the actual batch-backed COGS remains 140.00; the two gap units
    // contribute no posted COGS during the interim.
    expect(toMinorUnits(occurrence.postedAmount)).toBe(toMinorUnits('140.00'));

    const [movement] = await ds.query(
      `SELECT id, quantity, "totalValue" FROM stock_movements WHERE "occurrenceId" = $1 AND quantity < 0`,
      [occurrence.id],
    );
    const consumptions: { quantity: string; batchId: string }[] = await ds.query(
      `SELECT quantity, "batchId" FROM stock_batch_consumptions WHERE "movementId" = $1`,
      [movement.id],
    );
    const [gap] = await ds.query(
      `SELECT quantity, "valueScale8", status FROM stock_movement_valuation_gaps WHERE "movementId" = $1`,
      [movement.id],
    );
    const consumedMinor = consumptions.reduce((sum, row) => sum + toMinorUnits(row.quantity), 0n);
    expect(consumedMinor).toBe(toMinorUnits('10.0000'));
    expect(toMinorUnits(gap.quantity)).toBe(toMinorUnits('2.0000'));
    expect(consumedMinor + toMinorUnits(gap.quantity)).toBe(toMinorUnits(movement.quantity.replace('-', '')));
    expect(gap.valueScale8).toBe('0.00000000');
    expect(gap.status).toBe('unvalued_gap');
    expect(toMinorUnits(movement.totalValue)).toBe(toMinorUnits('140.00'));
    expect(await stockOf(productA)).toBe(0);
    await expect(
      ds.query(
        `INSERT INTO stock_batch_consumptions ("movementId", "batchId", quantity, "unitCost", "valueScale8")
         VALUES ($1, $2, 0, 10, 0)`,
        [movement.id, consumptions[0].batchId],
      ),
    ).rejects.toThrow(/CHK_stock_batch_consumptions_quantity_positive/i);
    const historyResponse = await request(app.getHttpServer())
      .get('/inventory/stock/movements')
      .query({ productId: productA, page: 1, limit: 100 })
      .set(auth())
      .expect(200);
    const historyRows = historyResponse.body?.data?.data ?? historyResponse.body?.data ?? [];
    const saleHistoryRow = historyRows.find((row: any) => row.id === movement.id);
    expect(saleHistoryRow.valuationGap).toMatchObject({
      quantity: 2,
      status: 'unvalued_gap',
      valueScale8: '0.00000000',
    });
    await expect(
      ds.query(`UPDATE stock_movement_valuation_gaps SET quantity = 1 WHERE "movementId" = $1`, [
        movement.id,
      ]),
    ).rejects.toThrow(/valuation gaps are immutable/i);
    await expect(
      ds.query(`DELETE FROM stock_movement_valuation_gaps WHERE "movementId" = $1`, [movement.id]),
    ).rejects.toThrow(/valuation gaps are immutable/i);

    const journalBefore = Number((await ds.query(
      `SELECT count(*)::int AS n FROM journal_entry WHERE "sourceDocumentId" = $1`,
      [order.id],
    ))[0].n);
    const reversalCountBefore = Number((await ds.query(
      `SELECT count(*)::int AS n FROM stock_occurrences WHERE "documentId" = $1 AND kind = 'fulfilment_reversal'`,
      [order.id],
    ))[0].n);
    await expect(
      fulfillment.unfulfillOrder(order.id, 'partial unvalued gap refusal'),
    ).rejects.toThrow(/unvalued stock.*cannot be automatically unfulfilled/i);
    const [orderAfterRefusal] = await ds.query(`SELECT status FROM sales_orders WHERE id = $1`, [order.id]);
    expect(orderAfterRefusal.status).toBe('FULFILLED');
    expect(await stockOf(productA)).toBe(0);
    expect(Number((await ds.query(
      `SELECT count(*)::int AS n FROM stock_occurrences WHERE "documentId" = $1 AND kind = 'fulfilment_reversal'`,
      [order.id],
    ))[0].n)).toBe(reversalCountBefore);
    expect(Number((await ds.query(
      `SELECT count(*)::int AS n FROM journal_entry WHERE "sourceDocumentId" = $1`,
      [order.id],
    ))[0].n)).toBe(journalBefore);
  });

  it('insufficient stock refuses the fulfilment and writes nothing', async () => {
    const order = await createPaidOrder([{ productId: productB, quantity: 999, unitPrice: 50 }]);

    await request(app.getHttpServer())
      .post(`/sales-orders/${order.id}/fulfill`)
      .set(auth())
      .expect(409);

    const occurrences = await ds.query(
      `SELECT id FROM stock_occurrences WHERE "documentId" = $1`,
      [order.id],
    );
    expect(occurrences).toHaveLength(0);
    const movements = await ds.query(
      `SELECT id FROM stock_movements WHERE "referenceId" = $1`,
      [order.id],
    );
    expect(movements).toHaveLength(0);
  });

  it('a journal that cannot be reconciled rolls the whole fulfilment back', async () => {
    await createPo(productA, 1, 10);
    const order = await createPaidOrder([{ productId: productA, quantity: 1, unitPrice: 50 }]);
    const stockBefore = await stockOf(productA);

    // Nonzero COGS is recorded, but the posting reports no COGS entry: the
    // service must refuse and the transaction must roll back.
    const spy = jest
      .spyOn(postingPort, 'postSalesFulfillment')
      .mockResolvedValue({ revenueEntryId: 'unused', cogsEntryId: null });
    try {
      await expect(fulfillment.fulfillOrder(order.id)).rejects.toThrow(/COGS entry missing/);
    } finally {
      spy.mockRestore();
    }

    const [o] = await ds.query(`SELECT status FROM sales_orders WHERE id = $1`, [order.id]);
    expect(o.status).toBe('READY');
    const occurrences = await ds.query(
      `SELECT id FROM stock_occurrences WHERE "documentId" = $1`,
      [order.id],
    );
    expect(occurrences).toHaveLength(0);
    const movements = await ds.query(
      `SELECT id FROM stock_movements WHERE "referenceId" = $1`,
      [order.id],
    );
    expect(movements).toHaveLength(0);
    expect(await stockOf(productA)).toBe(stockBefore);
  });
});
