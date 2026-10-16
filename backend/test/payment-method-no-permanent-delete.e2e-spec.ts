import { SESSION_PROTOCOL } from './utils/session-protocol';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PaymentMethodEntity } from '../src/database/entities/payment-method.entity';
import { configureTestAppValidation } from './utils/configure-test-app-validation';
import {
  E2E_ADMIN_PASSWORD,
  SHARED_E2E_NS,
  removeSuiteAdmin,
  seedSuiteAdmin,
} from './utils/shared-e2e-fixture';
import { removeSuiteTraces } from './utils/shared-e2e-traces-fixture';

/**
 * #1398 project 1: the permanent-delete route for payment methods is gone.
 *
 * Three things have to hold at once, so they are one test rather than three:
 * the old URL answers 404 and changes nothing, the soft-deleted row it was aimed
 * at survives, and that row can still be restored afterwards. Split into separate
 * `it` blocks the last step would fail on state an earlier step destroyed, which
 * is exactly the cascade this suite exists to rule out.
 *
 * The guard spec proves the method and the route are absent from the source; only
 * a request over real HTTP proves the old URL does not fall through to some other
 * handler that still mutates the row.
 */
describe('payment methods cannot be permanently deleted (e2e, #1398 project 1)', () => {
  let app: INestApplication;
  let ds: DataSource;

  const runId = Date.now().toString(36);
  const prefix = `PMPD${runId}`.toUpperCase();

  let adminUserId = '';
  let adminUsername = '';
  let token = '';
  let methodId = '';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();
    ds = moduleFixture.get(DataSource);

    const admin = await seedSuiteAdmin(ds, `${SHARED_E2E_NS}_pmpd_admin_${runId}`);
    adminUserId = admin.id;
    adminUsername = admin.username;

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .set(...SESSION_PROTOCOL)
      .send({ username: adminUsername, password: E2E_ADMIN_PASSWORD });
    token = login.body?.data?.accessToken ?? login.body?.accessToken;
    expect(typeof token).toBe('string');

    // One payment method, soft-deleted directly so the suite does not depend on
    // the soft-delete route to set up the state the permanent route used to destroy.
    const methods = ds.getRepository(PaymentMethodEntity);
    const saved = await methods.save(
      methods.create({
        code: `${prefix.slice(0, 12)}`.toUpperCase(),
        name: `${prefix} soft-deleted`,
        isActive: true,
        useForPurchases: true,
        sortOrder: 0,
      } as any),
    );
    methodId = (saved as unknown as PaymentMethodEntity).id;

    await ds.query('UPDATE payment_methods SET "deletedAt" = now() WHERE id = $1', [methodId]);
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      // The suite's own row is test scaffolding, not business data, so it is
      // removed by id rather than left behind as a soft-deleted method.
      await ds.query('DELETE FROM payment_methods WHERE id = $1', [methodId]);
      await removeSuiteTraces(ds, {
        userIds: [adminUserId],
        usernames: [adminUsername],
        entityIds: [methodId].filter(Boolean),
      });
      await removeSuiteAdmin(ds, adminUsername);
    }
    await app?.close();
  });

  it('the permanent route is gone, the soft-deleted row survives it and can still be restored', async () => {
    const auth = { Authorization: `Bearer ${token}` };

    // 1. The old URL must not answer any more. 404, not 204: if the route were
    //    matched by another handler it could still change the row.
    await request(app.getHttpServer())
      .delete(`/settings/payment-methods/${methodId}/permanent`)
      .set(auth)
      .expect(404);

    // 2. The row it was aimed at is untouched: still present, still soft-deleted.
    const afterPermanent = await ds.query(
      'SELECT "deletedAt" FROM payment_methods WHERE id = $1',
      [methodId],
    );
    expect(afterPermanent).toHaveLength(1);
    expect(afterPermanent[0].deletedAt).not.toBeNull();

    // 3. Restore still works, which is the whole point of dropping permanent
    //    delete instead of dropping the deleted list with it.
    await request(app.getHttpServer())
      .post(`/settings/payment-methods/${methodId}/restore`)
      .set(auth)
      .expect(204);

    const afterRestore = await ds.query(
      'SELECT "deletedAt" FROM payment_methods WHERE id = $1',
      [methodId],
    );
    expect(afterRestore).toHaveLength(1);
    expect(afterRestore[0].deletedAt).toBeNull();
  });
});
