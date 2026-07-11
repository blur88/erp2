import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { DataSource, Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { User, UserRole, UserStatus } from '../src/database/entities/user.entity';

const password = 'Str0ng@Pass!';

// One representative endpoint per accounting controller.
const ENDPOINTS = [
  '/accounting/accounts/tree',
  '/accounting/settings',
  '/accounting/journal-entries',
  '/accounting/general-ledger?accountId=test',
  '/accounting/trial-balance',
];

describe('Accounting access gating (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let users: Repository<User>;

  // Log in each role ONCE and reuse the token. /auth/login is throttled to
  // 5 req/min (@Throttle in auth.controller); logging in per test case (12+
  // calls) trips the throttler under CI's serial timing and every login 403s.
  let adminToken: string;
  let nonAdminToken: string;

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
  });

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
    await app.close();
  });

  it.each(ENDPOINTS)('non-admin is forbidden on GET %s', async (path) => {
    const res = await request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${nonAdminToken}`);
    expect(res.status).toBe(403);
  });

  it.each(ENDPOINTS)('admin is not forbidden on GET %s', async (path) => {
    const res = await request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });

  // Assert valid seeded data exists after app.init() against the real DataSource.
  // NOTE: this proves the seeder produced/verified a correct state, but if the DB
  // was already populated the seeder took its no-op path — so this asserts the
  // *outcome* (1.4 fixed: settings present; 2.4/2.5 fixed: COA present), not that
  // the insert branch specifically ran. The insert path is proven by Task 2 unit tests.
  it('after app.init() the settings singleton exists (1.4 outcome)', async () => {
    const res = await request(app.getHttpServer())
      .get('/accounting/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body).toHaveProperty('cashAccountId');
    expect(res.body.cashAccountId).toBeTruthy();
  });

  it('after app.init() the standard chart of accounts exists (2.4/2.5 outcome)', async () => {
    const res = await request(app.getHttpServer())
      .get('/accounting/accounts/tree')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    // COA endpoint returns a plain array (tree/hierarchy — no .data wrapper).
    const flat = JSON.stringify(res.body);
    expect(flat).toContain('1100'); // Cash
    expect(flat).toContain('6990'); // Other Expenses
  });
});