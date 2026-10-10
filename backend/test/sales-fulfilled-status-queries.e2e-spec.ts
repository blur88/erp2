import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { Customer, CustomerType } from '../src/database/entities/customer.entity';
import { PaymentMethodEntity } from '../src/database/entities/payment-method.entity';
import { Product } from '../src/database/entities/product.entity';
import {
  SalesOrder,
  SalesOrderPaymentStatus,
  SalesOrderStatus,
} from '../src/database/entities/sales-order.entity';
import { DiscountType, SalesOrderItem } from '../src/database/entities/sales-order-item.entity';
import { recalculateCustomerMetrics } from '../src/modules/sales/services/customer-metrics';
import { SalesOrderFulfillmentService } from '../src/modules/sales/services/sales-order-fulfillment.service';
import { SalesOrderPaymentService } from '../src/modules/sales/services/sales-order-payment.service';
import {
  seedCategory,
  seedDocumentNumberSettings,
  seedPaymentMethod,
  seedProduct,
} from './e2e/helpers/seed';
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
 * Issue #1355. `SalesOrder.isFulfilled` is a getter, not a column; used inside
 * a query builder it reaches Postgres as the bare word `order` and the query
 * fails. The unit specs mock the query builder, so only a suite that executes
 * the SQL can see it. Every query here runs against Postgres.
 *
 * Expected values are written out by hand from the fixture below, never
 * computed by the SQL under test.
 */
