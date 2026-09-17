import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PaymentMethodEntity } from '../src/database/entities/payment-method.entity';
import { ChartOfAccount } from '../src/modules/accounting/entities/chart-of-account.entity';
import { AccountingSettings } from '../src/modules/accounting/entities/accounting-settings.entity';
import { seedCategory, seedProduct } from './e2e/helpers/seed';
import { configureTestAppValidation } from './utils/configure-test-app-validation';
import {
  E2E_ADMIN_PASSWORD,
  removeSuiteAdmin,
  seedSuiteAdmin,
} from './utils/shared-e2e-fixture';
import { removeSuiteTraces } from './utils/shared-e2e-traces-fixture';

// Issue #1237: payment-method -> GL-account mappings decide WHAT every payment
// path posts to, and a mapping that is invalid at posting time must roll the
// WHOLE path back. This suite is the end-to-end proof of both, deliberately
// driven through the real HTTP routes.
//
// Shared-DB discipline (issue #1197): every accounting assertion reads the
// journal lines for ONE reference number this suite owns. No global trial
// balance, no delta across one, and no "everything except my row" query.
const ownedRefs: string[] = [];

/**
 * Reads the journal entry lines back from the database rather than trusting the
 * response: the whole point of #1237 is WHICH account the line lands on, and
 * the API response does not say.
 */
async function debitAccountIdsFor(
  ds: DataSource,
  sourceRef: string,
): Promise<string[]> {
  const rows = await ds.query(
    `SELECT l."accountId", l.debit, l.credit
       FROM journal_entry_line l
       JOIN journal_entry e ON e.id = l."entryId"
      WHERE e."sourceRef" = $1
      ORDER BY l."createdAt"`,
    [sourceRef],
  );
  return rows
    .filter((r: any) => Number(r.debit) > 0)
    .map((r: any) => r.accountId);
}

/**
 * Issue #1237 rollback assertion: a 400 alone is insufficient. A path that
 * wrote its business row and THEN failed on the mapping would also return 400,
 * so BOTH the business row and the journal entry must be absent.
 */
async function expectNoResidue(
  ds: DataSource,
  opts: { table: string; column: string; id: string; sourceRef: string },
): Promise<void> {
  const rows = await ds.query(
    `SELECT 1 FROM "${opts.table}" WHERE "${opts.column}" = $1`,
    [opts.id],
  );
  expect(rows).toHaveLength(0);
  const entries = await ds.query(
    `SELECT 1 FROM journal_entry WHERE "sourceRef" = $1`,
    [opts.sourceRef],
  );
  expect(entries).toHaveLength(0);
}

async function seedAccounting(ds: DataSource): Promise<void> {
  const coa = ds.getRepository(ChartOfAccount);
  const groups = [
    ['1000', 'Assets', 'Asset'],
    ['2000', 'Liabilities', 'Liability'],
    ['3000', 'Equity', 'Equity'],
    ['4000', 'Income', 'Income'],
    ['5000', 'Cost of Sales', 'Expense'],
    ['6000', 'Expenses', 'Expense'],
  ] as const;
  for (const [code, name, type] of groups) {
    if (!(await coa.findOneBy({ code }))) {
      await coa.save(
        coa.create({ code, name, type, isSystem: true, isPostable: false } as any),
      );
    }
  }
  const children = [
    ['1100', 'Cash', 'Asset', '1000'],
    ['1200', 'Bank', 'Asset', '1000'],
    ['1300', 'Inventory', 'Asset', '1000'],
    ['1400', 'Supplier Deposit', 'Asset', '1000'],
    ['2100', 'Customer Deposit', 'Liability', '2000'],
    ['3100', 'Owner Capital', 'Equity', '3000'],
    ['3200', 'Opening Balance Equity', 'Equity', '3000'],
    ['3300', 'Owner Drawings', 'Equity', '3000'],
    ['4100', 'Sales Revenue', 'Income', '4000'],
    ['5100', 'Cost of Goods Sold', 'Expense', '5000'],
    ['6990', 'Other Expenses', 'Expense', '6000'],
  ] as const;
  for (const [code, name, type, parentCode] of children) {
    if (!(await coa.findOneBy({ code }))) {
      const parent = await coa.findOneByOrFail({ code: parentCode });
      await coa.save(
        coa.create({
          code,
          name,
          type,
          parentId: parent.id,
          isSystem: true,
          isPostable: true,
        } as any),
      );
    }
  }
  const settingsRepo = ds.getRepository(AccountingSettings);
  if (!(await settingsRepo.findOneBy({ id: true } as any))) {
    const id = async (c: string) => (await coa.findOneByOrFail({ code: c })).id;
    await settingsRepo.save(
      settingsRepo.create({
        id: true,
        cashAccountId: await id('1100'),
        bankAccountId: await id('1200'),
        inventoryAccountId: await id('1300'),
        supplierDepositAccountId: await id('1400'),
        customerDepositAccountId: await id('2100'),
        openingBalanceEquityAccountId: await id('3200'),
        ownerCapitalAccountId: await id('3100'),
        ownerDrawingsAccountId: await id('3300'),
        salesRevenueAccountId: await id('4100'),
        cogsAccountId: await id('5100'),
        defaultExpenseAccountId: await id('6990'),
      } as any),
    );
  }
}

