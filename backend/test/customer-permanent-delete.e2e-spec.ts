import { BadRequestException, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

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
 * Issue #1368. `payments.customerId` is ON DELETE RESTRICT, and permanent
 * deletion of a customer had no check for it: a customer with payments and no
 * orders was refused by the constraint alone, as a database error. The foreign
 * key does not look at `deletedAt`, so a soft-deleted payment blocks as well.
 *
 * Every case runs against Postgres. Expected counts are written out from the
 * rows each case seeds.
 */
describe('Customer permanent deletion is refused while payments exist (#1368, e2e)', () => {
  const USERNAME = E2E_ADMIN_USERNAMES.customerPermanentDelete;
  const CODE = 'PERMANENT_DELETE_PREVENTED_BY_DEPENDENCIES';
  const run = `${process.pid}-${Date.now().toString(36)}`;

  let app: INestApplication;
  let ds: DataSource;
  let token: string;
  let adminId: string;
  let customers: CustomerService;
  let seq = 0;

  const ownedCustomerIds: string[] = [];

  /** A customer that is already soft-deleted, as permanent deletion requires. */
  async function seedDeletedCustomer(tag: string): Promise<Customer> {
    const repo = ds.getRepository(Customer);
    const customer = await repo.save(
      repo.create({
        type: CustomerType.BUSINESS,
        name: `Permanent Delete ${tag} ${run}`,
        isActive: true,
      }),
    );
    ownedCustomerIds.push(customer.id);
    await repo.softDelete(customer.id);
    return customer;
  }

  async function seedPayment(customerId: string, softDeleted = false): Promise<void> {
    const repo = ds.getRepository(Payment);
    const payment = await repo.save(
      repo.create({
        customerId,
        paymentDate: '2026-02-01' as any,
        amount: '10.0000',
      }),
    );
    if (softDeleted) {
      await repo.softDelete(payment.id);
    }
  }

  async function seedOrder(customerId: string): Promise<void> {
    const repo = ds.getRepository(SalesOrder);
    await repo.save(
      repo.create({
        orderNumber: `SO-PD-${run}-${++seq}`.slice(0, 30),
        orderDate: '2026-02-01' as any,
        customerId,
        status: SalesOrderStatus.DRAFT,
        paymentStatus: SalesOrderPaymentStatus.UNPAID,
        subtotal: 100,
        shippingAmount: 0,
        totalAmount: '100.0000',
        paidAmount: '0.0000',
        balanceDue: '100.0000',
      }),
    );
  }

  const customerExists = async (id: string): Promise<boolean> =>
    (await ds.query(`SELECT 1 FROM customers WHERE id = $1`, [id])).length === 1;

  const permanentDelete = (id: string) =>
    request(app.getHttpServer())
      .delete(`/customers/${id}/permanent`)
      .set('Authorization', `Bearer ${token}`);

  /** The exception body as the service throws it; the filter forwards only `message` and `code`. */
  async function refusal(id: string): Promise<any> {
    const error = await customers.permanentDelete(id, adminId, USERNAME).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).getResponse();
  }

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

  it('refuses a customer with a payment and no orders, by code, and keeps the row', async () => {
    const customer = await seedDeletedCustomer('live-payment');
    await seedPayment(customer.id);

    const res = await permanentDelete(customer.id).expect(400);

    expect(res.body.code).toBe(CODE);
    expect(await customerExists(customer.id)).toBe(true);
    expect((await refusal(customer.id)).dependencies).toEqual({ orders: 0, payments: 1 });
  });

  it('refuses a customer whose only payment is soft-deleted', async () => {
    const customer = await seedDeletedCustomer('deleted-payment');
    await seedPayment(customer.id, true);

    const res = await permanentDelete(customer.id).expect(400);

    expect(res.body.code).toBe(CODE);
    expect(await customerExists(customer.id)).toBe(true);
    const body = await refusal(customer.id);
    expect(body.code).toBe(CODE);
    expect(body.dependencies).toEqual({ orders: 0, payments: 1 });
  });

  it('reports orders and payments together', async () => {
    const customer = await seedDeletedCustomer('order-and-payments');
    await seedOrder(customer.id);
    await seedPayment(customer.id);
    await seedPayment(customer.id, true);

    const body = await refusal(customer.id);

    expect(body.code).toBe(CODE);
    expect(body.dependencies).toEqual({ orders: 1, payments: 2 });
  });

  it('deletes a customer with no orders and no payments', async () => {
    const customer = await seedDeletedCustomer('clean');

    await permanentDelete(customer.id).expect(204);

    expect(await customerExists(customer.id)).toBe(false);
  });

  it('bulk deletion reports payment holders as DEPENDENCY_ERROR and deletes the rest', async () => {
    const live = await seedDeletedCustomer('bulk-live-payment');
    const softDeleted = await seedDeletedCustomer('bulk-deleted-payment');
    const clean = await seedDeletedCustomer('bulk-clean');
    await seedPayment(live.id);
    await seedPayment(softDeleted.id, true);

    const result = await customers.bulkPermanentDelete(
      [live.id, softDeleted.id, clean.id],
      adminId,
      USERNAME,
    );

    expect(result.successCount).toBe(1);
    expect(
      result.failedItems.map((item) => ({
        id: item.id,
        errorCode: item.errorCode,
        dependencies: item.details?.dependencies,
      })),
    ).toEqual([
      { id: live.id, errorCode: 'DEPENDENCY_ERROR', dependencies: { orders: 0, payments: 1 } },
      {
        id: softDeleted.id,
        errorCode: 'DEPENDENCY_ERROR',
        dependencies: { orders: 0, payments: 1 },
      },
    ]);
    expect(await customerExists(live.id)).toBe(true);
    expect(await customerExists(softDeleted.id)).toBe(true);
    expect(await customerExists(clean.id)).toBe(false);
  });

  it('the bulk route names the refused customers', async () => {
    const blocked = await seedDeletedCustomer('route-payment');
    const clean = await seedDeletedCustomer('route-clean');
    await seedPayment(blocked.id);

    const res = await request(app.getHttpServer())
      .post('/customers/bulk-permanent-delete')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerIds: [blocked.id, clean.id] })
      .expect(200);

    const body = res.body?.data ?? res.body;
    expect(body.deletedCount).toBe(1);
    expect(body.failedIds).toEqual([blocked.id]);
    expect(await customerExists(blocked.id)).toBe(true);
    expect(await customerExists(clean.id)).toBe(false);
  });
});