describe('Fulfilled-status queries and customer metrics (#1355, e2e)', () => {
  const USERNAME = E2E_ADMIN_USERNAMES.fulfilledMetrics;
  const run = `${process.pid}-${Date.now().toString(36)}`;
  const RANGE = 'startDate=2026-01-01&endDate=2026-03-31';

  let app: INestApplication;
  let ds: DataSource;
  let token: string;
  let fulfillment: SalesOrderFulfillmentService;
  let payment: SalesOrderPaymentService;
  let product: Product;
  let paymentMethod: PaymentMethodEntity;
  let categoryId: string;
  let orderSeq = 0;

  const ownedCustomerIds: string[] = [];
  const ownedSalesOrderIds: string[] = [];

  const get = (url: string) =>
    request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`);
  const post = (url: string) =>
    request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`);

  async function seedCustomer(tag: string, metrics: Partial<Customer> = {}): Promise<Customer> {
    const repo = ds.getRepository(Customer);
    const customer = await repo.save(
      repo.create({
        type: CustomerType.BUSINESS,
        name: `Fulfilled Metrics ${tag} ${run}`,
        isActive: true,
        ...metrics,
      }),
    );
    ownedCustomerIds.push(customer.id);
    return customer;
  }

  /** Rows written directly: the read queries only need the stored state. */
  async function seedOrder(
    customerId: string,
    status: SalesOrderStatus,
    orderDate: string,
    total: string,
  ): Promise<SalesOrder> {
    const repo = ds.getRepository(SalesOrder);
    const paid = status === SalesOrderStatus.FULFILLED || status === SalesOrderStatus.READY;
    const order = await repo.save(
      repo.create({
        orderNumber: `SO-FM-${run}-${++orderSeq}`.slice(0, 30),
        orderDate: orderDate as any,
        customerId,
        status,
        paymentStatus: paid ? SalesOrderPaymentStatus.PAID : SalesOrderPaymentStatus.UNPAID,
        subtotal: Number(total),
        shippingAmount: 0,
        totalAmount: total,
        paidAmount: paid ? total : '0.0000',
        balanceDue: paid ? '0.0000' : total,
      }),
    );
    ownedSalesOrderIds.push(order.id);
    return order;
  }

  /** A READY order built through the payment service, so fulfilment can run. */
  async function seedReadyOrder(customerId: string, orderDate: string, qty: number) {
    const total = `${qty * 100}.0000`;
    const repo = ds.getRepository(SalesOrder);
    const order = await repo.save(
      repo.create({
        orderNumber: `SO-FM-${run}-${++orderSeq}`.slice(0, 30),
        orderDate: orderDate as any,
        customerId,
        status: SalesOrderStatus.DRAFT,
        paymentStatus: SalesOrderPaymentStatus.UNPAID,
        subtotal: qty * 100,
        shippingAmount: 0,
        totalAmount: total,
        paidAmount: '0.0000',
        balanceDue: total,
      }),
    );
    ownedSalesOrderIds.push(order.id);
    const itemRepo = ds.getRepository(SalesOrderItem);
    await itemRepo.save(
      itemRepo.create({
        lineNumber: 1,
        salesOrderId: order.id,
        productId: product.id,
        quantity: qty,
        unitPrice: 100,
        unitCost: 100,
        discountType: DiscountType.PERCENTAGE,
        discountPercent: 0,
        discountAmount: 0,
        totalAmount: qty * 100,
      }),
    );
    await payment.recordPayment(order.id, {
      paymentMethodId: paymentMethod.id,
      amount: total,
      paymentDate: new Date(),
    } as any);
    return order;
  }

  /** The four stored metrics, with the dates as calendar days in the session zone. */
  async function storedMetrics(customerId: string) {
    const [row] = await ds.query(
      `SELECT "totalOrders", "totalSales",
              to_char("firstPurchaseDate", 'YYYY-MM-DD') AS first,
              to_char("lastPurchaseDate", 'YYYY-MM-DD') AS last
         FROM customers WHERE id = $1`,
      [customerId],
    );
    return {
      totalOrders: row.totalOrders,
      totalSales: row.totalSales,
      first: row.first,
      last: row.last,
    };
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
    payment = app.get(SalesOrderPaymentService);

    await seedSuiteAdmin(ds, USERNAME);
    const category = await seedCategory(ds, `fulfilled-metrics-${run}`);
    categoryId = category.id;
    product = await seedProduct(ds, category.id, { baseCost: 100, stockQuantity: 1000 });
    paymentMethod = await seedPaymentMethod(ds);
    await seedDocumentNumberSettings(ds);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .set(...SESSION_PROTOCOL)
      .send({ usernameOrEmail: USERNAME, password: E2E_ADMIN_PASSWORD })
      .expect(200);
    token = login.body?.data?.accessToken ?? login.body?.accessToken;
    expect(token).toBeTruthy();
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      const idsOr = (ids: string[]) =>
        ids.length ? ids : ['00000000-0000-0000-0000-000000000000'];
      const paymentRowIds: string[] = (
        await ds.query(`SELECT id FROM sales_order_payments WHERE "salesOrderId" = ANY($1)`, [
          idsOr(ownedSalesOrderIds),
        ])
      ).map((r: { id: string }) => r.id);
      const journalIds: string[] = (
        await ds.query(
          `SELECT id FROM journal_entry WHERE "sourceDocumentId" = ANY($1) OR "sourceEventId" = ANY($2)`,
          [idsOr(ownedSalesOrderIds), idsOr(paymentRowIds)],
        )
      ).map((r: { id: string }) => r.id);
      const adminRows: { id: string }[] = await ds.query(
        `SELECT id FROM users WHERE username = $1`,
        [USERNAME],
      );
      await removeSuiteTraces(ds, {
        userIds: adminRows.map((r) => r.id),
        usernames: [USERNAME],
        entityIds: [
          categoryId,
          product.id,
          ...ownedCustomerIds,
          ...ownedSalesOrderIds,
          ...paymentRowIds,
          ...journalIds,
        ],
      });
      await ds.query(`DELETE FROM journal_entry WHERE id = ANY($1)`, [idsOr(journalIds)]);
      await resetSuiteBusinessRows(ds, {
        categoryIds: [categoryId],
        customerIds: ownedCustomerIds,
      });
      // 'Goods Received' is inserted by seedDocumentNumberSettings and is not
      // in the baseline; 'Purchase Orders' is, and is left alone.
      await ds.query(
        `DELETE FROM document_number_settings WHERE "documentName" = 'Goods Received'`,
      );
      await removeSuiteAdmin(ds, USERNAME);
    }
    await app.close();
  });

  describe('read queries', () => {
    let mixed: Customer;
    let none: Customer;

    beforeAll(async () => {
      // Two fulfilled orders (100 + 250.50) and one each of the other statuses.
      mixed = await seedCustomer('mixed');
      await seedOrder(mixed.id, SalesOrderStatus.FULFILLED, '2026-01-05', '100.0000');
      await seedOrder(mixed.id, SalesOrderStatus.FULFILLED, '2026-03-10', '250.5000');
      await seedOrder(mixed.id, SalesOrderStatus.DRAFT, '2026-02-01', '40.0000');
      await seedOrder(mixed.id, SalesOrderStatus.READY, '2026-02-02', '60.0000');
      await seedOrder(mixed.id, SalesOrderStatus.CANCELLED, '2026-02-03', '70.0000');

      none = await seedCustomer('none');
      await seedOrder(none.id, SalesOrderStatus.DRAFT, '2026-02-04', '999.0000');
    });

    it('dashboard counts fulfilled and not-fulfilled orders (calculateSalesMetrics)', async () => {
      const res = await get(`/sales/analytics/dashboard?${RANGE}&customerId=${mixed.id}`).expect(
        200,
      );
      const m = res.body.current.metrics;
      expect(m.totalOrders).toBe(5);
      expect(m.totalRevenue).toBe(520.5);
      expect(m.completedOrders).toBe(2);
      // Not fulfilled, which today includes DRAFT and CANCELLED (kept as is).
      expect(m.confirmedOrders).toBe(3);
      expect(m.draftOrders).toBe(0);
    });

    it('dashboard fulfillmentStatus=fulfilled keeps only fulfilled orders (applySalesOrderFilters)', async () => {
      const res = await get(
        `/sales/analytics/dashboard?${RANGE}&customerId=${mixed.id}&fulfillmentStatus=fulfilled`,
      ).expect(200);
      expect(res.body.current.metrics.totalOrders).toBe(2);
      expect(res.body.current.metrics.totalRevenue).toBe(350.5);
    });

    it('dashboard fulfillmentStatus=unfulfilled keeps every other status', async () => {
      const res = await get(
        `/sales/analytics/dashboard?${RANGE}&customerId=${mixed.id}&fulfillmentStatus=unfulfilled`,
      ).expect(200);
      expect(res.body.current.metrics.totalOrders).toBe(3);
      expect(res.body.current.metrics.totalRevenue).toBe(170);
    });

    it('pipeline groups into fulfilled and pending (getSalesPipeline)', async () => {
      const res = await get(`/sales/analytics/pipeline?${RANGE}&customerId=${mixed.id}`).expect(
        200,
      );
      const byStatus = Object.fromEntries(res.body.stages.map((s: any) => [s.status, s]));
      expect(Object.keys(byStatus).sort()).toEqual(['fulfilled', 'pending']);
      expect(byStatus.fulfilled).toMatchObject({
        statusLabel: 'Fulfilled',
        orderCount: 2,
        totalValue: 350.5,
        percentage: 40,
      });
      expect(byStatus.pending).toMatchObject({
        statusLabel: 'Pending Fulfillment',
        orderCount: 3,
        totalValue: 170,
        percentage: 60,
      });
      expect(res.body.totalOrders).toBe(5);
      expect(res.body.conversionRate).toBe(40);
    });

    it('customer statistics count fulfilled orders only (getCustomerStatistics)', async () => {
      const res = await get(`/customers/${mixed.id}/statistics`).expect(200);
      expect(res.body.orders.totalOrders).toBe(2);
      expect(res.body.orders.totalSales).toBe(350.5);
      expect(res.body.orders.averageOrderValue).toBe(175.25);
      // MIN/MAX of a `date` column reach the response as an instant: the driver
      // parses a raw aggregate as local midnight. Asserted as it is; whether
      // this route should return a calendar date instead is not decided here.
      expect(new Date(res.body.orders.firstOrderDate).getTime()).toBe(
        new Date(2026, 0, 5).getTime(),
      );
      expect(new Date(res.body.orders.lastOrderDate).getTime()).toBe(
        new Date(2026, 2, 10).getTime(),
      );
    });

    it('customer statistics are zero and null with no fulfilled order', async () => {
      const res = await get(`/customers/${none.id}/statistics`).expect(200);
      expect(res.body.orders).toEqual({
        totalOrders: 0,
        totalSales: 0,
        averageOrderValue: 0,
        firstOrderDate: null,
        lastOrderDate: null,
      });
    });

    it('update-metrics stores all four metrics from fulfilled orders (updateCustomerMetrics)', async () => {
      await post(`/customers/${mixed.id}/update-metrics`).expect(201);
      expect(await storedMetrics(mixed.id)).toEqual({
        totalOrders: 2,
        totalSales: '350.5000',
        first: '2026-01-05',
        last: '2026-03-10',
      });
    });

    it('update-metrics resets a customer with no fulfilled order', async () => {
      const stale = await seedCustomer('stale', {
        totalOrders: 7,
        totalSales: 1234.5 as any,
        firstPurchaseDate: new Date('2025-01-01T00:00:00Z'),
        lastPurchaseDate: new Date('2025-06-01T00:00:00Z'),
      });
      await seedOrder(stale.id, SalesOrderStatus.CANCELLED, '2026-02-05', '55.0000');
      await post(`/customers/${stale.id}/update-metrics`).expect(201);
      expect(await storedMetrics(stale.id)).toEqual({
        totalOrders: 0,
        totalSales: '0.0000',
        first: null,
        last: null,
      });
    });
  });

  describe('metrics follow fulfil and unfulfil', () => {
    it('fulfil adds the order; unfulfil removes it; the last unfulfil resets', async () => {
      const customer = await seedCustomer('lifecycle');
      const early = await seedReadyOrder(customer.id, '2026-01-05', 1); // 100
      const late = await seedReadyOrder(customer.id, '2026-03-10', 2); // 200

      // Paying an order does not count it.
      expect(await storedMetrics(customer.id)).toEqual({
        totalOrders: 0,
        totalSales: '0.0000',
        first: null,
        last: null,
      });

      await fulfillment.fulfillOrder(late.id);
      expect(await storedMetrics(customer.id)).toEqual({
        totalOrders: 1,
        totalSales: '200.0000',
        first: '2026-03-10',
        last: '2026-03-10',
      });

      await fulfillment.fulfillOrder(early.id);
      expect(await storedMetrics(customer.id)).toEqual({
        totalOrders: 2,
        totalSales: '300.0000',
        first: '2026-01-05',
        last: '2026-03-10',
      });

      await fulfillment.unfulfillOrder(late.id);
      expect(await storedMetrics(customer.id)).toEqual({
        totalOrders: 1,
        totalSales: '100.0000',
        first: '2026-01-05',
        last: '2026-01-05',
      });

      await fulfillment.unfulfillOrder(early.id);
      expect(await storedMetrics(customer.id)).toEqual({
        totalOrders: 0,
        totalSales: '0.0000',
        first: null,
        last: null,
      });
    });

    it('two orders of one customer fulfilled at once are both counted', async () => {
      // End to end only. These queue on the shared product's stock lock, so this
      // passes without the customer lock; the next test is the one that needs it.
      const customer = await seedCustomer('concurrent');
      const orders = [
        await seedReadyOrder(customer.id, '2026-01-05', 1),
        await seedReadyOrder(customer.id, '2026-02-06', 2),
        await seedReadyOrder(customer.id, '2026-03-10', 3),
        await seedReadyOrder(customer.id, '2026-03-11', 4),
      ];
      await Promise.all(orders.map((o) => fulfillment.fulfillOrder(o.id)));
      expect(await storedMetrics(customer.id)).toEqual({
        totalOrders: 4,
        totalSales: '1000.0000',
        first: '2026-01-05',
        last: '2026-03-11',
      });
    });

    it('a second transaction waits for the first, then counts its order', async () => {
      // The fulfilment service cannot show this: its transactions already queue
      // on the product's stock lock. Two hand-driven transactions interleave the
      // way two fulfilments of different products would.
      const customer = await seedCustomer('interleaved');
      const first = await seedOrder(customer.id, SalesOrderStatus.READY, '2026-01-05', '100.0000');
      const second = await seedOrder(customer.id, SalesOrderStatus.READY, '2026-03-10', '200.0000');

      const a = ds.createQueryRunner();
      const b = ds.createQueryRunner();
      await a.connect();
      await b.connect();
      try {
        await a.startTransaction();
        await b.startTransaction();
        const fulfil = (id: string) =>
          `UPDATE sales_orders SET status = 'FULFILLED' WHERE id = '${id}'`;
        await a.query(fulfil(first.id));
        await b.query(fulfil(second.id));

        await recalculateCustomerMetrics(a.manager, customer.id);

        let bDone = false;
        const bRecalculation = recalculateCustomerMetrics(b.manager, customer.id).then(() => {
          bDone = true;
        });
        await new Promise((resolve) => setTimeout(resolve, 500));
        expect(bDone).toBe(false);

        await a.commitTransaction();
        await bRecalculation;
        await b.commitTransaction();
      } finally {
        if (a.isTransactionActive) await a.rollbackTransaction();
        if (b.isTransactionActive) await b.rollbackTransaction();
        await a.release();
        await b.release();
      }

      expect(await storedMetrics(customer.id)).toEqual({
        totalOrders: 2,
        totalSales: '300.0000',
        first: '2026-01-05',
        last: '2026-03-10',
      });
    });

    it('a fulfilment that rolls back leaves the metrics untouched', async () => {
      const customer = await seedCustomer('rollback');
      const kept = await seedReadyOrder(customer.id, '2026-01-05', 1);
      await fulfillment.fulfillOrder(kept.id);
      // 2000 units against 1000 in stock: refused, nothing committed.
      const short = await seedReadyOrder(customer.id, '2026-03-10', 2000);
      await expect(fulfillment.fulfillOrder(short.id)).rejects.toThrow(/out of stock/i);
      expect(await storedMetrics(customer.id)).toEqual({
        totalOrders: 1,
        totalSales: '100.0000',
        first: '2026-01-05',
        last: '2026-01-05',
      });
    });
  });
});