describe('Payment method account mappings (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  // Unique per run so a crashed previous run cannot collide on codes/names.
  const runId = Date.now().toString(36);

  let adminUserId = '';
  let adminUsername = '';

  let token = '';
  let post: (path: string, body?: any) => request.Test;
  let put: (path: string, body?: any) => request.Test;
  let get: (path: string) => request.Test;

  // Baseline methods, seeded by the InitialSchema migration. They stay
  // UNMAPPED and are the fallback cases.
  let cashMethod: PaymentMethodEntity;
  let bankMethod: PaymentMethodEntity;

  // Suite-owned methods (deleted in afterAll).
  let mappedMethodId = '';
  let mappedMethodName = '';
  let rollbackMethodId = '';
  let rollbackMethodName = '';
  let bulkMethodAId = '';
  let bulkMethodBId = '';

  let bankAccountId = '';
  let cashAccountId = '';
  let expenseAccountId = '';

  let maybankAccountId = '';
  let rollbackAccount: ChartOfAccount;
  let accountAId = '';
  let accountBId = '';
  let accountCId = '';

  let customerId = '';
  let supplierId = '';
  let productId = '';
  let categoryId = '';

  const ownedEntityIds: string[] = [];
  const ownedSalesOrderIds: string[] = [];
  const ownedPurchaseOrderIds: string[] = [];
  const ownedExpenseIds: string[] = [];
  const ownedEquityDocIds: string[] = [];
  const ownedAccountIds: string[] = [];
  const ownedMethodIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();
    ds = moduleFixture.get(DataSource);

    await seedAccounting(ds);
    const settings = await ds
      .getRepository(AccountingSettings)
      .findOneByOrFail({ id: true } as any);
    bankAccountId = settings.bankAccountId;
    cashAccountId = settings.cashAccountId;
    expenseAccountId = settings.defaultExpenseAccountId;

    cashMethod = await ds
      .getRepository(PaymentMethodEntity)
      .findOneByOrFail({ code: 'CASH' });
    bankMethod = await ds
      .getRepository(PaymentMethodEntity)
      .findOneByOrFail({ code: 'BANK' });

    // Suite-owned accounts. Unique codes: the leak check counts rows, and the
    // unique index on code means a crash-then-rerun would otherwise collide.
    const parent = await ds
      .getRepository(ChartOfAccount)
      .findOneByOrFail({ code: '1000' });
    const seedAccount = async (code: string, name: string) => {
      const account = (await ds.getRepository(ChartOfAccount).save(
        ds.getRepository(ChartOfAccount).create({
          code: `PMM-${code}-${runId}`.slice(0, 20),
          name,
          type: 'Asset',
          parentId: parent.id,
          isSystem: false,
          isPostable: true,
          isActive: true,
        } as any),
      )) as unknown as ChartOfAccount;
      ownedAccountIds.push(account.id);
      ownedEntityIds.push(account.id);
      return account;
    };
    maybankAccountId = (await seedAccount('MAY', `Maybank ${runId}`)).id;
    rollbackAccount = await seedAccount('RBK', `Rollback Account ${runId}`);
    accountAId = (await seedAccount('A', `Bulk Account A ${runId}`)).id;
    accountBId = (await seedAccount('B', `Bulk Account B ${runId}`)).id;
    accountCId = (await seedAccount('C', `Bulk Account C ${runId}`)).id;

    const seedMethod = async (code: string, name: string) => {
      const method = (await ds.getRepository(PaymentMethodEntity).save(
        ds.getRepository(PaymentMethodEntity).create({
          code: `PMM-${code}-${runId}`.slice(0, 20),
          name,
          sortOrder: 100,
          useForPurchases: true,
          accountingChannel: 'BANK',
          isActive: true,
        }),
      )) as unknown as PaymentMethodEntity;
      ownedMethodIds.push(method.id);
      ownedEntityIds.push(method.id);
      return method;
    };
    const mappedMethod = await seedMethod('MAP', `Maybank Mapping ${runId}`);
    mappedMethodId = mappedMethod.id;
    mappedMethodName = mappedMethod.name;
    const rollbackMethod = await seedMethod('RBK', `Rollback Method ${runId}`);
    rollbackMethodId = rollbackMethod.id;
    rollbackMethodName = rollbackMethod.name;
    bulkMethodAId = (await seedMethod('BULKA', `Bulk Method A ${runId}`)).id;
    bulkMethodBId = (await seedMethod('BULKB', `Bulk Method B ${runId}`)).id;

    const category = await seedCategory(ds, `pmam-e2e-${runId}`);
    categoryId = category.id;
    const product = await seedProduct(ds, categoryId, {
      stockQuantity: 100,
      baseCost: 10,
    });
    productId = product.id;
    ownedEntityIds.push(productId, categoryId);

    adminUsername = `e2espec_pmam_admin_${runId}`;
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
    put = (path: string, body: any = {}) =>
      auth(request(server).put(path).send(body));
    get = (path: string) => auth(request(server).get(path));

    const customerRes = await post('/customers', {
      type: 'business',
      name: `PMM Customer ${runId}`,
    }).expect(201);
    const customer = customerRes.body.data ?? customerRes.body;
    customerId = customer.id;
    ownedEntityIds.push(customerId);

    const supplierRes = await post('/purchasing/suppliers', {
      type: 'local',
      companyName: `PMM Supplier ${runId}`,
    }).expect(201);
    const supplier = supplierRes.body.data ?? supplierRes.body;
    supplierId = supplier.id;
    ownedEntityIds.push(supplierId);
  });

  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        // Backstop for the rollback test's injected trigger. The test's own
        // finally is the primary cleanup; this covers the suite erroring past
        // it. It is NOT crash recovery — afterAll is in-process and is skipped
        // by a killed worker exactly as finally is.
        await ds.query(
          'DROP TRIGGER IF EXISTS pmam_fail ON payment_method_account_mappings',
        );
        await ds.query('DROP FUNCTION IF EXISTS pmam_fail_on_c()');

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
        if (ownedMethodIds.length) {
          await ds.query(
            `DELETE FROM payment_method_account_mappings WHERE "paymentMethodId" = ANY($1)`,
            [ownedMethodIds],
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
        if (ownedExpenseIds.length) {
          await ds.query(
            `DELETE FROM expense_payments WHERE "expenseId" = ANY($1)`,
            [ownedExpenseIds],
          );
          await ds.query(`DELETE FROM expenses WHERE id = ANY($1)`, [
            ownedExpenseIds,
          ]);
        }
        if (ownedEquityDocIds.length) {
          await ds.query(
            `DELETE FROM owner_equity_settlements WHERE "equityDocumentId" = ANY($1)`,
            [ownedEquityDocIds],
          );
          await ds.query(
            `DELETE FROM owner_equity_documents WHERE id = ANY($1)`,
            [ownedEquityDocIds],
          );
        }
        // Accounts after the journal lines that reference them (FK NO ACTION).
        if (ownedAccountIds.length) {
          await ds.query(`DELETE FROM chart_of_account WHERE id = ANY($1)`, [
            ownedAccountIds,
          ]);
        }
        if (ownedMethodIds.length) {
          await ds.query(`DELETE FROM payment_methods WHERE id = ANY($1)`, [
            ownedMethodIds,
          ]);
        }
        if (productId) await ds.query(`DELETE FROM products WHERE id = $1`, [productId]);
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
      items: [{ productId, quantity: 1, unitPrice: 10 }],
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
      orderDate: new Date().toISOString().split('T')[0],
      items: [{ productId, quantity: 1, unitPrice: 10 }],
    }).expect(201);
    const order = res.body.data ?? res.body;
    ownedPurchaseOrderIds.push(order.id);
    ownedRefs.push(order.orderNumber);
    ownedEntityIds.push(order.id);
    return { id: order.id, orderNumber: order.orderNumber };
  }

  async function createExpense(): Promise<{
    id: string;
    expenseNumber: string;
  }> {
    const res = await post('/accounting/expenses', {
      expenseDate: '2026-08-15',
      payee: `PMM Vendor ${runId}`,
      description: 'Mapping rollback fixture',
      expenseAccountId,
      totalAmount: '100.00',
    }).expect(201);
    const expense = res.body.data ?? res.body;
    ownedExpenseIds.push(expense.id);
    ownedRefs.push(expense.expenseNumber);
    ownedEntityIds.push(expense.id);
    return { id: expense.id, expenseNumber: expense.expenseNumber };
  }

  async function createOwnerEquityDoc(
    type: 'CAPITAL_INJECTION' | 'CASH_DRAWING',
  ): Promise<{ id: string; referenceNumber: string }> {
    const res = await post('/accounting/owner-equity', {
      type,
      equityDate: '2026-08-15',
      description: `PMM ${type} ${runId}`,
      totalAmount: '100.00',
    }).expect(201);
    const doc = res.body.data;
    ownedEquityDocIds.push(doc.id);
    ownedRefs.push(doc.referenceNumber);
    ownedEntityIds.push(doc.id);
    return { id: doc.id, referenceNumber: doc.referenceNumber };
  }

  function expectInvalidMappingError(
    res: request.Response,
    methodName: string,
    account: ChartOfAccount,
  ): void {
    expect(res.status).toBe(400);
    const message = String(res.body.message ?? '');
    expect(message).toContain(methodName);
    expect(message).toContain(account.code);
    expect(message).toContain(account.name);
  }

  describe('resolution', () => {
    it('posts a sales payment to the MAPPED account when the method is mapped', async () => {
      const listed = (
        await put('/accounting/settings/payment-method-mappings', {
          mappings: [
            { paymentMethodId: mappedMethodId, accountId: maybankAccountId },
          ],
        }).expect(200)
      ).body as any[];
      const row = listed.find((r) => r.paymentMethodId === mappedMethodId);
      expect(row.status).toBe('mapped');
      expect(row.accountId).toBe(maybankAccountId);

      const order = await createSalesOrder();
      await post(`/sales-orders/${order.id}/payments`, {
        amount: '10.00',
        paymentMethodId: mappedMethodId,
        paymentDate: '2026-08-20',
      }).expect(200);

      const debitIds = await debitAccountIdsFor(ds, order.orderNumber);
      expect(debitIds).toContain(maybankAccountId);
      expect(debitIds).not.toContain(bankAccountId);
    });

    it('posts a sales payment to the BANK default when the method is unmapped', async () => {
      const order = await createSalesOrder();
      await post(`/sales-orders/${order.id}/payments`, {
        amount: '10.00',
        paymentMethodId: bankMethod.id,
        paymentDate: '2026-08-20',
      }).expect(200);

      expect(await debitAccountIdsFor(ds, order.orderNumber)).toEqual([
        bankAccountId,
      ]);
    });

    it('posts a cash payment to the CASH default when the method is unmapped', async () => {
      const order = await createSalesOrder();
      await post(`/sales-orders/${order.id}/payments`, {
        amount: '10.00',
        paymentMethodId: cashMethod.id,
        paymentDate: '2026-08-20',
      }).expect(200);

      expect(await debitAccountIdsFor(ds, order.orderNumber)).toEqual([
        cashAccountId,
      ]);
    });
  });

  describe('rollback on an invalid mapping', () => {
    // The mapping is saved while the account is VALID, then the account is
    // deactivated. Save-time validation therefore cannot reject it; only the
    // posting-time revalidation in resolvePaymentAccount() can — and when it
    // does, the path's own transaction must roll the business row back.
    beforeAll(async () => {
      await put('/accounting/settings/payment-method-mappings', {
        mappings: [
          { paymentMethodId: rollbackMethodId, accountId: rollbackAccount.id },
        ],
      }).expect(200);
      await ds.query(
        `UPDATE chart_of_account SET "isActive" = false WHERE id = $1`,
        [rollbackAccount.id],
      );
    });

    it('sales payment rolls back', async () => {
      const order = await createSalesOrder();
      const res = await post(`/sales-orders/${order.id}/payments`, {
        amount: '10.00',
        paymentMethodId: rollbackMethodId,
        paymentDate: '2026-08-20',
      });
      expectInvalidMappingError(res, rollbackMethodName, rollbackAccount);
      await expectNoResidue(ds, {
        table: 'sales_order_payments',
        column: 'salesOrderId',
        id: order.id,
        sourceRef: order.orderNumber,
      });
    });

    it('sales refund rolls back', async () => {
      const order = await createSalesOrder();
      // A refund is capped by net paid, so seed a prior payment directly (raw
      // SQL: an HTTP payment would post its own entry under this sourceRef and
      // make the "no journal entry" assertion meaningless).
      await ds.query(
        `INSERT INTO sales_order_payments
           ("salesOrderId", "paymentMethodId", amount, "paymentDate", "referenceNumber")
         VALUES ($1, $2, '100.0000', '2026-08-01', $3)`,
        [order.id, cashMethod.id, `seed-${runId}`],
      );
      const res = await post(`/sales-orders/${order.id}/refunds`, {
        refunds: [
          {
            amount: '10.00',
            paymentMethodId: rollbackMethodId,
            paymentDate: '2026-08-21',
            referenceNumber: `rollback-${runId}`,
          },
        ],
      });
      expectInvalidMappingError(res, rollbackMethodName, rollbackAccount);
      // The prior payment row exists and is legitimately owned by this test, so
      // scope the residue check to the refund's method — the only row the
      // failing request could have written.
      await expectNoResidue(ds, {
        table: 'sales_order_payments',
        column: 'paymentMethodId',
        id: rollbackMethodId,
        sourceRef: order.orderNumber,
      });
    });

    it('purchase payment rolls back', async () => {
      const order = await createPurchaseOrder();
      const res = await post(`/purchasing/orders/${order.id}/payments`, {
        payments: [
          {
            paymentMethodId: rollbackMethodId,
            amount: '10.00',
            paymentDate: new Date().toISOString().split('T')[0],
          },
        ],
      });
      expectInvalidMappingError(res, rollbackMethodName, rollbackAccount);
      await expectNoResidue(ds, {
        table: 'vendor_payments',
        column: 'purchaseOrderId',
        id: order.id,
        sourceRef: order.orderNumber,
      });
    });

    it('purchase refund rolls back', async () => {
      const order = await createPurchaseOrder();
      await ds.query(
        `INSERT INTO vendor_payments
           ("supplierId", "purchaseOrderId", amount, "paymentDate", "paymentMethodId", "referenceNumber", status, "isActive")
         VALUES ($1, $2, '100.0000', '2026-08-01', $3, $4, 'completed', true)`,
        [supplierId, order.id, cashMethod.id, `seed-${runId}`],
      );
      const res = await post(`/purchasing/orders/${order.id}/refunds`, {
        refunds: [
          {
            paymentMethodId: rollbackMethodId,
            amount: '10.00',
            reference: `rollback-${runId}`,
          },
        ],
      });
      expectInvalidMappingError(res, rollbackMethodName, rollbackAccount);
      await expectNoResidue(ds, {
        table: 'vendor_payments',
        column: 'paymentMethodId',
        id: rollbackMethodId,
        sourceRef: order.orderNumber,
      });
    });

    it('expense payment rolls back', async () => {
      const expense = await createExpense();
      const res = await post(`/accounting/expenses/${expense.id}/pay`, {
        payments: [
          {
            paymentMethodId: rollbackMethodId,
            amount: '10.00',
            paymentDate: '2026-08-20',
          },
        ],
      });
      expectInvalidMappingError(res, rollbackMethodName, rollbackAccount);
      await expectNoResidue(ds, {
        table: 'expense_payments',
        column: 'expenseId',
        id: expense.id,
        sourceRef: expense.expenseNumber,
      });
    });

    it('expense refund rolls back', async () => {
      const expense = await createExpense();
      await ds.query(
        `INSERT INTO expense_payments
           ("expenseId", "paymentMethodId", "paymentDate", amount, reference, "sourcePaymentId", "isActive")
         VALUES ($1, $2, '2026-08-01', '100.0000', $3, NULL, true)`,
        [expense.id, cashMethod.id, `seed-${runId}`],
      );
      const res = await post(`/accounting/expenses/${expense.id}/refund`, {
        refunds: [
          {
            paymentMethodId: rollbackMethodId,
            amount: '10.00',
            refundDate: '2026-08-21',
            reference: `rollback-${runId}`,
          },
        ],
      });
      expectInvalidMappingError(res, rollbackMethodName, rollbackAccount);
      await expectNoResidue(ds, {
        table: 'expense_payments',
        column: 'paymentMethodId',
        id: rollbackMethodId,
        sourceRef: expense.expenseNumber,
      });
    });

    it('owner equity capital injection settlement rolls back', async () => {
      const doc = await createOwnerEquityDoc('CAPITAL_INJECTION');
      const res = await post(
        `/accounting/owner-equity/${doc.referenceNumber}/settle`,
        {
          settlements: [
            {
              paymentMethodId: rollbackMethodId,
              settlementDate: '2026-08-20',
              amount: '10.00',
            },
          ],
        },
      );
      expectInvalidMappingError(res, rollbackMethodName, rollbackAccount);
      await expectNoResidue(ds, {
        table: 'owner_equity_settlements',
        column: 'equityDocumentId',
        id: doc.id,
        sourceRef: doc.referenceNumber,
      });
    });

    it('owner equity capital injection refund rolls back', async () => {
      const doc = await createOwnerEquityDoc('CAPITAL_INJECTION');
      await ds.query(
        `INSERT INTO owner_equity_settlements
           ("equityDocumentId", "paymentMethodId", "settlementDate", amount, reference, "sourceSettlementId", "isActive")
         VALUES ($1, $2, '2026-08-01', '100.0000', $3, NULL, true)`,
        [doc.id, cashMethod.id, `seed-${runId}`],
      );
      const res = await post(
        `/accounting/owner-equity/${doc.referenceNumber}/refund`,
        {
          refunds: [
            {
              paymentMethodId: rollbackMethodId,
              amount: '10.00',
              refundDate: '2026-08-21',
              reference: `rollback-${runId}`,
            },
          ],
        },
      );
      expectInvalidMappingError(res, rollbackMethodName, rollbackAccount);
      await expectNoResidue(ds, {
        table: 'owner_equity_settlements',
        column: 'paymentMethodId',
        id: rollbackMethodId,
        sourceRef: doc.referenceNumber,
      });
    });

    it('owner equity cash drawing settlement rolls back', async () => {
      const doc = await createOwnerEquityDoc('CASH_DRAWING');
      const res = await post(
        `/accounting/owner-equity/${doc.referenceNumber}/settle`,
        {
          settlements: [
            {
              paymentMethodId: rollbackMethodId,
              settlementDate: '2026-08-20',
              amount: '10.00',
            },
          ],
        },
      );
      expectInvalidMappingError(res, rollbackMethodName, rollbackAccount);
      await expectNoResidue(ds, {
        table: 'owner_equity_settlements',
        column: 'equityDocumentId',
        id: doc.id,
        sourceRef: doc.referenceNumber,
      });
    });

    it('owner equity cash drawing refund rolls back', async () => {
      const doc = await createOwnerEquityDoc('CASH_DRAWING');
      await ds.query(
        `INSERT INTO owner_equity_settlements
           ("equityDocumentId", "paymentMethodId", "settlementDate", amount, reference, "sourceSettlementId", "isActive")
         VALUES ($1, $2, '2026-08-01', '100.0000', $3, NULL, true)`,
        [doc.id, cashMethod.id, `seed-${runId}`],
      );
      const res = await post(
        `/accounting/owner-equity/${doc.referenceNumber}/refund`,
        {
          refunds: [
            {
              paymentMethodId: rollbackMethodId,
              amount: '10.00',
              refundDate: '2026-08-21',
              reference: `rollback-${runId}`,
            },
          ],
        },
      );
      expectInvalidMappingError(res, rollbackMethodName, rollbackAccount);
      await expectNoResidue(ds, {
        table: 'owner_equity_settlements',
        column: 'paymentMethodId',
        id: rollbackMethodId,
        sourceRef: doc.referenceNumber,
      });
    });
  });

  describe('bulk mapping update', () => {
    beforeAll(async () => {
      // The bulk tests own bulkMethodA/B exclusively; clear residue from a
      // crashed previous run so "absent" means absent.
      await ds.query(
        `DELETE FROM payment_method_account_mappings WHERE "paymentMethodId" = ANY($1)`,
        [[bulkMethodAId, bulkMethodBId]],
      );
    });

    /*
     * VALIDATION ordering — not a rollback test.
     *
     * Every item is validated before any write, so this batch fails before the
     * write phase begins. It proves the ordering; it does NOT prove the
     * transaction rolls back, because nothing was ever written. The next test
     * is the one that proves rollback.
     */
    it('writes nothing when a later item fails validation', async () => {
      const res = await put('/accounting/settings/payment-method-mappings', {
        mappings: [
          { paymentMethodId: bulkMethodAId, accountId: accountAId },
          { paymentMethodId: bulkMethodBId, accountId: randomUUID() },
        ],
      }).expect(400);
      expect(String(res.body.message)).toContain('not found or deleted');

      const rows = await ds.query(
        `SELECT * FROM payment_method_account_mappings WHERE "paymentMethodId" = $1`,
        [bulkMethodAId],
      );
      expect(rows).toHaveLength(0);
    });

    /*
     * ROLLBACK — a failure DURING the write phase, after an earlier write has
     * already happened.
     *
     * Validation alone can never demonstrate this: it rejects before the first
     * write, so the database is untouched whether or not a transaction exists.
     * The failure has to land between two writes.
     *
     * The trigger is the deterministic equivalent of deleting account C
     * mid-flight: it RAISEs when accountId = C, so it fires on the SECOND
     * insert with the first already written inside the transaction.
     *
     * CLEANUP IS MANDATORY on this shared database. The drops go in a
     * `finally`, never after the assertions, which would be skipped by a
     * failing expect or a throwing request. DROP ... IF EXISTS keeps the
     * cleanup idempotent, and the function is dropped after the trigger that
     * depends on it. `finally` covers a failing test, not a dying process: a
     * killed worker skips it, and afterAll carries a backstop for the
     * in-process cases it cannot.
     */
    it('rolls back an earlier write when a later write fails', async () => {
      await ds.query(
        'DROP TRIGGER IF EXISTS pmam_fail ON payment_method_account_mappings',
      );
      /*
       * accountCId is INTERPOLATED, not bound, and must stay that way. A
       * CREATE FUNCTION body is parsed as a string literal at definition
       * time, so $1 inside it is not a query parameter — it would be read as
       * a plpgsql positional argument of this zero-argument function and fail
       * to compile. Passing it via ds.query(sql, [accountCId]) does not work
       * either: there is no parameter slot in the statement to bind to.
       *
       * Safe here because accountCId is a UUID this suite generated via
       * seedAccount, never user input. Do not "fix" this into a
       * parameterized form.
       */
      await ds.query(`
        CREATE OR REPLACE FUNCTION pmam_fail_on_c() RETURNS trigger AS $$
        BEGIN
          IF NEW."accountId" = '${accountCId}' THEN
            RAISE EXCEPTION 'injected failure';
          END IF;
          RETURN NEW;
        END; $$ LANGUAGE plpgsql;
      `);
      await ds.query(`
        CREATE TRIGGER pmam_fail BEFORE INSERT ON payment_method_account_mappings
          FOR EACH ROW EXECUTE FUNCTION pmam_fail_on_c();
      `);
      try {
        const res = await put(
          '/accounting/settings/payment-method-mappings',
          {
            mappings: [
              { paymentMethodId: bulkMethodAId, accountId: accountAId },
              { paymentMethodId: bulkMethodBId, accountId: accountCId },
            ],
          },
        );
        // The brief said "expect 500", but this codebase's global
        // HttpExceptionFilter maps EVERY QueryFailedError to 400 with
        // error: 'Database Error' (http-exception.filter.ts:122-128), so a
        // bare 500 can never be what an injected database failure returns.
        // Assert the DB-error shape rather than any 400: a validation-phase
        // rejection also returns 400 but carries error: 'Bad Request', so the
        // discriminator is error === 'Database Error' / code === 'DB_999',
        // which proves the request failed in the write phase, after the first
        // insert.
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Database Error');
        expect(res.body.code).toBe('DB_999');

        // BOTH absent: bulkMethodA's insert succeeded on its own and must still
        // have rolled back. Without the transaction, it survives and this goes
        // red.
        const rows = await ds.query(
          `SELECT "paymentMethodId" FROM payment_method_account_mappings
            WHERE "paymentMethodId" = ANY($1)`,
          [[bulkMethodAId, bulkMethodBId]],
        );
        expect(rows).toHaveLength(0);
      } finally {
        // Runs even if the request throws or an assertion fails.
        await ds.query(
          'DROP TRIGGER IF EXISTS pmam_fail ON payment_method_account_mappings',
        );
        await ds.query('DROP FUNCTION IF EXISTS pmam_fail_on_c()');
      }
    });

    /*
     * SOFT-DELETED METHOD LIFECYCLE (review finding, #1237).
     *
     * PaymentMethodService.remove() soft-deletes, so the mapping's ON DELETE
     * CASCADE never fires: the row outlives the method. Because list() shows
     * ACTIVE methods only, that row is invisible — and if the method is later
     * restored, the stale mapping silently resumes posting.
     *
     * So a clear must remain possible for an inactive or soft-deleted method.
     * These two tests prove the clear physically removes the row, and that a
     * restored method whose mapping was cleared falls back to the channel
     * default rather than resurrecting its old account.
     */
    it('clears the mapping of a soft-deleted payment method, removing the row', async () => {
      const doomed = (await ds.getRepository(PaymentMethodEntity).save(
        ds.getRepository(PaymentMethodEntity).create({
          code: `PMM-DOOM-${runId}`.slice(0, 20),
          name: `Doomed Method ${runId}`,
          sortOrder: 100,
          useForPurchases: true,
          accountingChannel: 'BANK',
          isActive: true,
        }),
      )) as unknown as PaymentMethodEntity;
      ownedMethodIds.push(doomed.id);
      ownedEntityIds.push(doomed.id);

      await put('/accounting/settings/payment-method-mappings', {
        mappings: [{ paymentMethodId: doomed.id, accountId: accountAId }],
      }).expect(200);

      // Soft delete, exactly as PaymentMethodService.remove() does.
      await ds.getRepository(PaymentMethodEntity).softDelete(doomed.id);

      // The row survives the soft delete — CASCADE did not fire. This is the
      // state the clear has to be able to reach.
      const stranded = await ds.query(
        `SELECT "accountId" FROM payment_method_account_mappings WHERE "paymentMethodId" = $1`,
        [doomed.id],
      );
      expect(stranded).toHaveLength(1);

      // And it is invisible in the GET, which lists active methods only.
      const listed = (await get(
        '/accounting/settings/payment-method-mappings',
      ).expect(200)).body as any[];
      expect(listed.find((r) => r.paymentMethodId === doomed.id)).toBeUndefined();

      // The clear is permitted despite the method being gone...
      await put('/accounting/settings/payment-method-mappings', {
        mappings: [{ paymentMethodId: doomed.id, accountId: null }],
      }).expect(200);

      // ...and physically removes the row. Raw SQL, so a soft-deleted
      // leftover would still be counted here.
      const afterClear = await ds.query(
        `SELECT "deletedAt" FROM payment_method_account_mappings WHERE "paymentMethodId" = $1`,
        [doomed.id],
      );
      expect(afterClear).toHaveLength(0);

      // Assigning to a soft-deleted method stays rejected: only the clear is
      // widened, because only the clear cannot create an invisible row.
      await put('/accounting/settings/payment-method-mappings', {
        mappings: [{ paymentMethodId: doomed.id, accountId: accountBId }],
      }).expect(400);
    });

    it('falls back to the channel default when a restored method had its mapping cleared', async () => {
      const revived = (await ds.getRepository(PaymentMethodEntity).save(
        ds.getRepository(PaymentMethodEntity).create({
          code: `PMM-RVV-${runId}`.slice(0, 20),
          name: `Revived Method ${runId}`,
          sortOrder: 100,
          useForPurchases: true,
          accountingChannel: 'BANK',
          isActive: true,
        }),
      )) as unknown as PaymentMethodEntity;
      ownedMethodIds.push(revived.id);
      ownedEntityIds.push(revived.id);

      await put('/accounting/settings/payment-method-mappings', {
        mappings: [{ paymentMethodId: revived.id, accountId: maybankAccountId }],
      }).expect(200);

      await ds.getRepository(PaymentMethodEntity).softDelete(revived.id);
      await put('/accounting/settings/payment-method-mappings', {
        mappings: [{ paymentMethodId: revived.id, accountId: null }],
      }).expect(200);

      await ds.getRepository(PaymentMethodEntity).restore(revived.id);

      // Restored and visible again, but UNMAPPED — the cleared row did not
      // come back with the method. Had the clear been a soft delete, the row
      // would still be present and this would read 'mapped'.
      const afterRestore = (await get(
        '/accounting/settings/payment-method-mappings',
      ).expect(200)).body as any[];
      const row = afterRestore.find((r) => r.paymentMethodId === revived.id);
      expect(row).toBeDefined();
      expect(row.status).toBe('unmapped');
      expect(row.accountId).toBeNull();

      const rows = await ds.query(
        `SELECT 1 FROM payment_method_account_mappings WHERE "paymentMethodId" = $1`,
        [revived.id],
      );
      expect(rows).toHaveLength(0);
    });

    /*
     * REGRESSION TEST for the hard-delete rule (spec: "Clearing a mapping is a
     * hard delete").
     *
     * The load-bearing assertion is the one IMMEDIATELY AFTER THE CLEAR: zero
     * rows for that method, counted with raw SQL so soft-deleted rows are
     * visible. A softDelete() leaves a row behind and fails right there.
     *
     * Asserting only at the END would NOT catch it: delete-then-insert would
     * remove the leftover on the remap, and an `upsert` would UPDATE the
     * soft-deleted row back into use — either way the final state looks
     * correct while the row was silently resurrected.
     */
    it('leaves no row behind when a mapping is cleared, and allows remapping', async () => {
      await put('/accounting/settings/payment-method-mappings', {
        mappings: [{ paymentMethodId: bulkMethodAId, accountId: accountAId }],
      }).expect(200);

      await put('/accounting/settings/payment-method-mappings', {
        mappings: [{ paymentMethodId: bulkMethodAId, accountId: null }],
      }).expect(200);

      const afterClear = await ds.query(
        `SELECT "deletedAt" FROM payment_method_account_mappings WHERE "paymentMethodId" = $1`,
        [bulkMethodAId],
      );
      expect(afterClear).toHaveLength(0);

      const clearedList = (await get(
        '/accounting/settings/payment-method-mappings',
      ).expect(200)).body as any[];
      const cleared = clearedList.find(
        (r) => r.paymentMethodId === bulkMethodAId,
      );
      expect(cleared.status).toBe('unmapped');
      expect(cleared.accountId).toBeNull();

      await put('/accounting/settings/payment-method-mappings', {
        mappings: [{ paymentMethodId: bulkMethodAId, accountId: accountBId }],
      }).expect(200);

      const remappedList = (await get(
        '/accounting/settings/payment-method-mappings',
      ).expect(200)).body as any[];
      const remapped = remappedList.find(
        (r) => r.paymentMethodId === bulkMethodAId,
      );
      expect(remapped.status).toBe('mapped');
      expect(remapped.accountId).toBe(accountBId);

      const afterRemap = await ds.query(
        `SELECT "accountId", "deletedAt" FROM payment_method_account_mappings WHERE "paymentMethodId" = $1`,
        [bulkMethodAId],
      );
      expect(afterRemap).toHaveLength(1);
      expect(afterRemap[0].deletedAt).toBeNull();
      expect(afterRemap[0].accountId).toBe(accountBId);
    });

    it('rejects a duplicate paymentMethodId in one payload', async () => {
      const res = await put('/accounting/settings/payment-method-mappings', {
        mappings: [
          { paymentMethodId: bulkMethodAId, accountId: accountAId },
          { paymentMethodId: bulkMethodAId, accountId: accountBId },
        ],
      }).expect(400);
      expect(String(res.body.message)).toContain('duplicate');
    });

    it('rejects an empty-string accountId rather than treating it as a clear', async () => {
      await put('/accounting/settings/payment-method-mappings', {
        mappings: [{ paymentMethodId: bulkMethodAId, accountId: accountAId }],
      }).expect(200);

      const res = await put('/accounting/settings/payment-method-mappings', {
        mappings: [{ paymentMethodId: bulkMethodAId, accountId: '' }],
      }).expect(400);
      expect(String(res.body.message)).toContain('accountId');

      const rows = await ds.query(
        `SELECT "accountId" FROM payment_method_account_mappings WHERE "paymentMethodId" = $1`,
        [bulkMethodAId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].accountId).toBe(accountAId);
    });

    it('rejects an unknown paymentMethodId', async () => {
      const res = await put('/accounting/settings/payment-method-mappings', {
        mappings: [{ paymentMethodId: randomUUID(), accountId: accountAId }],
      }).expect(400);
      expect(String(res.body.message)).toContain('not found or inactive');
    });

    it('leaves omitted methods unchanged', async () => {
      await put('/accounting/settings/payment-method-mappings', {
        mappings: [
          { paymentMethodId: bulkMethodAId, accountId: accountAId },
          { paymentMethodId: bulkMethodBId, accountId: accountBId },
        ],
      }).expect(200);

      await put('/accounting/settings/payment-method-mappings', {
        mappings: [{ paymentMethodId: bulkMethodAId, accountId: accountBId }],
      }).expect(200);

      const rows = await ds.query(
        `SELECT "accountId" FROM payment_method_account_mappings WHERE "paymentMethodId" = $1`,
        [bulkMethodBId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].accountId).toBe(accountBId);
    });
  });
});
