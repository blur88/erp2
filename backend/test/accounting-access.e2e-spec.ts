import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { configureTestAppValidation } from './utils/configure-test-app-validation';
import * as bcrypt from 'bcrypt';
import { DataSource, Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { User, UserRole, UserStatus } from '../src/database/entities/user.entity';

const password = 'Str0ng@Pass!';

describe('Accounting access (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let users: Repository<User>;

  // Log in each role ONCE and reuse the token. /auth/login is throttled to
  // 5 req/min (@Throttle in auth.controller); logging in per test case (12+
  // calls) trips the throttler under CI's serial timing and every login 403s.
  let adminToken: string;
  let nonAdminToken: string;

  // Resolved from the seeded standard COA in beforeAll. The general-ledger
  // endpoint 400s on an unknown accountId, so it needs a real one.
  let cashAccountId: string;

  // Lazy path factories: it.each evaluates its table at COLLECTION time,
  // before beforeAll runs, so an interpolated string would capture an
  // undefined cashAccountId. Each factory is called inside the test body.
  const ENDPOINTS = [
    ['chart of accounts', () => '/accounting/accounts/tree'],
    ['settings', () => '/accounting/settings'],
    ['journal entries', () => '/accounting/journal-entries'],
    [
      'general ledger',
      () => `/accounting/general-ledger?accountId=${encodeURIComponent(cashAccountId)}`,
    ],
    ['trial balance', () => '/accounting/trial-balance'],
  ] as const;

  // Distinct usernames so this suite cannot collide with the auth/search e2e
  // specs. Those suites no longer TRUNCATE users — each now resets only its own
  // namespaced rows (issues #1197, #1199) — but distinct names remain correct:
  // they are what keeps the suites independent of each other's fixtures.
  const ADMIN_USER = 'acct_access_admin';
  const NONADMIN_USER = 'acct_access_sales';

  async function ensureUser(username: string, role: UserRole): Promise<void> {
    if (!(await users.findOneBy({ username }))) {
      await users.save(
        users.create({
          username,
          email: `${username}@test.example`,
          password: await bcrypt.hash(password, 12),
          firstName: 'Test',
          lastName: role,
          role,
          status: UserStatus.ACTIVE,
          isActive: true,
          failedLoginAttempts: 0,
        }),
      );
    }
  }

  async function login(username: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ usernameOrEmail: username, password })
      .expect(200);
    return res.body.accessToken as string;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();
    ds = moduleFixture.get(DataSource);
    users = ds.getRepository(User);
    await ensureUser(ADMIN_USER, UserRole.ADMIN);
    await ensureUser(NONADMIN_USER, UserRole.SALES_STAFF);
    adminToken = await login(ADMIN_USER);
    nonAdminToken = await login(NONADMIN_USER);

    // Fixture discovery uses the ADMIN token deliberately: it keeps setup
    // separate from the non-admin access that is the subject under test.
    const accounts = await request(app.getHttpServer())
      .get('/accounting/accounts')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // COA list returns a plain array (no { data, meta } wrapper).
    const cashAccount = accounts.body.find(
      (account: { code: string }) => account.code === '1100',
    );

    // Assert explicitly: chaining .find(...).id would fail with "Cannot read
    // properties of undefined" if seeding regressed, naming the symptom
    // instead of the cause.
    expect(cashAccount).toBeDefined();
    expect(cashAccount.id).toBeTruthy();
    cashAccountId = cashAccount.id;
  });

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
    await app.close();
  });

  it.each(ENDPOINTS)('allows sales_staff to access %s', async (_label, getPath) => {
    await request(app.getHttpServer())
      .get(getPath())
      .set('Authorization', `Bearer ${nonAdminToken}`)
      .expect(200);
  });

  it.each(ENDPOINTS)('allows admin to access %s', async (_label, getPath) => {
    await request(app.getHttpServer())
      .get(getPath())
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  it.each(ENDPOINTS)('still rejects an unauthenticated request to %s', async (_label, getPath) => {
    await request(app.getHttpServer()).get(getPath()).expect(401);
  });

  describe('journal entries sort validation', () => {
    it('rejects an unsupported sortBy with 400', async () => {
      await request(app.getHttpServer())
        .get('/accounting/journal-entries?sortBy=entryDate')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('rejects an unsupported sortOrder with 400', async () => {
      await request(app.getHttpServer())
        .get('/accounting/journal-entries?sortOrder=descending')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('accepts the supported sortBy=journalNo & sortOrder=ASC', async () => {
      await request(app.getHttpServer())
        .get('/accounting/journal-entries?sortBy=journalNo&sortOrder=ASC')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  // Reads are open to every role (#895), but WRITES stay admin-only. @Auth() is a
  // class-level decorator, so un-gating the controller would otherwise also let any
  // authenticated role create/edit GL accounts and rewire the account mappings that
  // drive auto-posting. Per-method @Auth(UserRole.ADMIN) keeps those closed — same
  // split as payment-method.controller.ts.
  describe('write endpoints stay admin-only', () => {
    it('forbids sales_staff from creating an account', async () => {
      await request(app.getHttpServer())
        .post('/accounting/accounts')
        .set('Authorization', `Bearer ${nonAdminToken}`)
        .send({ code: '9999', name: 'Rogue Account', type: 'expense' })
        .expect(403);
    });

    it('forbids sales_staff from updating an account', async () => {
      await request(app.getHttpServer())
        .patch(`/accounting/accounts/${cashAccountId}`)
        .set('Authorization', `Bearer ${nonAdminToken}`)
        .send({ name: 'Renamed By Non-Admin' })
        .expect(403);
    });

    it('forbids sales_staff from rewiring the account mappings', async () => {
      await request(app.getHttpServer())
        .put('/accounting/settings')
        .set('Authorization', `Bearer ${nonAdminToken}`)
        .send({ cashAccountId })
        .expect(403);
    });

    // The guard rejects before the handler runs, so nothing above was written.
    it('leaves the chart of accounts unchanged after the rejected writes', async () => {
      const res = await request(app.getHttpServer())
        .get('/accounting/accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const codes = res.body.map((account: { code: string }) => account.code);
      expect(codes).not.toContain('9999');
    });
  });

  // Assert valid seeded data exists after app.init() against the real DataSource.
  // NOTE: this proves the seeder produced/verified a correct state, but if the DB
  // was already populated the seeder took its no-op path — so this asserts the
  // *outcome* (1.4 fixed: settings present; 2.4/2.5 fixed: COA present), not that
  // the insert branch specifically ran. The insert path is proven by Task 2 unit tests.
  // Issued with the NON-ADMIN token, so it doubles as un-gating evidence.
  it('after app.init() the settings singleton exists (1.4 outcome)', async () => {
    const res = await request(app.getHttpServer())
      .get('/accounting/settings')
      .set('Authorization', `Bearer ${nonAdminToken}`)
      .expect(200);
    expect(res.body).toHaveProperty('cashAccountId');
    expect(res.body.cashAccountId).toBeTruthy();
  });

  it('after app.init() the standard chart of accounts exists (2.4/2.5 outcome)', async () => {
    const res = await request(app.getHttpServer())
      .get('/accounting/accounts/tree')
      .set('Authorization', `Bearer ${nonAdminToken}`)
      .expect(200);
    // COA endpoint returns a plain array (tree/hierarchy — no .data wrapper).
    const flat = JSON.stringify(res.body);
    expect(flat).toContain('1100'); // Cash
    expect(flat).toContain('6990'); // Other Expenses
  });
});
