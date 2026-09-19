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

// Issue #1245. Proves the overpayment guard holds under concurrency: the row
// lock is taken before the persisted-net read, so a loser re-reads the winner's
// committed payment in its own transaction and is rejected.
const runId = randomUUID().slice(0, 8);

describe('Concurrent payments cannot jointly exceed the order total (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  let adminUserId = '';
  let adminUsername = '';
  let token = '';
  let post: (path: string, body?: any) => request.Test;
  let get: (path: string) => request.Test;

  const ownedEntityIds: string[] = [];
  const ownedSalesOrderIds: string[] = [];
  const ownedPurchaseOrderIds: string[] = [];
  const ownedRefs: string[] = [];
  let customerId = '';
  let supplierId = '';
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

    const category = await seedCategory(ds, `oconc-e2e-${runId}`);
    categoryId = category.id;
    const product = await seedProduct(ds, categoryId, {
      stockQuantity: 100,
      baseCost: 10,
    });
    productId = product.id;
    ownedEntityIds.push(productId, categoryId);

    adminUsername = `e2espec_oconc_admin_${runId}`;
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
    get = (path: string) => auth(request(server).get(path));

    const customerRes = await post('/customers', {
      type: 'business',
      name: `Concurrency Customer ${runId}`,
    }).expect(201);
    const customer = customerRes.body.data ?? customerRes.body;
    customerId = customer.id;
    ownedEntityIds.push(customerId);

    const supplierRes = await post('/purchasing/suppliers', {
      type: 'local',
      companyName: `Concurrency Supplier ${runId}`,
    }).expect(201);
    const supplier = supplierRes.body.data ?? supplierRes.body;
    supplierId = supplier.id;
    ownedEntityIds.push(supplierId);
  });

  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        if (ownedRefs.length) {
          await ds.query(
            `DELETE FROM journal_entry_line WHERE "entryId" IN (SELECT id FROM journal_entry WHERE "sourceRef" = ANY($1))`,
            [ownedRefs],
          );
          await ds.query(
            `DELETE FROM journal_entry WHERE "sourceRef" = ANY($1)`,
            [ownedRefs],
          );
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
        if (ownedPurchaseOrderIds.length) {
          await ds.query(
            `DELETE FROM vendor_payments WHERE "purchaseOrderId" = ANY($1)`,
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
          // stock_movements.productId -> products is ON DELETE RESTRICT.
          await ds.query(`DELETE FROM stock_movements WHERE "productId" = $1`, [
            productId,
          ]);
          await ds.query(`DELETE FROM products WHERE id = $1`, [productId]);
        }
        if (categoryId) {
          await ds.query(`DELETE FROM categories WHERE id = $1`, [categoryId]);
        }
        if (customerId) {
          await ds.query(`DELETE FROM customers WHERE id = $1`, [customerId]);
        }
        if (supplierId) {
          await ds.query(`DELETE FROM suppliers WHERE id = $1`, [supplierId]);
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

  async function createSalesOrderWithTotal(total: string): Promise<{
    id: string;
    orderNumber: string;
  }> {
    const res = await post('/sales-orders', {
      customerId,
      items: [{ productId, quantity: 1, unitPrice: Number(total) }],
    }).expect(201);
    const order = res.body.data ?? res.body;
    ownedSalesOrderIds.push(order.id);
    ownedRefs.push(order.orderNumber);
    ownedEntityIds.push(order.id);
    return { id: order.id, orderNumber: order.orderNumber };
  }

  async function createPurchaseOrderWithTotal(total: string): Promise<{
    id: string;
    orderNumber: string;
  }> {
    const res = await post('/purchasing/orders', {
      supplierId,
      orderDate: '2026-09-17',
      items: [{ productId, quantity: 1, unitPrice: Number(total) }],
    }).expect(201);
    const order = res.body.data ?? res.body;
    ownedPurchaseOrderIds.push(order.id);
    ownedRefs.push(order.orderNumber);
    ownedEntityIds.push(order.id);
    return { id: order.id, orderNumber: order.orderNumber };
  }

  // Two payments of 60.00 against an unpaid order totalling 100.00.
  //
  // The winner leaves the order SHORT of its total, so it stays DRAFT. That is
  // what forces the loser through the balance guard. A fixture whose winner
  // fully pays promotes the order to READY, and the loser then trips the
  // PRE-EXISTING status check (sales-order-payment.service.ts:88,
  // ConflictException => 409) before ever reaching the new guard — a test that
  // passes while proving nothing. Assert 400 specifically, never merely
  // non-2xx, so that substitution cannot hide.
  it('sales order: two concurrent 60.00 payments against a 100.00 total — exactly one succeeds', async () => {
    const order = await createSalesOrderWithTotal('100.00');
    const methodId = await methodIdByCode(ds, 'CASH');
    const body = { amount: '60.00', paymentMethodId: methodId, paymentDate: '2026-09-17' };

    const results = await Promise.all([
      post(`/sales-orders/${order.id}/payments`, body),
      post(`/sales-orders/${order.id}/payments`, body),
    ]);

    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 400]);

    const gotRes = await get(`/sales-orders/${order.id}`).expect(200);
    const got = gotRes.body.data ?? gotRes.body;
    expect(cents(got.paidAmount)).toBe(6000);
    expect(got.paymentStatus).toBe('PARTIAL');
    expect(got.paymentStatus).not.toBe('OVERPAID');
  });

  it('purchase order: two concurrent 60.00 payments against a 100.00 total — exactly one succeeds', async () => {
    const order = await createPurchaseOrderWithTotal('100.00');
    const methodId = await methodIdByCode(ds, 'CASH');
    const body = {
      payments: [{ amount: '60.00', paymentMethodId: methodId, paymentDate: '2026-09-17' }],
    };

    const results = await Promise.all([
      post(`/purchasing/orders/${order.id}/payments`, body),
      post(`/purchasing/orders/${order.id}/payments`, body),
    ]);

    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 400]);

    const gotRes = await get(`/purchasing/orders/${order.id}`).expect(200);
    const got = gotRes.body.data ?? gotRes.body;
    expect(cents(got.paidAmount)).toBe(6000);
    expect(got.paymentStatus).toBe('PARTIAL');
    expect(got.paymentStatus).not.toBe('OVERPAID');
  });
});
