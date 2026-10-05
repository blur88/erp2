import { jest } from '@jest/globals';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { createHash } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { configureTestAppValidation } from './utils/configure-test-app-validation';
import {
  AUTHSESS_NS,
  AUTHSESS_USERS,
  AUTHSESS_PASSWORD,
  seedSessionUsers,
  removeSessionSuiteRows,
  holdRowLock,
  waitForBlockedBy,
} from './utils/auth-session-fixture';
import bcrypt from 'bcrypt';
import { AuthSession } from '../src/database/entities/auth-session.entity';
import { RefreshToken } from '../src/database/entities/refresh-token.entity';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { User, UserStatus } from '../src/database/entities/user.entity';
import { AuthService } from '../src/modules/auth/auth.service';
import passport from 'passport';
import { AuthClock } from '../src/modules/auth/auth-clock';
import { ReplayAuditWriter } from '../src/modules/auth/replay-audit.writer';
import { REFRESH_KEYS, type RefreshKeySet } from '../src/modules/auth/tokens/refresh-keys';
import { encodeRefreshToken } from '../src/modules/auth/tokens/refresh-token.codec';
import { JwtStrategy } from '../src/modules/auth/strategies/jwt.strategy';

describe('Auth Sessions (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;
  let refreshKeys: RefreshKeySet;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
    jwtService = moduleFixture.get<JwtService>(JwtService);
    refreshKeys = moduleFixture.get<RefreshKeySet>(REFRESH_KEYS);

    await seedSessionUsers(dataSource);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await removeSessionSuiteRows(dataSource);
      await dataSource.destroy();
    }
    await app.close();
  });

  beforeEach(async () => {
    passport.use(app.get(JwtStrategy));
    await seedSessionUsers(dataSource);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
  });

  describe('issuing and rotation', () => {
    it('sign-in creates a session', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          username: AUTHSESS_USERS[0],
          password: AUTHSESS_PASSWORD,
        })
        .expect(200);

      expect(res.body).toHaveProperty('sessionId');
      expect(res.body.sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(res.body.generation).toBe(1);

      const decodedAccess: any = jwtService.decode(res.body.accessToken);
      expect(decodedAccess.sid).toBe(res.body.sessionId);
      expect(res.body.accessTokenExpiresAt).toBe(decodedAccess.exp);

      const session = await dataSource.getRepository(AuthSession).findOneBy({
        id: res.body.sessionId,
      });
      expect(session).not.toBeNull();
      expect(session!.generation).toBe(1);
      expect(session!.revokedAt).toBeNull();

      const tokenHash = createHash('sha256').update(res.body.refreshToken).digest('hex');
      const tokenRow = await dataSource.getRepository(RefreshToken).findOneBy({
        sessionId: res.body.sessionId,
      });
      expect(tokenRow).not.toBeNull();
      expect(tokenRow!.generation).toBe(1);
      expect(tokenRow!.supersededAt).toBeNull();
      expect(tokenRow!.tokenHash).toBe(tokenHash);
    });

    it('refresh token carries no profile claims', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          username: AUTHSESS_USERS[0],
          password: AUTHSESS_PASSWORD,
        })
        .expect(200);

      const decoded: any = jwtService.decode(res.body.refreshToken, { complete: true });
      expect(decoded.header.typ).toBe('erp-refresh+jwt');
      expect(Object.keys(decoded.payload).sort()).toEqual(
        ['exp', 'gen', 'iat', 'jti', 'sid', 'sub'].sort(),
      );
    });

    it('registration creates a session', async () => {
      const regUsername = `${AUTHSESS_NS}_registered`;
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          username: regUsername,
          email: `${regUsername}@example.com`,
          password: 'Password@123!',
          passwordConfirmation: 'Password@123!',
          firstName: 'Reg',
          lastName: 'User',
        })
        .expect(201);

      expect(res.body).toHaveProperty('sessionId');
      expect(res.body.sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(res.body.generation).toBe(1);

      const decodedAccess: any = jwtService.decode(res.body.accessToken);
      expect(decodedAccess.sid).toBe(res.body.sessionId);
      expect(res.body.accessTokenExpiresAt).toBe(decodedAccess.exp);

      const session = await dataSource.getRepository(AuthSession).findOneBy({
        id: res.body.sessionId,
      });
      expect(session).not.toBeNull();
      expect(session!.generation).toBe(1);
      expect(session!.revokedAt).toBeNull();

      const tokenHash = createHash('sha256').update(res.body.refreshToken).digest('hex');
      const tokenRow = await dataSource.getRepository(RefreshToken).findOneBy({
        sessionId: res.body.sessionId,
      });
      expect(tokenRow).not.toBeNull();
      expect(tokenRow!.generation).toBe(1);
      expect(tokenRow!.supersededAt).toBeNull();
      expect(tokenRow!.tokenHash).toBe(tokenHash);
    });

    it('refresh rotates', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          username: AUTHSESS_USERS[0],
          password: AUTHSESS_PASSWORD,
        })
        .expect(200);

      const refreshRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: loginRes.body.refreshToken })
        .expect(200);

      expect(refreshRes.body.sessionId).toBe(loginRes.body.sessionId);
      expect(refreshRes.body.generation).toBe(2);
      expect(refreshRes.body.refreshToken).not.toBe(loginRes.body.refreshToken);

      const g1Row = await dataSource.getRepository(RefreshToken).findOneBy({
        sessionId: loginRes.body.sessionId,
        generation: 1,
      });
      expect(g1Row).not.toBeNull();
      expect(g1Row!.supersededAt).not.toBeNull();
      expect(g1Row!.graceUntil).not.toBeNull();
      const diffMs = g1Row!.graceUntil!.getTime() - g1Row!.supersededAt!.getTime();
      expect(diffMs).toBe(60000);

      const g2Row = await dataSource.getRepository(RefreshToken).findOneBy({
        sessionId: loginRes.body.sessionId,
        generation: 2,
      });
      expect(g2Row).not.toBeNull();

      const session = await dataSource.getRepository(AuthSession).findOneBy({
        id: loginRes.body.sessionId,
      });
      expect(session!.generation).toBe(2);
      expect(session!.expiresAt.getTime()).toBe(g2Row!.expiresAt.getTime());
    });

    it('refresh rejects a malformed token', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'malformed.token.value' })
        .expect(401);

      expect(res.body.code).toBe('REFRESH_INVALID');
    });

    it('refresh rejects an access token', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          username: AUTHSESS_USERS[0],
          password: AUTHSESS_PASSWORD,
        })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: loginRes.body.accessToken })
        .expect(401);

      expect(res.body.code).toBe('REFRESH_INVALID');
    });

    it('refresh rejects a well-signed token with no stored row', async () => {
      const randomSid = '99999999-9999-4999-8999-999999999999';
      const nowSec = Math.floor(Date.now() / 1000);
      const forgedToken = encodeRefreshToken(
        {
          userId: '11111111-1111-4111-8111-111111111111',
          sessionId: randomSid,
          generation: 1,
          issuedAt: nowSec,
          expiresAt: nowSec + 3600,
          keyId: refreshKeys.activeKid,
        },
        refreshKeys,
      );

      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: forgedToken })
        .expect(401);

      expect(res.body.code).toBe('REFRESH_INVALID');
    });
  });

  describe('recovery and replay', () => {
    it('two concurrent refreshes with one token', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);

      const g1Token = loginRes.body.refreshToken;
      const sid = loginRes.body.sessionId;

      const [res1, res2] = await Promise.all([
        request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken: g1Token }),
        request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken: g1Token }),
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.body.generation).toBe(2);
      expect(res2.body.generation).toBe(2);
      expect(res1.body.refreshToken).toBe(res2.body.refreshToken);

      const count = await dataSource.getRepository(RefreshToken).countBy({ sessionId: sid });
      expect(count).toBe(2);
    });

    it('recovery writes nothing', async () => {
      const clock = app.get(AuthClock);
      const T0 = new Date('2026-10-05T12:00:00.000Z');
      let currentMockTime = T0;
      jest.spyOn(clock, 'now').mockImplementation(() => new Date(currentMockTime.getTime()));

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);
      const g1Token = loginRes.body.refreshToken;
      const sid = loginRes.body.sessionId;

      const rotRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: g1Token })
        .expect(200);
      const g2Token = rotRes.body.refreshToken;
      const g2Access = rotRes.body.accessToken;

      const sessionSnapshot = await dataSource.getRepository(AuthSession).findOneBy({ id: sid });
      const tokensSnapshot = await dataSource
        .getRepository(RefreshToken)
        .find({ where: { sessionId: sid }, order: { generation: 'ASC' } });

      currentMockTime = new Date(T0.getTime() + 30 * 1000);

      const recRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: g1Token })
        .expect(200);

      expect(recRes.body.refreshToken).toBe(g2Token);
      expect(recRes.body.accessToken).not.toBe(g2Access);

      const sessionAfter = await dataSource.getRepository(AuthSession).findOneBy({ id: sid });
      const tokensAfter = await dataSource
        .getRepository(RefreshToken)
        .find({ where: { sessionId: sid }, order: { generation: 'ASC' } });

      expect(JSON.stringify(sessionAfter)).toBe(JSON.stringify(sessionSnapshot));
      expect(JSON.stringify(tokensAfter)).toBe(JSON.stringify(tokensSnapshot));
    });

    it('recovery returns the stored expiry, not a new one', async () => {
      const clock = app.get(AuthClock);
      const T0 = new Date('2026-10-05T12:00:00.000Z');
      let currentMockTime = T0;
      jest.spyOn(clock, 'now').mockImplementation(() => new Date(currentMockTime.getTime()));

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);
      const sid = loginRes.body.sessionId;

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: loginRes.body.refreshToken })
        .expect(200);

      const g2Row = await dataSource.getRepository(RefreshToken).findOneBy({
        sessionId: sid,
        generation: 2,
      });

      currentMockTime = new Date(T0.getTime() + 30 * 1000);

      const recRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: loginRes.body.refreshToken })
        .expect(200);

      const decoded: any = jwtService.decode(recRes.body.refreshToken);
      expect(decoded.exp).toBe(Math.floor(g2Row!.expiresAt.getTime() / 1000));
    });

    it("three generations, inside G1's own deadline", async () => {
      const clock = app.get(AuthClock);
      const T0 = new Date('2026-10-05T12:00:00.000Z');
      let currentMockTime = T0;
      jest.spyOn(clock, 'now').mockImplementation(() => new Date(currentMockTime.getTime()));

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);
      const g1Token = loginRes.body.refreshToken;

      const rot1 = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: g1Token })
        .expect(200);

      currentMockTime = new Date(T0.getTime() + 10 * 1000);
      const rot2 = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: rot1.body.refreshToken })
        .expect(200);
      const g3Token = rot2.body.refreshToken;

      currentMockTime = new Date(T0.getTime() + 59 * 1000);
      const recRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: g1Token })
        .expect(200);

      expect(recRes.body.generation).toBe(3);
      expect(recRes.body.refreshToken).toBe(g3Token);
    });

    it('three generations, at the deadline', async () => {
      const clock = app.get(AuthClock);
      const T0 = new Date('2026-10-05T12:00:00.000Z');
      let currentMockTime = T0;
      jest.spyOn(clock, 'now').mockImplementation(() => new Date(currentMockTime.getTime()));

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);
      const g1Token = loginRes.body.refreshToken;
      const sid = loginRes.body.sessionId;

      const rot1 = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: g1Token })
        .expect(200);

      currentMockTime = new Date(T0.getTime() + 10 * 1000);
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: rot1.body.refreshToken })
        .expect(200);

      currentMockTime = new Date(T0.getTime() + 60 * 1000);
      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: g1Token })
        .expect(401);

      expect(res.body.code).toBe('SESSION_REVOKED');
      const session = await dataSource.getRepository(AuthSession).findOneBy({ id: sid });
      expect(session!.revokeReason).toBe('replay');
    });

    it('replay after grace', async () => {
      const clock = app.get(AuthClock);
      const T0 = new Date('2026-10-05T12:00:00.000Z');
      let currentMockTime = T0;
      jest.spyOn(clock, 'now').mockImplementation(() => new Date(currentMockTime.getTime()));

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);
      const g1Token = loginRes.body.refreshToken;
      const sid = loginRes.body.sessionId;

      const rotRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: g1Token })
        .expect(200);
      const g2Token = rotRes.body.refreshToken;

      currentMockTime = new Date(T0.getTime() + 61 * 1000);
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: g1Token })
        .expect(401);

      const session = await dataSource.getRepository(AuthSession).findOneBy({ id: sid });
      expect(session!.revokedAt).not.toBeNull();
      expect(session!.revokeReason).toBe('replay');

      const g2Attempt = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: g2Token })
        .expect(401);
      expect(g2Attempt.body.code).toBe('SESSION_REVOKED');

      const auditLog = await dataSource.getRepository(AuditLog).findOneBy({
        action: 'SESSION_REPLAY_REVOKED',
        entityId: sid,
      });
      expect(auditLog).not.toBeNull();
      expect(auditLog!.metadata).toEqual({ presentedGeneration: 1, currentGeneration: 2 });
      const auditJson = JSON.stringify(auditLog);
      expect(auditJson).not.toContain(g1Token);
      expect(auditJson).not.toContain(g2Token);
      const g1Hash = createHash('sha256').update(g1Token).digest('hex');
      const g2Hash = createHash('sha256').update(g2Token).digest('hex');
      expect(auditJson).not.toContain(g1Hash);
      expect(auditJson).not.toContain(g2Hash);

      // Second user's session created in the same test still refreshes with 200
      const user2Login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[1], password: AUTHSESS_PASSWORD })
        .expect(200);
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: user2Login.body.refreshToken })
        .expect(200);
    });

    it('the replay revocation and its audit row are committed although the request fails', async () => {
      const clock = app.get(AuthClock);
      const T0 = new Date('2026-10-05T12:00:00.000Z');
      let currentMockTime = T0;
      jest.spyOn(clock, 'now').mockImplementation(() => new Date(currentMockTime.getTime()));

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);
      const g1Token = loginRes.body.refreshToken;
      const sid = loginRes.body.sessionId;

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: g1Token })
        .expect(200);

      currentMockTime = new Date(T0.getTime() + 61 * 1000);
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: g1Token })
        .expect(401);

      const qr = dataSource.createQueryRunner();
      await qr.connect();
      try {
        const sessions = await qr.query(
          'SELECT "revokedAt", "revokeReason" FROM auth_sessions WHERE id = $1',
          [sid],
        );
        expect(sessions.length).toBe(1);
        expect(sessions[0].revokedAt).not.toBeNull();
        expect(sessions[0].revokeReason).toBe('replay');

        const logs = await qr.query(
          'SELECT id, action, metadata FROM audit_logs WHERE "entityId" = $1 AND action = $2',
          [sid, 'SESSION_REPLAY_REVOKED'],
        );
        expect(logs.length).toBe(1);
      } finally {
        await qr.release();
      }
    });

    it('revocation and audit are atomic', async () => {
      const clock = app.get(AuthClock);
      const T0 = new Date('2026-10-05T12:00:00.000Z');
      let currentMockTime = T0;
      jest.spyOn(clock, 'now').mockImplementation(() => new Date(currentMockTime.getTime()));

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);
      const g1Token = loginRes.body.refreshToken;
      const sid = loginRes.body.sessionId;

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: g1Token })
        .expect(200);

      currentMockTime = new Date(T0.getTime() + 61 * 1000);

      const spy = jest
        .spyOn(app.get(ReplayAuditWriter), 'write')
        .mockRejectedValue(new Error('audit down'));

      const failRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: g1Token });

      expect(failRes.status).toBeGreaterThanOrEqual(500);
      expect(failRes.body.accessToken).toBeUndefined();
      expect(failRes.body.refreshToken).toBeUndefined();
      expect(failRes.body.code).not.toBe('SESSION_REVOKED');

      const qr = dataSource.createQueryRunner();
      await qr.connect();
      try {
        const sessions = await qr.query(
          'SELECT "revokedAt" FROM auth_sessions WHERE id = $1',
          [sid],
        );
        expect(sessions[0].revokedAt).toBeNull();
        const logs = await qr.query(
          'SELECT id FROM audit_logs WHERE "entityId" = $1 AND action = $2',
          [sid, 'SESSION_REPLAY_REVOKED'],
        );
        expect(logs.length).toBe(0);
      } finally {
        await qr.release();
      }

      spy.mockRestore();

      const retryRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: g1Token })
        .expect(401);

      expect(retryRes.body.code).toBe('SESSION_REVOKED');
      const session = await dataSource.getRepository(AuthSession).findOneBy({ id: sid });
      expect(session!.revokedAt).not.toBeNull();
      expect(session!.revokeReason).toBe('replay');

      const logs = await dataSource.getRepository(AuditLog).findBy({
        entityId: sid,
        action: 'SESSION_REPLAY_REVOKED',
      });
      expect(logs.length).toBe(1);
    });

    it('expired token is not replay', async () => {
      const clock = app.get(AuthClock);
      const T0 = new Date('2026-10-05T12:00:00.000Z');
      let currentMockTime = T0;
      jest.spyOn(clock, 'now').mockImplementation(() => new Date(currentMockTime.getTime()));

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);
      const g1Token = loginRes.body.refreshToken;
      const sid = loginRes.body.sessionId;

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: g1Token })
        .expect(200);

      const g1Row = await dataSource.getRepository(RefreshToken).findOneBy({
        sessionId: sid,
        generation: 1,
      });

      currentMockTime = new Date(g1Row!.expiresAt.getTime() + 1000);
      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: g1Token })
        .expect(401);

      expect(res.body.code).toBe('REFRESH_EXPIRED');
      const session = await dataSource.getRepository(AuthSession).findOneBy({ id: sid });
      expect(session!.revokedAt).toBeNull();
      const logs = await dataSource.getRepository(AuditLog).findBy({
        entityId: sid,
        action: 'SESSION_REPLAY_REVOKED',
      });
      expect(logs.length).toBe(0);
    });

    it('expired session', async () => {
      const clock = app.get(AuthClock);
      const T0 = new Date('2026-10-05T12:00:00.000Z');
      let currentMockTime = T0;
      jest.spyOn(clock, 'now').mockImplementation(() => new Date(currentMockTime.getTime()));

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);
      const g1Token = loginRes.body.refreshToken;
      const sid = loginRes.body.sessionId;

      const session = await dataSource.getRepository(AuthSession).findOneBy({ id: sid });
      currentMockTime = new Date(session!.expiresAt.getTime() + 1000);

      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: g1Token })
        .expect(401);

      expect(res.body.code).toBe('REFRESH_EXPIRED');
      const sessionAfter = await dataSource.getRepository(AuthSession).findOneBy({ id: sid });
      expect(sessionAfter!.revokedAt).toBeNull();
    });

    it('a revoked session never recovers', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);
      const g1Token = loginRes.body.refreshToken;
      const sid = loginRes.body.sessionId;

      const rotRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: g1Token })
        .expect(200);
      const g2Token = rotRes.body.refreshToken;

      await dataSource.query(
        'UPDATE auth_sessions SET "revokedAt" = NOW(), "revokeReason" = $1 WHERE id = $2',
        ['logout', sid],
      );

      const resG1 = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: g1Token })
        .expect(401);
      expect(resG1.body.code).toBe('SESSION_REVOKED');

      const resG2 = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: g2Token })
        .expect(401);
      expect(resG2.body.code).toBe('SESSION_REVOKED');
    });

    it('the clock is read under the lock', async () => {
      const clock = app.get(AuthClock);
      const T0 = new Date('2026-10-05T12:00:00.000Z');
      let currentMockTime = T0;
      jest.spyOn(clock, 'now').mockImplementation(() => new Date(currentMockTime.getTime()));

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);
      const g1Token = loginRes.body.refreshToken;
      const sid = loginRes.body.sessionId;

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: g1Token })
        .expect(200);

      currentMockTime = new Date(T0.getTime() + 59 * 1000);

      const lock = await holdRowLock(
        dataSource,
        'SELECT id FROM auth_sessions WHERE id = $1 FOR UPDATE',
        [sid],
      );

      let reqPromise: Promise<request.Response> | undefined;
      try {
        reqPromise = request(app.getHttpServer())
          .post('/auth/refresh')
          .send({ refreshToken: g1Token });
        void reqPromise.catch(() => {});

        await waitForBlockedBy(dataSource, lock, 1);
        currentMockTime = new Date(T0.getTime() + 61 * 1000);
        await lock.release();

        const res = await reqPromise;
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('SESSION_REVOKED');

        const session = await dataSource.getRepository(AuthSession).findOneBy({ id: sid });
        expect(session!.revokeReason).toBe('replay');
      } finally {
        try {
          await lock.release();
        } catch {}
        if (reqPromise) await reqPromise.catch(() => {});
      }
    });

    it('unknown key', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);
      const sid = loginRes.body.sessionId;

      const nowSec = Math.floor(Date.now() / 1000);
      const unknownKeySet: RefreshKeySet = {
        activeKid: 'unknown_key_id',
        secretFor: () => 'some_secret_key_that_is_32_bytes_long_ok',
        kids: () => ['unknown_key_id'],
      };

      const unknownToken = encodeRefreshToken(
        {
          userId: loginRes.body.user.id,
          sessionId: sid,
          generation: 1,
          issuedAt: nowSec,
          expiresAt: nowSec + 3600,
          keyId: 'unknown_key_id',
        },
        unknownKeySet,
      );

      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: unknownToken })
        .expect(401);

      expect(res.body.code).toBe('REFRESH_KEY_UNAVAILABLE');

      const session = await dataSource.getRepository(AuthSession).findOneBy({ id: sid });
      expect(session!.revokedAt).toBeNull();
    });

    it('reproduction across instances and restarts', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);
      const g1Token = loginRes.body.refreshToken;

      const fixtureB = await Test.createTestingModule({ imports: [AppModule] }).compile();
      const appB = fixtureB.createNestApplication();
      configureTestAppValidation(appB);
      await appB.init();

      const rotRes = await request(appB.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: g1Token })
        .expect(200);
      const g2TokenFromB = rotRes.body.refreshToken;
      await appB.close();

      const fixtureC = await Test.createTestingModule({ imports: [AppModule] }).compile();
      const appC = fixtureC.createNestApplication();
      configureTestAppValidation(appC);
      await appC.init();

      const recRes = await request(appC.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: g1Token })
        .expect(200);

      expect(recRes.body.refreshToken).toBe(g2TokenFromB);
      await appC.close();
    });

    it('reproduction across signing-key rotation', async () => {
      const k1Secret = '11111111111111111111111111111111';
      const k2Secret = '22222222222222222222222222222222';
      const keys1: RefreshKeySet = {
        activeKid: 'k1',
        secretFor: (kid: string) => (kid === 'k1' ? k1Secret : undefined),
        kids: () => ['k1'],
      };
      const keys2: RefreshKeySet = {
        activeKid: 'k2',
        secretFor: (kid: string) => (kid === 'k1' ? k1Secret : kid === 'k2' ? k2Secret : undefined),
        kids: () => ['k1', 'k2'],
      };

      const fixture1 = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(REFRESH_KEYS)
        .useValue(keys1)
        .compile();
      const app1 = fixture1.createNestApplication();
      configureTestAppValidation(app1);
      await app1.init();

      const loginRes = await request(app1.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);
      const g1Token = loginRes.body.refreshToken;

      const rotRes = await request(app1.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: g1Token })
        .expect(200);
      const g2Token = rotRes.body.refreshToken;
      await app1.close();

      const fixture2 = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(REFRESH_KEYS)
        .useValue(keys2)
        .compile();
      const app2 = fixture2.createNestApplication();
      configureTestAppValidation(app2);
      await app2.init();

      const recRes = await request(app2.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: g1Token })
        .expect(200);
      expect(recRes.body.refreshToken).toBe(g2Token);

      const rot2Res = await request(app2.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: g2Token })
        .expect(200);
      const g3Token = rot2Res.body.refreshToken;
      const decodedHeader: any = jwtService.decode(g3Token, { complete: true });
      expect(decodedHeader.header.kid).toBe('k2');

      await app2.close();
    });

    it('recovery fails closed on a hash mismatch', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);
      const g1Token = loginRes.body.refreshToken;
      const sid = loginRes.body.sessionId;

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: g1Token })
        .expect(200);

      await dataSource.query(
        'UPDATE refresh_tokens SET "tokenHash" = $1 WHERE "sessionId" = $2 AND generation = 2',
        ['corrupted_hash_value', sid],
      );

      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: g1Token })
        .expect(401);

      expect(res.body.code).toBe('REFRESH_INVALID');
      const session = await dataSource.getRepository(AuthSession).findOneBy({ id: sid });
      expect(session!.revokedAt).toBeNull();
    });

    it('recovery reports a missing signing key', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);
      const g1Token = loginRes.body.refreshToken;
      const sid = loginRes.body.sessionId;

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: g1Token })
        .expect(200);

      await dataSource.query(
        'UPDATE refresh_tokens SET "keyId" = $1 WHERE "sessionId" = $2 AND generation = 2',
        ['gone', sid],
      );

      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: g1Token })
        .expect(401);

      expect(res.body.code).toBe('REFRESH_KEY_UNAVAILABLE');
      const session = await dataSource.getRepository(AuthSession).findOneBy({ id: sid });
      expect(session!.revokedAt).toBeNull();
    });

    it('deactivated user', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);
      const sid = loginRes.body.sessionId;

      await dataSource.query(
        'UPDATE users SET status = $1 WHERE id = $2',
        [UserStatus.INACTIVE, loginRes.body.user.id],
      );

      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: loginRes.body.refreshToken })
        .expect(401);

      const session = await dataSource.getRepository(AuthSession).findOneBy({ id: sid });
      expect(session!.revokedAt).toBeNull();
      const logs = await dataSource.getRepository(AuditLog).findBy({
        entityId: sid,
        action: 'SESSION_REPLAY_REVOKED',
      });
      expect(logs.length).toBe(0);
    });
  });

  describe('logout', () => {
    it('revokes only its own session', async () => {
      const login1 = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);
      const s1 = login1.body.sessionId;
      const t1 = login1.body.refreshToken;

      const login2 = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);
      const s2 = login2.body.sessionId;
      const t2 = login2.body.refreshToken;

      await request(app.getHttpServer())
        .post('/auth/logout')
        .send({ refreshToken: t1 })
        .expect(204);

      const sess1 = await dataSource.getRepository(AuthSession).findOneBy({ id: s1 });
      expect(sess1!.revokedAt).not.toBeNull();
      expect(sess1!.revokeReason).toBe('logout');

      const sess2 = await dataSource.getRepository(AuthSession).findOneBy({ id: s2 });
      expect(sess2!.revokedAt).toBeNull();

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: t2 })
        .expect(200);
    });

    it('ignores the Authorization header', async () => {
      const login1 = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);
      const s1 = login1.body.sessionId;
      const t1 = login1.body.refreshToken;

      const login2 = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);
      const s2 = login2.body.sessionId;
      const a2 = login2.body.accessToken;

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${a2}`)
        .send({ refreshToken: t1 })
        .expect(204);

      const sess1 = await dataSource.getRepository(AuthSession).findOneBy({ id: s1 });
      expect(sess1!.revokedAt).not.toBeNull();
      expect(sess1!.revokeReason).toBe('logout');

      const sess2 = await dataSource.getRepository(AuthSession).findOneBy({ id: s2 });
      expect(sess2!.revokedAt).toBeNull();
    });

    it('works with an expired access token', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);
      const s1 = login.body.sessionId;
      const t1 = login.body.refreshToken;

      const expiredAccess = jwtService.sign(
        { sub: login.body.user.id, sid: s1 },
        { expiresIn: '-1s' },
      );

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${expiredAccess}`)
        .send({ refreshToken: t1 })
        .expect(204);

      const sess1 = await dataSource.getRepository(AuthSession).findOneBy({ id: s1 });
      expect(sess1!.revokedAt).not.toBeNull();
      expect(sess1!.revokeReason).toBe('logout');
    });

    it("works with a revoked session's access token", async () => {
      const login1 = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);
      const s1 = login1.body.sessionId;
      const a1 = login1.body.accessToken;
      const t1 = login1.body.refreshToken;

      const login2 = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);
      const s2 = login2.body.sessionId;
      const t2 = login2.body.refreshToken;

      // Logout S1 first
      await request(app.getHttpServer())
        .post('/auth/logout')
        .send({ refreshToken: t1 })
        .expect(204);

      // Now logout S2 presenting S1's access token
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${a1}`)
        .send({ refreshToken: t2 })
        .expect(204);

      const sess2 = await dataSource.getRepository(AuthSession).findOneBy({ id: s2 });
      expect(sess2!.revokedAt).not.toBeNull();
      expect(sess2!.revokeReason).toBe('logout');
    });

    it('is idempotent', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);
      const s1 = login.body.sessionId;
      const t1 = login.body.refreshToken;

      await request(app.getHttpServer())
        .post('/auth/logout')
        .send({ refreshToken: t1 })
        .expect(204);

      const sessAfter1 = await dataSource.getRepository(AuthSession).findOneBy({ id: s1 });
      expect(sessAfter1!.revokedAt).not.toBeNull();

      await request(app.getHttpServer())
        .post('/auth/logout')
        .send({ refreshToken: t1 })
        .expect(204);

      const sessAfter2 = await dataSource.getRepository(AuthSession).findOneBy({ id: s1 });
      expect(sessAfter2!.revokedAt!.getTime()).toBe(sessAfter1!.revokedAt!.getTime());
    });

    it('accepts a superseded token', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);
      const s1 = login.body.sessionId;
      const g1Token = login.body.refreshToken;

      // Rotate to G2
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: g1Token })
        .expect(200);

      // Logout with G1 token
      await request(app.getHttpServer())
        .post('/auth/logout')
        .send({ refreshToken: g1Token })
        .expect(204);

      const sess = await dataSource.getRepository(AuthSession).findOneBy({ id: s1 });
      expect(sess!.revokedAt).not.toBeNull();
      expect(sess!.revokeReason).toBe('logout');

      const auditLogs = await dataSource.getRepository(AuditLog).findBy({
        entityId: s1,
        action: 'SESSION_REPLAY_REVOKED',
      });
      expect(auditLogs.length).toBe(0);
    });

    it('accepts a retained expired token', async () => {
      const clock = app.get(AuthClock);
      const T0 = new Date('2026-10-05T12:00:00.000Z');
      let currentMockTime = T0;
      jest.spyOn(clock, 'now').mockImplementation(() => new Date(currentMockTime.getTime()));

      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);
      const s1 = login.body.sessionId;
      const t1 = login.body.refreshToken;

      const tokenRow = await dataSource.getRepository(RefreshToken).findOneBy({ sessionId: s1 });
      // Move clock past token expiresAt
      currentMockTime = new Date(tokenRow!.expiresAt.getTime() + 10 * 1000);

      await request(app.getHttpServer())
        .post('/auth/logout')
        .send({ refreshToken: t1 })
        .expect(204);

      const sess = await dataSource.getRepository(AuthSession).findOneBy({ id: s1 });
      expect(sess!.revokedAt).not.toBeNull();
      expect(sess!.revokeReason).toBe('logout');
    });

    it('is a no-op once the row is purged', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);
      const s1 = login.body.sessionId;
      const t1 = login.body.refreshToken;

      await dataSource.query('DELETE FROM refresh_tokens WHERE "sessionId" = $1', [s1]);

      await request(app.getHttpServer())
        .post('/auth/logout')
        .send({ refreshToken: t1 })
        .expect(204);

      const sess = await dataSource.getRepository(AuthSession).findOneBy({ id: s1 });
      expect(sess!.revokedAt).toBeNull();
    });

    it('is a no-op for an unknown key', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);
      const s1 = login.body.sessionId;

      const nowSec = Math.floor(Date.now() / 1000);
      const unknownKeySet: RefreshKeySet = {
        activeKid: 'unknown_key_id',
        secretFor: () => 'some_secret_key_that_is_32_bytes_long_ok',
        kids: () => ['unknown_key_id'],
      };
      const unknownToken = encodeRefreshToken(
        {
          userId: login.body.user.id,
          sessionId: s1,
          generation: 1,
          issuedAt: nowSec,
          expiresAt: nowSec + 3600,
          keyId: 'unknown_key_id',
        },
        unknownKeySet,
      );

      await request(app.getHttpServer())
        .post('/auth/logout')
        .send({ refreshToken: unknownToken })
        .expect(204);

      const sess = await dataSource.getRepository(AuthSession).findOneBy({ id: s1 });
      expect(sess!.revokedAt).toBeNull();
    });

    it.each([
      { name: 'undefined body', body: undefined },
      { name: 'empty object', body: {} },
      { name: 'numeric refreshToken', body: { refreshToken: 42 } },
      // 50,000 characters to stay comfortably within the default 100kb body limit
      { name: 'large string', body: { refreshToken: 'x'.repeat(50000) } },
      { name: 'non-jwt string', body: { refreshToken: 'not.a.jwt' } },
    ])('tolerates $name', async ({ body }) => {
      const req = request(app.getHttpServer()).post('/auth/logout');
      if (body !== undefined) {
        req.send(body);
      }
      await req.expect(204);
    });
  });

  describe('password change', () => {
    it('revokes every session of the user', async () => {
      const login1 = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);
      const login2 = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);
      const user2Login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[1], password: AUTHSESS_PASSWORD })
        .expect(200);

      const newPass = 'NewSecurePass@123!';
      await request(app.getHttpServer())
        .patch('/auth/change-password')
        .set('Authorization', `Bearer ${login1.body.accessToken}`)
        .send({
          currentPassword: AUTHSESS_PASSWORD,
          newPassword: newPass,
          newPasswordConfirmation: newPass,
        })
        .expect(204);

      const s1 = await dataSource.getRepository(AuthSession).findOneBy({ id: login1.body.sessionId });
      const s2 = await dataSource.getRepository(AuthSession).findOneBy({ id: login2.body.sessionId });
      const sOther = await dataSource.getRepository(AuthSession).findOneBy({ id: user2Login.body.sessionId });

      expect(s1!.revokedAt).not.toBeNull();
      expect(s1!.revokeReason).toBe('password_change');
      expect(s2!.revokedAt).not.toBeNull();
      expect(s2!.revokeReason).toBe('password_change');
      expect(sOther!.revokedAt).toBeNull();
    });

    it('wrong current password is a 400', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);

      const userBefore = await dataSource.getRepository(User).findOneByOrFail({ username: AUTHSESS_USERS[0] });

      const res = await request(app.getHttpServer())
        .patch('/auth/change-password')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .send({
          currentPassword: 'WrongPassword@999!',
          newPassword: 'NewSecurePass@123!',
          newPasswordConfirmation: 'NewSecurePass@123!',
        })
        .expect(400);

      expect(res.body.code).toBe('CURRENT_PASSWORD_INCORRECT');

      const userAfter = await dataSource.getRepository(User).findOneByOrFail({ username: AUTHSESS_USERS[0] });
      expect(userAfter.password).toBe(userBefore.password);

      const session = await dataSource.getRepository(AuthSession).findOneBy({ id: login.body.sessionId });
      expect(session!.revokedAt).toBeNull();
    });

    it('a sign-in that verified the old password cannot create a session afterwards', async () => {
      const user = await dataSource.getRepository(User).findOneByOrFail({ username: AUTHSESS_USERS[0] });
      const newHash = await bcrypt.hash('BrandNewPass@123!', 4);

      const sessionsBefore = await dataSource.getRepository(AuthSession).findBy({ userId: user.id });

      const lock = await holdRowLock(
        dataSource,
        'SELECT id FROM users WHERE id = $1 FOR UPDATE',
        [user.id],
      );

      let res: any;
      try {
        const loginPromise = request(app.getHttpServer())
          .post('/auth/login')
          .send({ username: user.username, password: AUTHSESS_PASSWORD });
        void loginPromise.catch(() => {});

        await waitForBlockedBy(dataSource, lock, 1);

        await lock.run('UPDATE users SET password = $1 WHERE id = $2', [newHash, user.id]);
        await lock.release();

        res = await loginPromise;
      } finally {
        try {
          await lock.release();
        } catch {
          // already released
        }
      }

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Invalid credentials');

      const sessionsAfter = await dataSource.getRepository(AuthSession).findBy({ userId: user.id });
      expect(sessionsAfter.length).toBe(sessionsBefore.length);

      const freshUser = await dataSource.getRepository(User).findOneByOrFail({ id: user.id });
      expect(freshUser.password).toBe(newHash);
    });

    it('two concurrent changes', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);
      const user = await dataSource.getRepository(User).findOneByOrFail({ username: AUTHSESS_USERS[0] });

      const lock = await holdRowLock(
        dataSource,
        'SELECT id FROM users WHERE id = $1 FOR UPDATE',
        [user.id],
      );

      const passA = 'NewPassA@12345!';
      const passB = 'NewPassB@12345!';

      let resA: any;
      let resB: any;
      try {
        const reqA = request(app.getHttpServer())
          .patch('/auth/change-password')
          .set('Authorization', `Bearer ${login.body.accessToken}`)
          .send({
            currentPassword: AUTHSESS_PASSWORD,
            newPassword: passA,
            newPasswordConfirmation: passA,
          });
        void reqA.catch(() => {});

        const reqB = request(app.getHttpServer())
          .patch('/auth/change-password')
          .set('Authorization', `Bearer ${login.body.accessToken}`)
          .send({
            currentPassword: AUTHSESS_PASSWORD,
            newPassword: passB,
            newPasswordConfirmation: passB,
          });
        void reqB.catch(() => {});

        await waitForBlockedBy(dataSource, lock, 2);
        await lock.release();

        [resA, resB] = await Promise.all([reqA, reqB]);
      } finally {
        try {
          await lock.release();
        } catch {
          // already released
        }
      }

      const statuses = [resA.status, resB.status].sort();
      expect(statuses).toEqual([204, 409]);

      const conflictRes = resA.status === 409 ? resA : resB;
      expect(conflictRes.body.code).toBe('PASSWORD_CHANGED_CONCURRENTLY');

      const winningPass = resA.status === 204 ? passA : passB;
      const updatedUser = await dataSource.getRepository(User).findOneByOrFail({ id: user.id });
      const matchesWinner = await bcrypt.compare(winningPass, updatedUser.password);
      expect(matchesWinner).toBe(true);
    });

    it('two concurrent successful sign-ins do not deadlock', async () => {
      const user = await dataSource.getRepository(User).findOneByOrFail({ username: AUTHSESS_USERS[0] });
      const beforeCount = await dataSource.getRepository(AuthSession).countBy({ userId: user.id });

      const lock = await holdRowLock(
        dataSource,
        'SELECT id FROM users WHERE id = $1 FOR UPDATE',
        [user.id],
      );

      let resA: any;
      let resB: any;
      try {
        const loginA = request(app.getHttpServer())
          .post('/auth/login')
          .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD });
        void loginA.catch(() => {});

        const loginB = request(app.getHttpServer())
          .post('/auth/login')
          .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD });
        void loginB.catch(() => {});

        await waitForBlockedBy(dataSource, lock, 2);
        await lock.release();

        [resA, resB] = await Promise.all([loginA, loginB]);
      } finally {
        try {
          await lock.release();
        } catch {
          // already released
        }
      }

      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);
      expect(resA.body.sessionId).toBeDefined();
      expect(resB.body.sessionId).toBeDefined();
      expect(resA.body.sessionId).not.toBe(resB.body.sessionId);

      const afterCount = await dataSource.getRepository(AuthSession).countBy({ userId: user.id });
      expect(afterCount).toBe(beforeCount + 2);

      // Repeat once without the held lock
      const [freeA, freeB] = await Promise.all([
        request(app.getHttpServer())
          .post('/auth/login')
          .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
          .expect(200),
        request(app.getHttpServer())
          .post('/auth/login')
          .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
          .expect(200),
      ]);
      expect(freeA.body.sessionId).not.toBe(freeB.body.sessionId);
    });

    it('the new password survives stale failed-login bookkeeping', async () => {
      const user = await dataSource.getRepository(User).findOneByOrFail({ username: AUTHSESS_USERS[0] });
      const staleUser = await dataSource.getRepository(User).findOneByOrFail({ id: user.id });
      const initialAttempts = staleUser.failedLoginAttempts;

      const newHash = await bcrypt.hash('SurvivingPass@123!', 4);
      await dataSource.query('UPDATE users SET password = $1 WHERE id = $2', [newHash, user.id]);

      await (app.get(AuthService) as any).handleFailedLogin(staleUser);

      const freshUser = await dataSource.getRepository(User).findOneByOrFail({ id: user.id });
      expect(freshUser.password).toBe(newHash);
      expect(freshUser.failedLoginAttempts).toBe(initialAttempts + 1);
    });

    it('the new password survives stale lock self-heal', async () => {
      const user = await dataSource.getRepository(User).findOneByOrFail({ username: AUTHSESS_USERS[0] });
      const staleUser = await dataSource.getRepository(User).findOneByOrFail({ id: user.id });
      staleUser.lockedUntil = new Date(Date.now() - 3600 * 1000);
      staleUser.failedLoginAttempts = 5;

      const newHash = await bcrypt.hash('SurvivingSelfHeal@123!', 4);
      await dataSource.query('UPDATE users SET password = $1 WHERE id = $2', [newHash, user.id]);

      await (app.get(AuthService) as any).healExpiredLock(staleUser);

      const freshUser = await dataSource.getRepository(User).findOneByOrFail({ id: user.id });
      expect(freshUser.password).toBe(newHash);
      expect(freshUser.lockedUntil).toBeNull();
      expect(freshUser.failedLoginAttempts).toBe(0);
    });
  });

  describe('authorization', () => {
    it('a live session still works', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(200);

      expect(res.body.username).toBe(AUTHSESS_USERS[0]);
    });

    it('an already-issued access token is rejected after sign-out', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/logout')
        .send({ refreshToken: login.body.refreshToken })
        .expect(204);

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(401);
    });

    it('an already-issued access token is rejected after password change', async () => {
      const login1 = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);
      const login2 = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);

      const newPass = 'NewPassAfterChange@123!';
      await request(app.getHttpServer())
        .patch('/auth/change-password')
        .set('Authorization', `Bearer ${login1.body.accessToken}`)
        .send({
          currentPassword: AUTHSESS_PASSWORD,
          newPassword: newPass,
          newPasswordConfirmation: newPass,
        })
        .expect(204);

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${login2.body.accessToken}`)
        .expect(401);
    });

    it('an already-issued access token is rejected after replay revocation', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);
      const g1 = login.body.refreshToken;

      // Rotate once
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: g1 })
        .expect(200);

      // Advance clock past grace (60s default, advance by 70s)
      const clock = app.get(AuthClock);
      const future = new Date(Date.now() + 70 * 1000);
      jest.spyOn(clock, 'now').mockReturnValue(future);

      // Replay g1
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: g1 })
        .expect(401);

      // Now access token from login is rejected
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(401);
    });

    it('a token without sid is rejected', async () => {
      const user = await dataSource.getRepository(User).findOneByOrFail({ username: AUTHSESS_USERS[0] });
      const legacyToken = jwtService.sign({
        sub: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      });

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${legacyToken}`)
        .expect(401);
    });

    it('an expired session is rejected before cleanup runs', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);

      const session = await dataSource.getRepository(AuthSession).findOneByOrFail({ id: login.body.sessionId });

      const clock = app.get(AuthClock);
      const pastSessionExpiry = new Date(session.expiresAt.getTime() + 1000);
      jest.spyOn(clock, 'now').mockReturnValue(pastSessionExpiry);

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(401);

      const sessionStillExists = await dataSource.getRepository(AuthSession).findOneBy({ id: session.id });
      expect(sessionStillExists).not.toBeNull();
    });

    it('a refresh token is not an access token', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${login.body.refreshToken}`)
        .expect(401);
    });

    it('rejects the refresh typ even when signed with the access key', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);

      const decoded: any = jwtService.decode(login.body.accessToken);
      const { iat, exp, ...payload } = decoded;

      const refreshTypToken = jwtService.sign(payload, {
        header: { alg: 'HS256', typ: 'erp-refresh+jwt' },
      });

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${refreshTypToken}`)
        .expect(401);

      const normalTypToken = jwtService.sign(payload, {
        header: { alg: 'HS256', typ: 'JWT' },
      });

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${normalTypToken}`)
        .expect(200);
    });

    it('rejects another algorithm signed with the access key', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: AUTHSESS_USERS[0], password: AUTHSESS_PASSWORD })
        .expect(200);

      const decoded: any = jwtService.decode(login.body.accessToken);
      const { iat, exp, ...payload } = decoded;

      const hs384Token = jwtService.sign(payload, {
        algorithm: 'HS384',
        header: { alg: 'HS384', typ: 'JWT' },
      });

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${hs384Token}`)
        .expect(401);
    });
  });
});


