import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { CostingMethod } from '../src/common/costing/supported-costing-methods';
import { formatMoney, toMinorUnits } from '../src/common/utils/money';
import {
  seedCategory,
  seedDocumentNumberSettings,
  seedPaymentMethod,
  seedProduct,
} from './e2e/helpers/seed';
import { configureTestAppValidation } from './utils/configure-test-app-validation';
import { SESSION_PROTOCOL } from './utils/session-protocol';
import {
  E2E_ADMIN_PASSWORD,
  E2E_ADMIN_USERNAMES,
  removeSuiteAdmin,
  seedSuiteAdmin,
} from './utils/shared-e2e-fixture';
import { removeSuiteTraces } from './utils/shared-e2e-traces-fixture';
import { resetSuiteBusinessRows } from './utils/shared-e2e-business-fixture';
import {
  activateValuationForTest,
  deactivateValuationForTest,
} from './utils/valuation-fixture';
import { UNFULFILL_VALUATION_GAP } from '../src/modules/inventory/stock-undo-unavailable';

const USERNAME = E2E_ADMIN_USERNAMES.stockUnfulfil;
const RUN = `${process.pid}-${Date.now().toString(36)}`;

describe('Sales valuation under active inventory valuation', () => {
  let app: INestApplication;
  let ds: DataSource;
  let token: string;
  let categoryId: string;
  let customerId: string;
  let supplierId: string;
  let paymentMethodId: string;
  const productIds: string[] = [];
  const orderIds: string[] = [];
  const purchaseOrderIds: string[] = [];
  const auth = () => ({ Authorization: `Bearer ${token}` });

  async function createProductAndBatches() {
    const product = await seedProduct(ds, categoryId, {
      stockQuantity: 10,
      baseCost: 100,
    });
    productIds.push(product.id);
    await ds.query(
      `INSERT INTO purchase_cost_history ("productId", "unitCost", "shippingPerUnit", "landedCost", "receivedQuantity", "remainingQuantity", "receivedDate")
       VALUES ($1, 50, 0, 50, 6, 6, '2025-01-01'), ($1, 150, 0, 150, 4, 4, '2025-02-01')`,
      [product.id],
    );
    return product.id;
  }

  async function createOrder(
    items: Array<{ productId: string; quantity: number }>,
  ) {
    const res = await request(app.getHttpServer())
      .post('/sales-orders')
      .set(auth())
      .send({
        customerId,
        items: items.map((item) => ({ ...item, unitPrice: 200 })),
      })
      .expect(201);
    const order = res.body.data ?? res.body;
    orderIds.push(order.id);
    await request(app.getHttpServer())
      .post(`/sales-orders/${order.id}/payments`)
      .set(auth())
      .send({
        customerId,
        salesOrderId: order.id,
        paymentMethodId,
        amount: formatMoney(toMinorUnits(String(order.totalAmount))),
        paymentDate: '2026-09-10',
      })
      .expect(200);
    return order;
  }

  async function fulfill(orderId: string) {
    await request(app.getHttpServer())
      .post(`/sales-orders/${orderId}/fulfill`)
      .set(auth())
      .expect(201);
  }

  function unfulfill(orderId: string) {
    return request(app.getHttpServer())
      .post(`/sales-orders/${orderId}/unfulfill`)
      .set(auth())
      .send({ reason: 'Valuation e2e return' });
  }

  async function valuationEntries(orderId: string) {
    return ds.query(
      `SELECT e.kind, e.value::text AS value, e."runningQuantity"::text AS quantity, e."runningValue"::text AS running, m.id AS "movementId"
         FROM stock_valuation_entries e JOIN stock_movements m ON m.id = e."movementId"
        WHERE m."referenceId" = $1 ORDER BY m."productSequence", m.id`,
      [orderId],
    );
  }

  async function seedActive(
    productId: string,
    method: CostingMethod,
    quantity = '10',
    value = '1000.00',
  ) {
    const layers =
      method === 'FIFO'
        ? [
            { quantity: '6', value: '300.00' },
            { quantity: '4', value: '600.00' },
          ]
        : undefined;
    await activateValuationForTest(ds, {
      method,
      products: [{ productId, quantity, value, layers }],
    });
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureTestAppValidation(app);
    await app.init();
    ds = app.get(DataSource);
    await seedSuiteAdmin(ds, USERNAME);
    categoryId = (await seedCategory(ds, `valuation-sales-${RUN}`)).id;
    paymentMethodId = (await seedPaymentMethod(ds)).id;
    await seedDocumentNumberSettings(ds);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .set(...SESSION_PROTOCOL)
      .send({ usernameOrEmail: USERNAME, password: E2E_ADMIN_PASSWORD })
      .expect(200);
    token = login.body?.data?.accessToken ?? login.body?.accessToken;
    const supplier = await request(app.getHttpServer())
      .post('/purchasing/suppliers')
      .set(auth())
      .send({ type: 'local', companyName: `Valuation Supplier ${RUN}` })
      .expect(201);
    supplierId = (supplier.body.data ?? supplier.body).id;
    const customer = await request(app.getHttpServer())
      .post('/customers')
      .set(auth())
      .send({ type: 'business', name: `Valuation Customer ${RUN}` })
      .expect(201);
    customerId = (customer.body.data ?? customer.body).id;
  });

  afterEach(async () => {
    if (ds?.isInitialized) await deactivateValuationForTest(ds);
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      const ids = [...orderIds, ...purchaseOrderIds];
      const or = ids.length ? ids : ['00000000-0000-0000-0000-000000000000'];
      const occurrences: Array<{ id: string }> = await ds.query(
        `SELECT id FROM stock_occurrences WHERE "documentId" = ANY($1)`,
        [or],
      );
      const occurrenceIds = occurrences.map((row) => row.id);
      const zero = ['00000000-0000-0000-0000-000000000000'];
      await ds.query(
        `DELETE FROM journal_entry WHERE "sourceDocumentId" = ANY($1) OR "sourceEventId" = ANY($2)`,
        [or, occurrenceIds.length ? occurrenceIds : zero],
      );
      await removeSuiteTraces(ds, {
        usernames: [USERNAME],
        entityIds: [
          categoryId,
          customerId,
          supplierId,
          ...productIds,
          ...ids,
          ...occurrenceIds,
        ].filter(Boolean),
      });
      await resetSuiteBusinessRows(ds, {
        categoryIds: [categoryId],
        customerIds: [customerId],
        supplierIds: [supplierId],
        productIds,
      });
      await ds.query(
        `DELETE FROM document_number_settings WHERE "documentName" = 'Goods Received'`,
      );
      await removeSuiteAdmin(ds, USERNAME);
    }
    await app.close();
  });

  describe.each(['AVERAGE', 'FIFO'] as CostingMethod[])(
    '%s valuation',
    (method) => {
      it('uses valuation cost while consuming the oldest physical batch', async () => {
        const productId = await createProductAndBatches();
        await seedActive(
          productId,
          method,
          '10',
          method === 'FIFO' ? '900.00' : '1000.00',
        );
        const order = await createOrder([{ productId, quantity: 5 }]);
        await fulfill(order.id);
        const entries = await valuationEntries(order.id);
        expect(entries).toHaveLength(1);
        expect(entries[0].value).toBe(
          method === 'FIFO' ? '-250.00' : '-500.00',
        );
        expect(entries[0].running).toBe(
          method === 'FIFO' ? '650.00' : '500.00',
        );
        const [oldest, newer] = await ds.query(
          `SELECT "remainingQuantity"::text AS remaining FROM purchase_cost_history WHERE "productId" = $1 ORDER BY "receivedDate", id`,
          [productId],
        );
        expect(oldest.remaining).toBe('1.0000');
        expect(newer.remaining).toBe('4.0000');
      });

      it('sees repeated product lines sequentially and restores them on unfulfil', async () => {
        const productId = await createProductAndBatches();
        await seedActive(
          productId,
          method,
          '10',
          method === 'FIFO' ? '900.00' : '1000.00',
        );
        const order = await createOrder([
          { productId, quantity: 3 },
          { productId, quantity: 2 },
        ]);
        await fulfill(order.id);
        const entries = await valuationEntries(order.id);
        expect(entries.map((entry: any) => entry.value)).toEqual(
          method === 'FIFO' ? ['-150.00', '-100.00'] : ['-300.00', '-200.00'],
        );
        const batchDraws = await ds.query(
          `SELECT c.quantity::text AS quantity, c."batchId" FROM stock_batch_consumptions c
           JOIN stock_movements m ON m.id = c."movementId"
          WHERE m."referenceId" = $1 ORDER BY m."productSequence"`,
          [order.id],
        );
        expect(batchDraws.map((row: any) => row.quantity)).toEqual([
          '3.0000',
          '2.0000',
        ]);
        await unfulfill(order.id).expect(201);
        const [balance] = await ds.query(
          `SELECT "quantityOnHand"::text AS quantity, "valueOnHand"::text AS value FROM product_valuation_balances WHERE "productId" = $1`,
          [productId],
        );
        expect(balance).toEqual({
          quantity: '10.0000',
          value: method === 'FIFO' ? '900.00' : '1000.00',
        });
        const [oldest, newer] = await ds.query(
          `SELECT "remainingQuantity"::text AS remaining FROM purchase_cost_history WHERE "productId" = $1 ORDER BY "receivedDate", id`,
          [productId],
        );
        expect(oldest.remaining).toBe('6.0000');
        expect(newer.remaining).toBe('4.0000');
      });

      it('depletes the final unit without leaving a value residue', async () => {
        const productId = await createProductAndBatches();
        await seedActive(
          productId,
          method,
          '10',
          method === 'FIFO' ? '900.00' : '1000.00',
        );
        const order = await createOrder([{ productId, quantity: 10 }]);
        await fulfill(order.id);
        const [balance] = await ds.query(
          `SELECT "quantityOnHand"::text AS quantity, "valueOnHand"::text AS value FROM product_valuation_balances WHERE "productId" = $1`,
          [productId],
        );
        expect(balance).toEqual({ quantity: '0.0000', value: '0.00' });
      });
    },
  );

  it('unfulfils a pre-activation fulfilment at its posted COGS', async () => {
    const productId = await createProductAndBatches();
    await ds.query(
      `UPDATE purchase_cost_history SET "unitCost" = 100, "landedCost" = 100 WHERE "productId" = $1`,
      [productId],
    );
    const order = await createOrder([{ productId, quantity: 5 }]);
    await fulfill(order.id);
    await seedActive(productId, 'AVERAGE', '5', '500.00');
    await unfulfill(order.id).expect(201);
    const [balance] = await ds.query(
      `SELECT "quantityOnHand"::text AS quantity, "valueOnHand"::text AS value FROM product_valuation_balances WHERE "productId" = $1`,
      [productId],
    );
    expect(balance).toEqual({ quantity: '10.0000', value: '1000.00' });
    const entries = await valuationEntries(order.id);
    expect(
      entries.some(
        (entry: any) =>
          entry.kind === 'decrease_reversal' && entry.value === '500.00',
      ),
    ).toBe(true);
  });

  it('refuses to unfulfil an occurrence with an unvalued stock gap after activation', async () => {
    const product = await seedProduct(ds, categoryId, {
      stockQuantity: 5,
      baseCost: 10,
    });
    productIds.push(product.id);
    await ds.query(
      `INSERT INTO purchase_cost_history ("productId", "unitCost", "shippingPerUnit", "landedCost", "receivedQuantity", "remainingQuantity", "receivedDate") VALUES ($1, 10, 0, 10, 3, 3, '2025-01-01')`,
      [product.id],
    );
    const order = await createOrder([{ productId: product.id, quantity: 5 }]);
    await fulfill(order.id);
    await seedActive(product.id, 'AVERAGE', '0', '0');
    await unfulfill(order.id)
      .expect(409)
      .expect(({ body }) => expect(body.message).toBe(UNFULFILL_VALUATION_GAP));
  });
});
