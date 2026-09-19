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
  const ownedPurchaseOrderIds: string[] = [];
  let customerId = '';
  let supplierId = '';
  let productId = '';
  let categoryId = '';
  let inactiveMethodId = '';
  let noPurchaseMethodId = '';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();
    ds = moduleFixture.get(DataSource);

    // Suite-owned rejection fixtures. Created UNMAPPED, so they need no COA
    // account and perturb no mapping row.
    //
    // These exist so the suite never toggles isActive/useForPurchases on a
    // BASELINE method: those rows are shared with every other suite in a
    // size-ordered run against one database, so mutating them makes this suite's
    // effects order-dependent, and a failure between toggle and restore would
    // leave a baseline method disabled for every suite that follows.
    //
    // Codes must fit the column's varchar(20). "PMMX-INACTIVE-" is already 14
    // characters and "PMMX-NOPURCH-" is 13, so the 8-char runId cannot fit
    // both literally; a 6-char suffix keeps the intended prefixes readable and
    // unique per run while staying inside the limit.
    const fixtureSuffix = runId.slice(0, 6);
    const inactive = await ds.query(
      `INSERT INTO payment_methods (code,name,"sortOrder","useForPurchases","accountingChannel","isActive")
       VALUES ($1,'PMMX Inactive',900,true,'BANK',false) RETURNING id`,
      [`PMMX-INACTIVE-${fixtureSuffix}`],
    );
    inactiveMethodId = inactive[0].id;
    ownedMethodIds.push(inactiveMethodId);

    const noPurch = await ds.query(
      `INSERT INTO payment_methods (code,name,"sortOrder","useForPurchases","accountingChannel")
       VALUES ($1,'PMMX No Purchases',901,false,'BANK') RETURNING id`,
      [`PMMX-NOPURCH-${fixtureSuffix}`],
    );
    noPurchaseMethodId = noPurch[0].id;
    ownedMethodIds.push(noPurchaseMethodId);

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

    const supplierRes = await post('/purchasing/suppliers', {
      type: 'local',
      companyName: `Matrix Supplier ${runId}`,
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
          // stock_movements.productId -> products is ON DELETE RESTRICT
          // (InitialSchema:166), so movements must go first or the product
          // delete fails. The RECEIVED-purchase-order rejection case calls
          // /receive, which posts stock, and this suite creates no movements
          // anywhere else. Same ordering as
          // shared-e2e-business-fixture.ts:199, which documents this FK as the
          // one that blocks.
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

  async function createPurchaseOrder(): Promise<{
    id: string;
    orderNumber: string;
  }> {
    const res = await post('/purchasing/orders', {
      supplierId,
      orderDate: '2026-09-17',
      items: [{ productId, quantity: 1, unitPrice: 25 }],
    }).expect(201);
    const order = res.body.data ?? res.body;
    ownedPurchaseOrderIds.push(order.id);
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

  describe.each(MATRIX_CASES)(
    'Purchase Order payment via $methodCode',
    ({ methodCode, accountCode }) => {
      it(`credits ${accountCode} and debits Supplier Deposit`, async () => {
        const methodId = await methodIdByCode(ds, methodCode);
        const order = await createPurchaseOrder(); // total 25.00
        await post(`/purchasing/orders/${order.id}/payments`, {
          payments: [
            {
              amount: '25.00',
              paymentMethodId: methodId,
              paymentDate: '2026-09-17',
            },
          ],
        }).expect(200);

        const lines = await journalLinesFor(ds, order.orderNumber);
        const payment = lines.filter(
          (l) => l.postingType === 'PURCHASE_PAYMENT',
        );

        // Supplier Deposit carries the DEBIT; the mapped account the CREDIT.
        // This is the INVERSE of the sales side and is asserted from the
        // purchase posting contract (accounting-posting.service.ts:174), not
        // derived from the sales block.
        const debit = payment.filter((l) => cents(l.debit) > 0);
        expect(debit).toHaveLength(1);
        expect(debit[0].accountCode).toBe('1400');
        expect(cents(debit[0].debit)).toBe(2500);

        const credit = payment.filter((l) => cents(l.credit) > 0);
        expect(credit).toHaveLength(1);
        expect(credit[0].accountCode).toBe(accountCode);
        expect(cents(credit[0].credit)).toBe(2500);

        expect(payment.map((l) => l.accountCode).sort()).toEqual(
          [accountCode, '1400'].sort(),
        );
        expectBalanced(payment);

        const entries = await ds.query(
          `SELECT count(*)::int AS n FROM journal_entry
            WHERE "sourceRef" = $1 AND "postingType" = 'PURCHASE_PAYMENT'`,
          [order.orderNumber],
        );
        expect(entries[0].n).toBe(1);

        // The document itself must read fully paid. Asserting only the journal
        // lines would pass even if the payment never reconciled onto the order,
        // which is half the contract.
        //
        // PO has NO balanceDue column (unlike SalesOrder): reconcileOrderState()
        // maintains paidAmount + paymentStatus only
        // (purchase-order.service.ts:1017-1021), and PAID means
        // paidAmount === totalAmount exactly (:231 derivePaymentStatus).
        // Outstanding is therefore total - paid, asserted as zero.
        const got = (
          await get(`/purchasing/orders/${order.id}`).expect(200)
        ).body.data;
        expect(got.paymentStatus).toBe('PAID');
        expect(cents(got.paidAmount)).toBe(cents(got.totalAmount));
        expect(cents(got.totalAmount) - cents(got.paidAmount)).toBe(0);
        expect(cents(got.paidAmount)).toBe(2500);
      });
    },
  );

  // The only tests that REUSE one document across two payment methods. Every
  // other block in this file creates a fresh document per method; these two
  // follow one document through pay -> refund -> re-pay and assert the net
  // movement per account scoped to THIS document's sourceRef. Never a global
  // trial balance and never "everything except my row".
  describe('replacement payment (the only document reused across methods)', () => {
    it('sales order: refunding CIMB and re-paying with Maybank leaves CIMB unfunded', async () => {
      const cimb = await methodIdByCode(ds, 'CIMB');
      const maybank = await methodIdByCode(ds, 'MAYBANK');
      const order = await createSalesOrder();

      await post(`/sales-orders/${order.id}/payments`, {
        amount: '25.00',
        paymentMethodId: cimb,
        paymentDate: '2026-09-17',
      }).expect(200);

      const netFor = async (code: string) => {
        const lines = await journalLinesFor(ds, order.orderNumber);
        return lines
          .filter((l) => l.accountCode === code)
          .reduce((s, l) => s + cents(l.debit) - cents(l.credit), 0);
      };

      // CIMB debit 25.00 from the sales payment (accounting-posting.service.ts:126).
      expect(await netFor('1200')).toBe(2500);

      await post(`/sales-orders/${order.id}/refunds`, {
        refunds: [
          {
            amount: '25.00',
            paymentMethodId: cimb,
            paymentDate: '2026-09-17',
          },
        ],
      }).expect(201);

      // A reversal exists and CIMB is back to where it started.
      const refundEntries = await ds.query(
        `SELECT count(*)::int AS n FROM journal_entry
          WHERE "sourceRef" = $1 AND "postingType" = 'SALES_REFUND'`,
        [order.orderNumber],
      );
      expect(refundEntries[0].n).toBe(1);
      expect(await netFor('1200')).toBe(0);

      // The refund is the exact mirror: 2100 debit, mapped account credit.
      const salesRefund = (await journalLinesFor(ds, order.orderNumber)).filter(
        (l) => l.postingType === 'SALES_REFUND',
      );
      expect(salesRefund.map((l) => l.accountCode).sort()).toEqual(
        ['1200', '2100'].sort(),
      );
      expectBalanced(salesRefund);

      await post(`/sales-orders/${order.id}/payments`, {
        amount: '25.00',
        paymentMethodId: maybank,
        paymentDate: '2026-09-17',
      }).expect(200);

      expect(await netFor('1210')).toBe(2500);
      expect(await netFor('1200')).toBe(0); // no residual on the refunded method

      const gotRes = await get(`/sales-orders/${order.id}`).expect(200);
      const got = gotRes.body.data ?? gotRes.body;
      expect(got.paymentStatus).toBe('PAID');
      expect(cents(got.balanceDue)).toBe(0);
    });

    it('purchase order: refunding CIMB and re-paying with Maybank leaves CIMB unfunded', async () => {
      const cimb = await methodIdByCode(ds, 'CIMB');
      const maybank = await methodIdByCode(ds, 'MAYBANK');
      const order = await createPurchaseOrder();

      await post(`/purchasing/orders/${order.id}/payments`, {
        payments: [
          {
            amount: '25.00',
            paymentMethodId: cimb,
            paymentDate: '2026-09-17',
          },
        ],
      }).expect(200);

      const netFor = async (code: string) => {
        const lines = await journalLinesFor(ds, order.orderNumber);
        return lines
          .filter((l) => l.accountCode === code)
          .reduce((s, l) => s + cents(l.debit) - cents(l.credit), 0);
      };

      // The sign is INVERTED vs the sales side: a PO payment CREDITS the
      // mapped account (accounting-posting.service.ts:179), so the net
      // movement is negative. Not copied from the sales expectations above.
      expect(await netFor('1200')).toBe(-2500);

      // PO refund lines carry no paymentDate field (RefundLineDto), and the
      // route is @HttpCode(OK) on purchase-order.controller.ts:287.
      await post(`/purchasing/orders/${order.id}/refunds`, {
        refunds: [
          {
            amount: '25.00',
            paymentMethodId: cimb,
          },
        ],
      }).expect(200);

      // Exactly one PURCHASE_REFUND JE (accounting-posting.service.ts:188).
      const refundEntries = await ds.query(
        `SELECT count(*)::int AS n FROM journal_entry
          WHERE "sourceRef" = $1 AND "postingType" = 'PURCHASE_REFUND'`,
        [order.orderNumber],
      );
      expect(refundEntries[0].n).toBe(1);
      expect(await netFor('1200')).toBe(0);

      // The refund is the exact mirror: mapped account debit, 1400 credit.
      const purchaseRefund = (
        await journalLinesFor(ds, order.orderNumber)
      ).filter((l) => l.postingType === 'PURCHASE_REFUND');
      expect(purchaseRefund.map((l) => l.accountCode).sort()).toEqual(
        ['1200', '1400'].sort(),
      );
      expectBalanced(purchaseRefund);

      const refundedRes = await get(`/purchasing/orders/${order.id}`).expect(200);
      const refunded = refundedRes.body.data ?? refundedRes.body;
      expect(refunded.paymentStatus).toBe('UNPAID');
      expect(cents(refunded.paidAmount)).toBe(0);

      await post(`/purchasing/orders/${order.id}/payments`, {
        payments: [
          {
            amount: '25.00',
            paymentMethodId: maybank,
            paymentDate: '2026-09-17',
          },
        ],
      }).expect(200);

      expect(await netFor('1210')).toBe(-2500);
      expect(await netFor('1200')).toBe(0); // no residual on the refunded method

      const gotRes = await get(`/purchasing/orders/${order.id}`).expect(200);
      const got = gotRes.body.data ?? gotRes.body;
      expect(got.paymentStatus).toBe('PAID');
      expect(cents(got.paidAmount)).toBe(2500);
    });
  });

  // Every expectation below is derived from the validator or service FIRST
  // (citations in each comment), then confirmed in the run.
  describe('validation and rejection', () => {
    it('rejects a payment amount with more than two decimals', async () => {
      // RecordPaymentDto.amount is /^\d+(\.\d{1,2})?$/ (sales-order.dto.ts:341),
      // so three decimals fail validation before the service is reached.
      const order = await createSalesOrder();
      await post(`/sales-orders/${order.id}/payments`, {
        amount: '25.001',
        paymentMethodId: await methodIdByCode(ds, 'CASH'),
        paymentDate: '2026-09-17',
      }).expect(400);
    });

    // Issue #1245: an overpayment is now REJECTED at the new-payment entry
    // point (sales-order-payment.service.ts, assertWithinTotal). OVERPAID
    // remains reachable by reducing an order total after payment, which this
    // guard deliberately does not touch.
    it('rejects an overpayment, leaving no payment or journal residue', async () => {
      const order = await createSalesOrder(); // total 25.00
      const before = await journalLinesFor(ds, order.orderNumber);

      await post(`/sales-orders/${order.id}/payments`, {
        amount: '25.01',
        paymentMethodId: await methodIdByCode(ds, 'CASH'),
        paymentDate: '2026-09-17',
      }).expect(400);

      const gotRes = await get(`/sales-orders/${order.id}`).expect(200);
      const got = gotRes.body.data ?? gotRes.body;
      expect(got.paymentStatus).toBe('UNPAID');
      expect(cents(got.paidAmount)).toBe(0);
      // balanceDue is only maintained by reconciliation, so an untouched order
      // still carries its create-time default of 0 — an accepted 25.01 payment
      // (the pre-#1245 behavior) would have driven it to -1 instead.
      expect(cents(got.balanceDue)).toBe(0);

      // Rollback evidence: no payment row and no journal lines were persisted.
      const payments = await get(`/sales-orders/${order.id}/payments`).expect(200);
      expect(payments.body.data ?? payments.body).toHaveLength(0);
      expect(await journalLinesFor(ds, order.orderNumber)).toHaveLength(before.length);
    });

    it('accepts a payment exactly equal to the order total', async () => {
      // Boundary companion: proves the guard uses > and not >=, which would
      // otherwise reject every full payment in the app.
      const order = await createSalesOrder(); // total 25.00
      await post(`/sales-orders/${order.id}/payments`, {
        amount: '25.00',
        paymentMethodId: await methodIdByCode(ds, 'CASH'),
        paymentDate: '2026-09-17',
      }).expect(200);

      const gotRes = await get(`/sales-orders/${order.id}`).expect(200);
      const got = gotRes.body.data ?? gotRes.body;
      expect(got.paymentStatus).toBe('PAID');
      expect(cents(got.balanceDue)).toBe(0);
    });

    it('rejects a payment against a cancelled sales order', async () => {
      // recordPayment() throws ConflictException when the locked order is not
      // DRAFT (sales-order-payment.service.ts:88-90); CANCELLED falls under
      // that. The route therefore returns 409, not the 400 the plan sketched.
      const order = await createSalesOrder();
      await post(`/sales-orders/${order.id}/cancel`, {}).expect(200);
      await post(`/sales-orders/${order.id}/payments`, {
        amount: '25.00',
        paymentMethodId: await methodIdByCode(ds, 'CASH'),
        paymentDate: '2026-09-17',
      }).expect(409);
    });

    // Lifecycle-state rejections, one per disallowed state per module.
    //
    // The two modules throw DIFFERENT exception types, so each expectation is
    // derived from its own guard rather than copied across:
    //   SO: ConflictException  -> 409, any non-DRAFT status
    //       (sales-order-payment.service.ts:88-90)
    //   PO: BadRequestException -> 400, CANCELLED or RECEIVED only
    //       (purchase-order.service.ts:888-895)
    //
    // Each asserts NO RESIDUE as well as the status code: a path that wrote its
    // payment row and then failed would also return 4xx, so the row counts are
    // what distinguish a clean rejection from a partial write.
    /**
     * A full CONTENT snapshot of everything a payment attempt could write:
     * the payment rows and the payment journal lines, values included.
     *
     * Deliberately not a row count. A count proves only that nothing was
     * ADDED — it cannot see an existing row whose amount or method was
     * mutated in place, which is exactly what a partially-applied write
     * would look like. Comparing the rows themselves is what makes
     * "unchanged" an assertion rather than a claim.
     *
     * Both halves come back in a total order, so the comparison cannot fail on
     * row order alone: payment rows ORDER BY id here, and journal lines by
     * (entry createdAt, line createdAt, line id) inside journalLinesFor() —
     * the trailing id matters because two lines of one entry share a timestamp.
     */
    async function paymentSnapshot(
      table: 'sales_order_payments' | 'vendor_payments',
      column: 'salesOrderId' | 'purchaseOrderId',
      orderId: string,
      orderNumber: string,
    ): Promise<{ rows: unknown[]; lines: unknown[] }> {
      const rows = await ds.query(
        `SELECT id, amount, "paymentMethodId", "paymentDate"
           FROM "${table}" WHERE "${column}" = $1 ORDER BY id`,
        [orderId],
      );
      const lines = (await journalLinesFor(ds, orderNumber))
        .filter((l) => l.postingType.endsWith('_PAYMENT'))
        .map((l) => ({
          accountCode: l.accountCode,
          debit: l.debit,
          credit: l.credit,
          postingType: l.postingType,
        }));
      return { rows, lines };
    }

    /** Nothing was written at all: no payment rows, no payment journal lines. */
    async function expectNoPaymentResidue(
      table: 'sales_order_payments' | 'vendor_payments',
      column: 'salesOrderId' | 'purchaseOrderId',
      orderId: string,
      orderNumber: string,
    ): Promise<void> {
      const snap = await paymentSnapshot(table, column, orderId, orderNumber);
      expect(snap.rows).toEqual([]);
      expect(snap.lines).toEqual([]);
    }

    it('rejects a payment against a FULFILLED sales order (non-cancelled disallowed state)', async () => {
      // recordPayment() requires DRAFT, so FULFILLED is rejected for the same
      // reason CANCELLED is — this covers the non-cancelled branch of that rule.
      const order = await createSalesOrder();
      await post(`/sales-orders/${order.id}/payments`, {
        amount: '25.00',
        paymentMethodId: await methodIdByCode(ds, 'CASH'),
        paymentDate: '2026-09-17',
      }).expect(200);
      // 201, not 200: @Post(':id/fulfill') declares no @HttpCode override
      // (sales-order.controller.ts:106), so NestJS returns the POST default.
      // The payment routes differ because they set @HttpCode(HttpStatus.OK).
      await post(`/sales-orders/${order.id}/fulfill`, {}).expect(201);

      const before = await paymentSnapshot(
        'sales_order_payments',
        'salesOrderId',
        order.id,
        order.orderNumber,
      );
      expect(before.rows).toHaveLength(1); // guard: the snapshot is not vacuous

      await post(`/sales-orders/${order.id}/payments`, {
        amount: '10.00',
        paymentMethodId: await methodIdByCode(ds, 'CASH'),
        paymentDate: '2026-09-17',
      }).expect(409);

      // The pre-existing payment row AND its journal line are byte-identical:
      // no second payment, and nothing mutated in place.
      const after = await paymentSnapshot(
        'sales_order_payments',
        'salesOrderId',
        order.id,
        order.orderNumber,
      );
      expect(after).toEqual(before);
    });

    it('rejects a payment against a CANCELLED purchase order, leaving no residue', async () => {
      const order = await createPurchaseOrder();
      await post(`/purchasing/orders/${order.id}/cancel`, {}).expect(200);
      await post(`/purchasing/orders/${order.id}/payments`, {
        payments: [
          {
            amount: '25.00',
            paymentMethodId: await methodIdByCode(ds, 'CASH'),
            paymentDate: '2026-09-17',
          },
        ],
      }).expect(400);
      await expectNoPaymentResidue(
        'vendor_payments',
        'purchaseOrderId',
        order.id,
        order.orderNumber,
      );
    });

    it('rejects a SECOND payment against a RECEIVED purchase order', async () => {
      // /receive takes no body and requires READY (purchase-order.controller.ts:184
      // "transitions READY -> RECEIVED"), and it is paying in full that promotes
      // DRAFT -> READY (purchase-order.service.ts:1025). So reaching RECEIVED
      // necessarily means one payment already exists — this case asserts the
      // guard rejects a FURTHER payment, and that the existing row is unharmed.
      const order = await createPurchaseOrder();
      await post(`/purchasing/orders/${order.id}/payments`, {
        payments: [
          {
            amount: '25.00',
            paymentMethodId: await methodIdByCode(ds, 'CASH'),
            paymentDate: '2026-09-17',
          },
        ],
      }).expect(200);
      await post(`/purchasing/orders/${order.id}/receive`, {}).expect(200);

      const before = await paymentSnapshot(
        'vendor_payments',
        'purchaseOrderId',
        order.id,
        order.orderNumber,
      );
      expect(before.rows).toHaveLength(1); // guard: the snapshot is not vacuous

      await post(`/purchasing/orders/${order.id}/payments`, {
        payments: [
          {
            amount: '10.00',
            paymentMethodId: await methodIdByCode(ds, 'CASH'),
            paymentDate: '2026-09-17',
          },
        ],
      }).expect(400);

      // The existing payment row AND its journal line are byte-identical: no
      // second payment, and nothing mutated in place.
      const after = await paymentSnapshot(
        'vendor_payments',
        'purchaseOrderId',
        order.id,
        order.orderNumber,
      );
      expect(after).toEqual(before);
    });

    it('rejects an inactive payment method on a purchase order', async () => {
      // recordOrderPayments() looks the method up by { id, isActive: true }
      // (purchase-order.service.ts:877-880) and throws BadRequestException.
      const order = await createPurchaseOrder();
      await post(`/purchasing/orders/${order.id}/payments`, {
        payments: [
          {
            amount: '25.00',
            paymentMethodId: inactiveMethodId,
            paymentDate: '2026-09-17',
          },
        ],
      }).expect(400);
    });

    // Issue #1246: an active method with useForPurchases=false is now REJECTED
    // on the PO new-payment path, matching expense-payment.service.ts:49.
    // Refunds remain unfiltered (#1096).
    it('rejects a useForPurchases=false method on a purchase order, leaving no residue', async () => {
      const order = await createPurchaseOrder();
      const before = await journalLinesFor(ds, order.orderNumber);

      await post(`/purchasing/orders/${order.id}/payments`, {
        payments: [
          {
            amount: '25.00',
            paymentMethodId: noPurchaseMethodId,
            paymentDate: '2026-09-17',
          },
        ],
      }).expect(400);

      // Rollback evidence: order fields, payment rows AND journal lines are all
      // unchanged. Checking only the status code would let an orphaned payment
      // row or a stray journal line pass unnoticed.
      const gotRes = await get(`/purchasing/orders/${order.id}`).expect(200);
      const got = gotRes.body.data ?? gotRes.body;
      expect(got.paymentStatus).toBe('UNPAID');
      expect(cents(got.paidAmount)).toBe(0);

      const payments = await get(`/purchasing/orders/${order.id}/payments`).expect(200);
      expect(payments.body.data ?? payments.body).toHaveLength(0);
      expect(await journalLinesFor(ds, order.orderNumber)).toHaveLength(before.length);
    });

    it('still accepts an eligible active purchase method on a purchase order', async () => {
      // Companion to the rejection above: proves the new filter did not make
      // every method ineligible.
      const order = await createPurchaseOrder();
      await post(`/purchasing/orders/${order.id}/payments`, {
        payments: [
          {
            amount: '25.00',
            paymentMethodId: await methodIdByCode(ds, 'CASH'),
            paymentDate: '2026-09-17',
          },
        ],
      }).expect(200);

      const gotRes = await get(`/purchasing/orders/${order.id}`).expect(200);
      const got = gotRes.body.data ?? gotRes.body;
      expect(got.paymentStatus).toBe('PAID');
    });

    it('never renders -0.00 in payment-facing values', async () => {
      const order = await createSalesOrder();
      await post(`/sales-orders/${order.id}/payments`, {
        amount: '25.00',
        paymentMethodId: await methodIdByCode(ds, 'CASH'),
        paymentDate: '2026-09-17',
      }).expect(200);
      const gotRes = await get(`/sales-orders/${order.id}`).expect(200);
      const got = gotRes.body.data ?? gotRes.body;
      expect(JSON.stringify(got)).not.toContain('-0.00');
    });
  });
});
