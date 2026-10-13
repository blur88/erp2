import { BadRequestException, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource, QueryRunner } from 'typeorm';

import { AppModule } from '../src/app.module';
import { Customer, CustomerType } from '../src/database/entities/customer.entity';
import { Payment } from '../src/database/entities/payment.entity';
import {
  SalesOrder,
  SalesOrderPaymentStatus,
  SalesOrderStatus,
} from '../src/database/entities/sales-order.entity';
import { CustomerService } from '../src/modules/sales/services/customer.service';
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
 * Issue #1390. Permanent deletion of a customer is one transaction per
 * customer, on a manager of its own: the customer row is locked before its
 * dependencies are counted, the audit row is written by that transaction, and
 * nothing on the shared `CustomerService` instance changes while it runs.
 *
 * The overlap in each case is held open with a row lock the test owns and is
 * observed in `pg_stat_activity` before the test moves on, so no case depends
 * on timing.
 */
describe('Customer permanent deletion is atomic and safe to overlap (#1390, e2e)', () => {
  const USERNAME = E2E_ADMIN_USERNAMES.customerPermanentDeleteAtomic;
  const CODE = 'PERMANENT_DELETE_PREVENTED_BY_DEPENDENCIES';
  const run = `${process.pid}-${Date.now().toString(36)}`;

  let app: INestApplication;
  let ds: DataSource;
  let token: string;
  let adminId: string;
  let customers: CustomerService;
  let seq = 0;

  const ownedCustomerIds: string[] = [];
  const openRunners: QueryRunner[] = [];

  async function seedCustomer(tag: string, softDeleted = true): Promise<Customer> {
    const repo = ds.getRepository(Customer);
    const customer = await repo.save(
      repo.create({
        type: CustomerType.BUSINESS,
        name: `Atomic Delete ${tag} ${run}`,
        isActive: true,
      }),
    );
    ownedCustomerIds.push(customer.id);
    if (softDeleted) {
      await repo.softDelete(customer.id);
    }
    return customer;
  }

  const orderFields = (customerId: string) => ({
    orderNumber: `SO-AD-${run}-${++seq}`.slice(0, 30),
    orderDate: '2026-02-01' as any,
    customerId,
    status: SalesOrderStatus.DRAFT,
    paymentStatus: SalesOrderPaymentStatus.UNPAID,
    subtotal: 100,
    shippingAmount: 0,
    totalAmount: '100.0000',
    paidAmount: '0.0000',
    balanceDue: '100.0000',
  });

  async function seedDeletedOrder(customerId: string): Promise<SalesOrder> {
    const repo = ds.getRepository(SalesOrder);
    const order = await repo.save(repo.create(orderFields(customerId)));
    await repo.softDelete(order.id);
    return order;
  }

  /** A transaction the test owns; rolled back in afterEach if a case leaves it open. */
  async function openTransaction(): Promise<QueryRunner> {
    const runner = ds.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    openRunners.push(runner);
    return runner;
  }

  async function finish(runner: QueryRunner, how: 'commit' | 'rollback'): Promise<void> {
    openRunners.splice(openRunners.indexOf(runner), 1);
    try {
      if (how === 'commit') {
        await runner.commitTransaction();
      } else {
        await runner.rollbackTransaction();
      }
    } finally {
      await runner.release();
    }
  }

  async function lockCustomerRow(id: string): Promise<QueryRunner> {
    const runner = await openTransaction();
    await runner.query(`SELECT 1 FROM customers WHERE id = $1 FOR UPDATE`, [id]);
    return runner;
  }

  const lockWaiters = async (): Promise<number> =>
    Number(
      (
        await ds.query(
          `SELECT count(*)::int AS n FROM pg_stat_activity
           WHERE datname = current_database() AND wait_event_type = 'Lock'`,
        )
      )[0].n,
    );

  /** True once `n` sessions are waiting on a lock; false if that is not seen in time. */
  async function sawLockWaiters(n: number, timeoutMs = 5000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if ((await lockWaiters()) >= n) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return false;
  }

  /** The outcome of a call, without an unhandled rejection while the test holds it open. */
  const settled = <T>(promise: Promise<T>): Promise<{ value?: T; error?: unknown }> =>
    promise.then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );

  const customerExists = async (id: string): Promise<boolean> =>
    (await ds.query(`SELECT 1 FROM customers WHERE id = $1`, [id])).length === 1;

  const orderExists = async (id: string): Promise<boolean> =>
    (await ds.query(`SELECT 1 FROM sales_orders WHERE id = $1`, [id])).length === 1;

  const deletionAuditRows = async (customerId: string): Promise<number> =>
    Number(
      (
        await ds.query(
          `SELECT count(*)::int AS n FROM audit_logs
           WHERE "entityId" = $1 AND action = 'PERMANENT_DELETE'`,
          [customerId],
        )
      )[0].n,
    );

  const listCustomers = () =>
    request(app.getHttpServer()).get('/customers').set('Authorization', `Bearer ${token}`);

  const repositoriesOf = (service: CustomerService) => ({
    customer: (service as any).customerRepository,
    salesOrder: (service as any).salesOrderRepository,
    payment: (service as any).paymentRepository,
  });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();

    ds = app.get(DataSource);
    customers = app.get(CustomerService);
    adminId = (await seedSuiteAdmin(ds, USERNAME)).id;

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .set(...SESSION_PROTOCOL)
      .send({ usernameOrEmail: USERNAME, password: E2E_ADMIN_PASSWORD })
      .expect(200);
    token = login.body?.data?.accessToken ?? login.body?.accessToken;
    expect(token).toBeTruthy();
  });

  afterEach(async () => {
    for (const runner of [...openRunners]) {
      await finish(runner, 'rollback');
    }
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      await removeSuiteTraces(ds, {
        userIds: [adminId],
        usernames: [USERNAME],
        entityIds: ownedCustomerIds,
      });
      await resetSuiteBusinessRows(ds, { customerIds: ownedCustomerIds });
      await removeSuiteAdmin(ds, USERNAME);
    }
    await app.close();
  });

  it('two overlapping deletions both complete and leave the service on its own repositories (3a)', async () => {
    const first = await seedCustomer('overlap-first');
    const second = await seedCustomer('overlap-second');
    const before = repositoriesOf(customers);

    const holdFirst = await lockCustomerRow(first.id);
    const holdSecond = await lockCustomerRow(second.id);

    // The first deletion is in flight, stopped on the test's lock, when the
    // second one starts; the first then finishes before the second does.
    const firstDelete = settled(customers.permanentDelete(first.id, adminId, USERNAME));
    expect(await sawLockWaiters(1)).toBe(true);
    const secondDelete = settled(customers.permanentDelete(second.id, adminId, USERNAME));
    const bothInFlight = await sawLockWaiters(2);

    // While both are in flight the shared instance is what it was.
    expect(repositoriesOf(customers).customer === before.customer).toBe(true);

    await finish(holdFirst, 'commit');
    const firstOutcome = await firstDelete;
    await finish(holdSecond, 'commit');
    const secondOutcome = await secondDelete;

    expect(bothInFlight).toBe(true);
    expect(firstOutcome.error).toBeUndefined();
    expect(secondOutcome.error).toBeUndefined();
    expect(await customerExists(first.id)).toBe(false);
    expect(await customerExists(second.id)).toBe(false);
    expect(await deletionAuditRows(first.id)).toBe(1);
    expect(await deletionAuditRows(second.id)).toBe(1);

    const after = repositoriesOf(customers);
    // Compared by identity, as booleans: a failed toBe would print a repository.
    expect(after.customer === before.customer).toBe(true);
    expect(after.salesOrder === before.salesOrder).toBe(true);
    expect(after.payment === before.payment).toBe(true);

    // Later requests through the same service: a read, a write, another deletion.
    await listCustomers().expect(200);
    const later = await seedCustomer('overlap-later', false);
    await customers.update(later.id, { notes: 'still writable' } as any, adminId, USERNAME);
    await customers.softDelete(later.id, adminId, USERNAME);
    await customers.permanentDelete(later.id, adminId, USERNAME);
    expect(await customerExists(later.id)).toBe(false);
  });

  it('a read made while a deletion is in flight does not join its transaction (3)', async () => {
    const deleting = await seedCustomer('overlap-read');
    const bystander = await seedCustomer('bystander', false);

    const hold = await lockCustomerRow(deleting.id);
    const deletion = settled(customers.permanentDelete(deleting.id, adminId, USERNAME));
    expect(await sawLockWaiters(1)).toBe(true);

    // On the deletion's connection this read would queue behind the lock wait.
    const read = await Promise.race([
      customers.findById(bystander.id).then((found) => found.id),
      new Promise<string>((resolve) => setTimeout(() => resolve('blocked'), 3000)),
    ]);

    await finish(hold, 'commit');
    expect((await deletion).error).toBeUndefined();
    expect(read).toBe(bystander.id);
  });

  describe('an order that commits while the deletion is under way (2, 4)', () => {
    /**
     * The order is inserted and left uncommitted, so it holds the customer row
     * against deletion without being visible. It commits once the deletion is
     * seen waiting.
     */
    async function deleteWhileOrderCommits<T>(
      customer: Customer,
      act: () => Promise<T>,
    ): Promise<{ value?: T; error?: unknown }> {
      const writer = await openTransaction();
      const repo = writer.manager.getRepository(SalesOrder);
      await repo.save(repo.create(orderFields(customer.id)));

      const outcome = settled(act());
      const waited = await sawLockWaiters(1);
      await finish(writer, 'commit');
      const result = await outcome;
      expect(waited).toBe(true);
      return result;
    }

    it('the single path refuses by code and leaves no audit row and no deleted order', async () => {
      const customer = await seedCustomer('race-single');
      const softDeletedOrder = await seedDeletedOrder(customer.id);

      const { error } = await deleteWhileOrderCommits(customer, () =>
        customers.permanentDelete(customer.id, adminId, USERNAME),
      );

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: CODE,
        dependencies: { orders: 1, payments: 0 },
      });
      expect(await customerExists(customer.id)).toBe(true);
      expect(await orderExists(softDeletedOrder.id)).toBe(true);
      expect(await deletionAuditRows(customer.id)).toBe(0);
      await listCustomers().expect(200);
    });

    it('the bulk path reports DEPENDENCY_ERROR and leaves no audit row and no deleted order', async () => {
      const customer = await seedCustomer('race-bulk');
      const softDeletedOrder = await seedDeletedOrder(customer.id);

      const { value, error } = await deleteWhileOrderCommits(customer, () =>
        customers.bulkPermanentDelete([customer.id], adminId, USERNAME),
      );

      expect(error).toBeUndefined();
      expect(value.successCount).toBe(0);
      expect(
        value.failedItems.map((item) => ({
          id: item.id,
          errorCode: item.errorCode,
          dependencies: item.details?.dependencies,
        })),
      ).toEqual([
        {
          id: customer.id,
          errorCode: 'DEPENDENCY_ERROR',
          dependencies: { orders: 1, payments: 0 },
        },
      ]);
      expect(await customerExists(customer.id)).toBe(true);
      expect(await orderExists(softDeletedOrder.id)).toBe(true);
      expect(await deletionAuditRows(customer.id)).toBe(0);
      await listCustomers().expect(200);
    });
  });

  describe("another customer's payment on a soft-deleted order (1)", () => {
    async function seedCrossCustomerPayment(tag: string) {
      const customer = await seedCustomer(`${tag}-owner`);
      const payer = await seedCustomer(`${tag}-payer`, false);
      const order = await seedDeletedOrder(customer.id);
      const repo = ds.getRepository(Payment);
      await repo.save(
        repo.create({
          customerId: payer.id,
          salesOrderId: order.id,
          paymentDate: '2026-02-01' as any,
          amount: '10.0000',
        }),
      );
      return { customer, order };
    }

    it('the single route refuses by code and keeps the customer and the order', async () => {
      const { customer, order } = await seedCrossCustomerPayment('cross-single');

      const res = await request(app.getHttpServer())
        .delete(`/customers/${customer.id}/permanent`)
        .set('Authorization', `Bearer ${token}`)
        .expect(400);

      expect(res.body.code).toBe(CODE);
      expect(res.body.message).toBe(
        `Cannot permanently delete customer '${customer.name}' because it has payments`,
      );
      const error = (await settled(customers.permanentDelete(customer.id, adminId, USERNAME)))
        .error as BadRequestException;
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error.getResponse() as any).dependencies).toEqual({ orders: 0, payments: 1 });
      expect(await customerExists(customer.id)).toBe(true);
      expect(await orderExists(order.id)).toBe(true);
      expect(await deletionAuditRows(customer.id)).toBe(0);
    });

    it('the bulk path reports DEPENDENCY_ERROR and keeps the customer and the order', async () => {
      const { customer, order } = await seedCrossCustomerPayment('cross-bulk');

      const result = await customers.bulkPermanentDelete([customer.id], adminId, USERNAME);

      expect(result.successCount).toBe(0);
      expect(
        result.failedItems.map((item) => ({
          id: item.id,
          errorCode: item.errorCode,
          dependencies: item.details?.dependencies,
        })),
      ).toEqual([
        {
          id: customer.id,
          errorCode: 'DEPENDENCY_ERROR',
          dependencies: { orders: 0, payments: 1 },
        },
      ]);
      expect(await customerExists(customer.id)).toBe(true);
      expect(await orderExists(order.id)).toBe(true);
      expect(await deletionAuditRows(customer.id)).toBe(0);
    });
  });

  it('a completed deletion removes soft-deleted orders and writes one audit row', async () => {
    const customer = await seedCustomer('complete');
    const order = await seedDeletedOrder(customer.id);

    await customers.permanentDelete(customer.id, adminId, USERNAME);

    expect(await customerExists(customer.id)).toBe(false);
    expect(await orderExists(order.id)).toBe(false);
    expect(await deletionAuditRows(customer.id)).toBe(1);
  });
});
