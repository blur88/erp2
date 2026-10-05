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
} from './utils/auth-session-fixture';
import { AuthSession } from '../src/database/entities/auth-session.entity';
import { RefreshToken } from '../src/database/entities/refresh-token.entity';
import { REFRESH_KEYS, type RefreshKeySet } from '../src/modules/auth/tokens/refresh-keys';
import { encodeRefreshToken } from '../src/modules/auth/tokens/refresh-token.codec';

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
    await seedSessionUsers(dataSource);
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
});
