import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureTestAppValidation } from './utils/configure-test-app-validation';
import {
  E2E_ADMIN_PASSWORD,
  removeSuiteAdmin,
  seedSuiteAdmin,
} from './utils/shared-e2e-fixture';
import { removeSuiteTraces } from './utils/shared-e2e-traces-fixture';

/**
 * Issue #1248. The legacy `POST /payments/allocate` route was retired: it wrote
 * sales-order payment columns directly, bypassing the order row lock, the
 * overpayment guard (#1245), `paymentStatus` reconciliation and accounting
 * posting that `SalesOrderPaymentService` applies to the same columns.
 *
 * This suite pins the retirement. Deleting the old unit tests removes coverage
 * OF the method but leaves nothing naming the route, so a later change could
 * reintroduce it unnoticed.
 *
 * The request is **authenticated** on purpose. `JwtAuthGuard` is registered
 * globally as an APP_GUARD (`app.module.ts`), so an anonymous request to a
 * route that still existed would also be rejected — with 401, not 404. Only an
 * authenticated request distinguishes "the route is gone" from "the guard
 * turned me away", which is the whole point of the assertion.
 */
const runId = randomUUID().slice(0, 8);

describe('Legacy payment allocation route is retired (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  let adminUserId = '';
  let adminUsername = '';
  let token = '';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();
    ds = moduleFixture.get(DataSource);

    adminUsername = `e2espec_allocret_admin_${runId}`;
    const admin = await seedSuiteAdmin(ds, adminUsername);
    adminUserId = admin.id;

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ usernameOrEmail: adminUsername, password: E2E_ADMIN_PASSWORD });

    // Assert the login itself succeeded before relying on the token. A failed
    // login would yield an empty token, and every 404 below would then be
    // indistinguishable from an unauthenticated request being rejected.
    expect(loginRes.status).toBe(200);
    token = loginRes.body?.data?.accessToken ?? loginRes.body?.accessToken;
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });

  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        await removeSuiteTraces(ds, {
          userIds: [adminUserId].filter(Boolean),
          usernames: [adminUsername].filter(Boolean),
        });
        if (adminUserId) {
          await removeSuiteAdmin(ds, adminUserId);
        }
      }
    } finally {
      await app?.close();
    }
  });

  it('proves the bearer token is accepted on a route that does exist', async () => {
    // Control. Without this, a 404 on /payments/allocate could be explained by
    // a malformed or rejected token rather than by the route's absence.
    const res = await request(app.getHttpServer())
      .get('/payments')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('returns a routing 404 — not a "payment not found" 404 — for a well-formed allocation body', async () => {
    const res = await request(app.getHttpServer())
      .post('/payments/allocate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentId: randomUUID(),
        allocations: [{ salesOrderId: randomUUID(), amount: '10.0000' }],
      });

    expect(res.status).toBe(404);

    // Status alone cannot carry this case. A live route handed a syntactically
    // valid id for a payment that does not exist also answers 404, via
    // NotFoundException('Payment not found') — so a bare status assertion here
    // passes whether or not the route was retired, and is inert.
    // Verified by running this suite against the unretired route: the status
    // check passed, this message check is what goes red.
    const message = JSON.stringify(res.body?.message ?? res.body ?? '');
    expect(message).not.toMatch(/Payment not found/i);
    expect(message).toMatch(/Cannot POST/i);
  });

  it('returns 404 for an authenticated POST /payments/allocate with an empty body', async () => {
    // A retired route 404s before validation. If the route were restored with a
    // body DTO, this would surface as 400 instead — so the assertion also
    // catches a reintroduction that changed the payload shape.
    const res = await request(app.getHttpServer())
      .post('/payments/allocate')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(404);
  });
});
