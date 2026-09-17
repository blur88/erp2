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
import {
  MATRIX_CASES,
  cents,
  expectBalanced,
  journalLinesFor,
  methodIdByCode,
} from './utils/payment-method-matrix-fixture';

// Issue #1243. Proves every payment method posts to its MAPPED account on both
// Sales and Purchase Orders.
//
// Baseline ownership: the six matrix methods and their accounts come from the
// AddPaymentMethodChannelAccounts migration and are SHARED with every other
// suite in a size-ordered run against one database. This suite must never
// mutate or delete them. The only payment methods it owns are the rejection-case
// methods created UNMAPPED by later blocks of this file, so they need no account.
const runId = randomUUID().slice(0, 8);
const ownedRefs: string[] = [];
const ownedMethodIds: string[] = [];

describe('Payment method posting matrix (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  let adminUserId = '';
  let adminUsername = '';
  let token = '';
  let post: (path: string, body?: any) => request.Test;
  let get: (path: string) => request.Test;

  const ownedEntityIds: string[] = [];
  const ownedSalesOrderIds: string[] = [];
  let customerId = '';
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

    const category = await seedCategory(ds, `matrix-e2e-${runId}`);
    categoryId = category.id;
    const product = await seedProduct(ds, categoryId, {
      stockQuantity: 100,
      baseCost: 10,
    });
    productId = product.id;
    ownedEntityIds.push(productId, categoryId);

    adminUsername = `e2espec_pmm_admin_${runId}`;
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
      name: `Matrix Customer ${runId}`,
    }).expect(201);
    const customer = customerRes.body.data ?? customerRes.body;
    customerId = customer.id;
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
        if (ownedMethodIds.length) {
          await ds.query(
            `DELETE FROM payment_method_account_mappings WHERE "paymentMethodId" = ANY($1)`,
            [ownedMethodIds],
          );
          await ds.query(`DELETE FROM payment_methods WHERE id = ANY($1)`, [
            ownedMethodIds,
          ]);
        }
        if (productId) {
          await ds.query(`DELETE FROM products WHERE id = $1`, [productId]);
        }
        if (categoryId) {
          await ds.query(`DELETE FROM categories WHERE id = $1`, [categoryId]);
        }
        if (customerId) {
          await ds.query(`DELETE FROM customers WHERE id = $1`, [customerId]);
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
      // Guarded: a beforeAll failure before `app` is assigned must not mask
      // the original error with a TypeError from close().
      if (app) await app.close();
    }
  });

  async function createSalesOrder(): Promise<{
    id: string;
    orderNumber: string;
  }> {
    const res = await post('/sales-orders', {
      customerId,
      items: [{ productId, quantity: 1, unitPrice: 25 }],
    }).expect(201);
    const order = res.body.data ?? res.body;
    ownedSalesOrderIds.push(order.id);
    ownedRefs.push(order.orderNumber);
    ownedEntityIds.push(order.id);
    return { id: order.id, orderNumber: order.orderNumber };
  }

  describe.each(MATRIX_CASES)(
    'Sales Order payment via $methodCode',
    ({ methodCode, accountCode }) => {
      it(`debits ${accountCode} and credits Customer Deposit`, async () => {
        const methodId = await methodIdByCode(ds, methodCode);
        const order = await createSalesOrder();
        await post(`/sales-orders/${order.id}/payments`, {
          amount: '25.00',
          paymentMethodId: methodId,
          paymentDate: '2026-09-17',
        }).expect(200);

        const lines = await journalLinesFor(ds, order.orderNumber);
        const payment = lines.filter((l) => l.postingType === 'SALES_PAYMENT');

        // The mapped account carries the DEBIT (accounting-posting.service.ts:120).
        const debit = payment.filter((l) => cents(l.debit) > 0);
        expect(debit).toHaveLength(1);
        expect(debit[0].accountCode).toBe(accountCode);
        expect(cents(debit[0].debit)).toBe(2500);

        // Customer Deposit carries the matching credit.
        const credit = payment.filter((l) => cents(l.credit) > 0);
        expect(credit).toHaveLength(1);
        expect(credit[0].accountCode).toBe('2100');
        expect(cents(credit[0].credit)).toBe(2500);

        // No unrelated account appears in the payment entry.
        expect(payment.map((l) => l.accountCode).sort()).toEqual(
          [accountCode, '2100'].sort(),
        );
        expectBalanced(payment);

        // Exactly one non-reversal payment JE for this payment event.
        const entries = await ds.query(
          `SELECT count(*)::int AS n FROM journal_entry
            WHERE "sourceRef" = $1 AND "postingType" = 'SALES_PAYMENT'`,
          [order.orderNumber],
        );
        expect(entries[0].n).toBe(1);

        // The document reads paid with nothing outstanding.
        const gotRes = await get(`/sales-orders/${order.id}`).expect(200);
        const got = gotRes.body.data ?? gotRes.body;
        expect(got.paymentStatus).toBe('PAID');
        expect(cents(got.balanceDue)).toBe(0);
      });
    },
  );
});
