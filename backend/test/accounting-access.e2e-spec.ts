import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
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

  // Distinct usernames so this suite cannot collide with auth/search e2e specs
  // (which create `admin` / `user_<role>` and TRUNCATE users between tests).
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
