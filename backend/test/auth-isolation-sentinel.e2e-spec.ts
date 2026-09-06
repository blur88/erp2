import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { User, UserRole, UserStatus } from '../src/database/entities/user.entity';
import { RefreshToken } from '../src/database/entities/refresh-token.entity';
import { configureTestAppValidation } from './utils/configure-test-app-validation';
import {
  AUTH_USERNAMES,
  resetAuthFixtureUsers,
} from './utils/auth-fixture';

// Sentinel user. Deliberately OUTSIDE auth.e2e-spec.ts's namespace ("authspec_*")
// so auth neither creates, resets, nor deletes it. If auth's cleanup owned this
// row, the check below would prove nothing (issue #1197).
const SENTINEL_USERNAME = 'sentinel_isolation_probe';
const SENTINEL_PASSWORD = 'Admin@123!';

// The check is meaningless if auth owns the sentinel. Assert it, don't assume it.
if (AUTH_USERNAMES.includes(SENTINEL_USERNAME)) {
  throw new Error(
    `Sentinel "${SENTINEL_USERNAME}" is inside AUTH_USERNAMES. It must sit ` +
      `outside auth's reset/cleanup ownership set or this check proves nothing.`,
  );
}

describe('Auth isolation sentinel (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let sentinelUserId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();
    ds = app.get(DataSource);

    await ds.query(`DELETE FROM users WHERE username = $1`, [SENTINEL_USERNAME]);
    const saved = await ds.getRepository(User).save(
      ds.getRepository(User).create({
        username: SENTINEL_USERNAME,
        email: `${SENTINEL_USERNAME}@test.com`,
        password: await bcrypt.hash(SENTINEL_PASSWORD, 12),
        firstName: 'Sentinel',
        lastName: 'Probe',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        isActive: true,
        failedLoginAttempts: 0,
      }),
    );
    sentinelUserId = saved.id;
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      await ds.query(`DELETE FROM users WHERE username = $1`, [SENTINEL_USERNAME]);
      await ds.destroy();
    }
    await app.close();
  });

  it("survives auth's fixture operations with its token, user row and refresh tokens intact", async () => {
    // 1. Authenticate BEFORE auth's destructive operations.
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ usernameOrEmail: SENTINEL_USERNAME, password: SENTINEL_PASSWORD })
      .expect(200); // /auth/login returns 200, not 201 (auth.e2e-spec.ts:74)
    const token = login.body?.data?.accessToken ?? login.body?.accessToken;
    expect(token).toBeTruthy();

    const tokensBefore = await ds
      .getRepository(RefreshToken)
      .count({ where: { userId: sentinelUserId } });
    expect(tokensBefore).toBeGreaterThan(0);

    // 2. Run auth's REAL fixture operation — the exact function
    //    auth.e2e-spec.ts calls in its own beforeEach/afterAll, imported from
    //    the shared module. Not a copy: a duplicated implementation would stop
    //    testing the real path the moment the two drifted.
    await resetAuthFixtureUsers(ds);

    // 3. The same token must still authenticate, and the rows must survive.
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const userRow = await ds
      .getRepository(User)
      .findOne({ where: { id: sentinelUserId } });
    expect(userRow).not.toBeNull();

    const tokensAfter = await ds
      .getRepository(RefreshToken)
      .count({ where: { userId: sentinelUserId } });
    expect(tokensAfter).toBe(tokensBefore);
  });
});
