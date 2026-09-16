import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { seedCategory, seedProduct, seedPaymentMethod } from './e2e/helpers/seed';
import {
  E2E_ADMIN_USERNAMES,
  E2E_ADMIN_PASSWORD,
  seedSuiteAdmin,
  removeSuiteAdmin,
} from './utils/shared-e2e-fixture';
import { resetSuiteBusinessRows } from './utils/shared-e2e-business-fixture';
import { removeSuiteTraces } from './utils/shared-e2e-traces-fixture';
import { configureTestAppValidation } from './utils/configure-test-app-validation';
import { toMinorUnits } from '../src/common/utils/money';

/**
 * Cross-module precision reconciliation (#1241).
 *
 * A document, its payment, its journal entry and the cost subledger must agree
 * at cent precision. These tests drive the real HTTP API and then read the
 * persisted rows directly, because the point is agreement between surfaces,
 * not the shape of any one response DTO.
 */
describe('precision reconciliation (#1241)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let accessToken: string;
  let customerId: string;
  let supplierId: string;
  let productId: string;
  let paymentMethodId: string;
  let seededCategoryId: string;
  const ownedOrderIds: string[] = [];
  const ownedPoIds: string[] = [];

  const auth = () => ({ Authorization: `Bearer ${accessToken}` });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();

    dataSource = app.get(DataSource);
    await seedSuiteAdmin(dataSource, E2E_ADMIN_USERNAMES.precision);
    const category = await seedCategory(dataSource, `precision-e2e-${Date.now()}`);
    seededCategoryId = category.id;
    const product = await seedProduct(dataSource, category.id, {
      stockQuantity: 0,
      baseCost: 10,
    });
    productId = product.id;
    const pm = await seedPaymentMethod(dataSource);
    paymentMethodId = pm.id;

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        usernameOrEmail: E2E_ADMIN_USERNAMES.precision,
        password: E2E_ADMIN_PASSWORD,
      });
    accessToken = loginRes.body.accessToken;

    const customerRes = await request(app.getHttpServer())
      .post('/customers')
      .set(auth())
      .send({ type: 'business', name: 'Precision Customer' })
      .expect(201);
    customerId = (customerRes.body.data ?? customerRes.body).id;

    const supplierRes = await request(app.getHttpServer())
      .post('/purchasing/suppliers')
      .set(auth())
      .send({ type: 'local', companyName: 'Precision Supplier' })
      .expect(201);
    supplierId = (supplierRes.body.data ?? supplierRes.body).id;
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      const ownedPaymentIds: string[] = [];
      if (ownedOrderIds.length) {
        const rows = await dataSource.query(
          `SELECT id FROM sales_order_payments WHERE "salesOrderId" = ANY($1)`,
          [ownedOrderIds],
        );
        ownedPaymentIds.push(...rows.map((r: { id: string }) => r.id));
      }
      const ownedVendorPaymentIds: string[] = [];
      if (ownedPoIds.length) {
        const rows = await dataSource.query(
          `SELECT id FROM vendor_payments WHERE "purchaseOrderId" = ANY($1)`,
          [ownedPoIds],
        );
        ownedVendorPaymentIds.push(...rows.map((r: { id: string }) => r.id));
      }

      const documentIds = [...ownedOrderIds, ...ownedPoIds];
      const eventIds = [...ownedPaymentIds, ...ownedVendorPaymentIds];
      if (documentIds.length || eventIds.length) {
        await dataSource.query(
          `DELETE FROM journal_entry WHERE "sourceDocumentId" = ANY($1) OR "sourceEventId" = ANY($2)`,
          [
            documentIds.length ? documentIds : ['00000000-0000-0000-0000-000000000000'],
            eventIds.length ? eventIds : ['00000000-0000-0000-0000-000000000000'],
          ],
        );
      }

      await resetSuiteBusinessRows(dataSource, {
        categoryIds: [seededCategoryId],
        customerIds: customerId ? [customerId] : [],
        supplierIds: supplierId ? [supplierId] : [],
      });

      const adminRows: { id: string }[] = await dataSource.query(
        `SELECT id FROM users WHERE username = $1`,
        [E2E_ADMIN_USERNAMES.precision],
      );
      await removeSuiteTraces(dataSource, {
        userIds: adminRows.map((r) => r.id),
        usernames: [E2E_ADMIN_USERNAMES.precision],
        entityIds: [
          ...(customerId ? [customerId] : []),
          ...(supplierId ? [supplierId] : []),
          ...ownedOrderIds,
          ...ownedPoIds,
          ...ownedPaymentIds,
          ...ownedVendorPaymentIds,
          ...(productId ? [productId] : []),
        ],
      });
      await removeSuiteAdmin(dataSource, E2E_ADMIN_USERNAMES.precision);
      await dataSource.destroy();
    }
    await app.close();
  });

  async function createOrder(body: Record<string, unknown>) {
    const res = await request(app.getHttpServer())
      .post('/sales-orders')
      .set(auth())
      .send(body)
      .expect(201);
    const order = res.body.data ?? res.body;
    ownedOrderIds.push(order.id);
    return order;
  }

  async function journalLinesFor(sourceDocumentId: string) {
    return dataSource.query(
      `SELECT l.debit, l.credit
         FROM journal_entry_line l
         JOIN journal_entry e ON e.id = l."entryId"
        WHERE e."sourceDocumentId" = $1`,
      [sourceDocumentId],
    ) as Promise<{ debit: string; credit: string }[]>;
  }

  function assertBalancedAtCents(lines: { debit: string; credit: string }[]) {
    const debit = lines.reduce((sum, l) => sum + toMinorUnits(l.debit), 0n);
    const credit = lines.reduce((sum, l) => sum + toMinorUnits(l.credit), 0n);
    expect(debit).toBe(credit);
    for (const line of lines) {
      expect(toMinorUnits(line.debit) % 100n).toBe(0n);
      expect(toMinorUnits(line.credit) % 100n).toBe(0n);
    }
  }

  it('reconciles a sales order, its payment, and its journal entry', async () => {
    // RM100 line less a RM3 line discount -> RM97 order, RM97 payment
    const order = await createOrder({
      customerId,
      items: [{ productId, quantity: 1, unitPrice: 100, discountType: 'amount', discountAmount: 3 }],
    });
    expect(order.totalAmount).toBe('97.0000');

    await request(app.getHttpServer())
      .post(`/sales-orders/${order.id}/payments`)
      .set(auth())
      .send({ paymentMethodId, amount: '97.00', paymentDate: '2026-09-17' })
      .expect(200);

    const paymentsRes = await request(app.getHttpServer())
      .get(`/sales-orders/${order.id}/payments`)
      .set(auth())
      .expect(200);
    const payments = paymentsRes.body.data ?? paymentsRes.body;
    expect(payments[0].amount).toBe('97.0000');

    assertBalancedAtCents(await journalLinesFor(order.id));
  });

  it('rounds each line to cents before summing (three 0.335 lines -> 1.02)', async () => {
    const order = await createOrder({
      customerId,
      items: [
        { productId, quantity: 1, unitPrice: 0.335 },
        { productId, quantity: 1, unitPrice: 0.335 },
        { productId, quantity: 1, unitPrice: 0.335 },
      ],
    });

    expect(order.subtotal).toBe(1.02);
    expect(order.totalAmount).toBe('1.0200');
  });

  it('conserves landed cost across a PO whose shipping does not divide evenly', async () => {
    // RM10 shipping across 3 equally-valued lines; the shares must sum exactly.
    const poRes = await request(app.getHttpServer())
      .post('/purchasing/orders')
      .set(auth())
      .send({
        supplierId,
        orderDate: '2026-09-17',
        shippingAmount: 10,
        items: [
          { productId, quantity: 1, unitPrice: 10 },
          { productId, quantity: 1, unitPrice: 10 },
          { productId, quantity: 1, unitPrice: 10 },
        ],
      })
      .expect(201);
    const po = poRes.body.data ?? poRes.body;
    ownedPoIds.push(po.id);
    expect(po.totalAmount).toBe('40.0000');

    await request(app.getHttpServer())
      .post(`/purchasing/orders/${po.id}/payments`)
      .set(auth())
      .send({
        payments: [{ paymentMethodId, amount: '40.00', paymentDate: '2026-09-17' }],
      })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/purchasing/orders/${po.id}/receive`)
      .set(auth())
      .expect(200);

    const batches: { shippingPerUnit: string; receivedQuantity: string }[] =
      await dataSource.query(
        `SELECT "shippingPerUnit", "receivedQuantity"
           FROM purchase_cost_history
          WHERE "purchaseOrderId" = $1`,
        [po.id],
      );
    expect(batches.length).toBe(3);
    const allocatedMinor = batches.reduce(
      (sum, b) =>
        sum + (toMinorUnits(b.receivedQuantity) * toMinorUnits(b.shippingPerUnit)) / 10000n,
      0n,
    );
    expect(allocatedMinor).toBe(toMinorUnits('10.0000'));

    assertBalancedAtCents(await journalLinesFor(po.id));
  });

  it('reconciles a partial refund to the refundable amount exactly', async () => {
    const order = await createOrder({
      customerId,
      items: [{ productId, quantity: 3, unitPrice: 10 }],
    });
    expect(order.totalAmount).toBe('30.0000');

    await request(app.getHttpServer())
      .post(`/sales-orders/${order.id}/payments`)
      .set(auth())
      .send({ paymentMethodId, amount: '30.00', paymentDate: '2026-09-17' })
      .expect(200);

    const refundRes = await request(app.getHttpServer())
      .post(`/sales-orders/${order.id}/refunds`)
      .set(auth())
      .send({
        refunds: [{ paymentMethodId, amount: '10.00', paymentDate: '2026-09-17' }],
      })
      .expect(201);
    const refunds = refundRes.body.data ?? refundRes.body;
    expect(refunds[0].amount).toBe('-10.0000');

    const orderRes = await request(app.getHttpServer())
      .get(`/sales-orders/${order.id}`)
      .set(auth())
      .expect(200);
    const reconciled = orderRes.body.data ?? orderRes.body;
    expect(reconciled.paidAmount).toBe('20.0000');
    expect(reconciled.balanceDue).toBe('10.0000');

    assertBalancedAtCents(await journalLinesFor(order.id));
  });
}, 120000);
