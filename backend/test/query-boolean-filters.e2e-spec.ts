import { SESSION_PROTOCOL } from './utils/session-protocol';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PriceList } from '../src/database/entities/price-list.entity';
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
 * Boolean list-query filters over real HTTP (#1306, #1307).
 *
 * Query params arrive as strings, and `@Type(() => Boolean)` read "false" as
 * true. The DTO specs prove the parsing and the service specs prove the
 * filter; only a request through the ValidationPipe proves the two together,
 * which is the path the bug lived on.
 *
 * Both states of every flag are seeded, so each `false` case must return the
 * matching rows, not merely an empty set.
 *
 * Shared-DB discipline (#1197): assertions are scoped to rows this suite owns,
 * plus "every returned row matches the filter", which holds regardless of what
 * other suites have left in the table.
 */
describe('Boolean list-query filters (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  const runId = Date.now().toString(36);
  const prefix = `QBF${runId}`.toUpperCase();

  let adminUserId = '';
  let adminUsername = '';
  let get: (path: string) => request.Test;

  const priceListIds: Record<'active' | 'inactive', string> = { active: '', inactive: '' };
  const methodIds: Record<'active' | 'inactive' | 'purchase' | 'nonPurchase', string> = {
    active: '',
    inactive: '',
    purchase: '',
    nonPurchase: '',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();
    ds = moduleFixture.get(DataSource);

    const admin = await seedSuiteAdmin(ds, `${SHARED_E2E_NS}_qbf_admin_${runId}`);
    adminUserId = admin.id;
    adminUsername = admin.username;

    const login = await request(app.getHttpServer())
      .post('/auth/login').set(...SESSION_PROTOCOL)
      .send({ username: adminUsername, password: E2E_ADMIN_PASSWORD });
    const token = login.body?.data?.accessToken ?? login.body?.accessToken;
    expect(typeof token).toBe('string');

    get = (path) =>
      request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);

    // Neither list is the default: the partial unique index allows exactly one
    // live default, and that row belongs to the boot seeder, not this suite.
    const priceLists = ds.getRepository(PriceList);
    for (const [key, isActive] of [
      ['active', true],
      ['inactive', false],
    ] as const) {
      const saved = await priceLists.save({
        code: `${prefix}-${key}`,
        name: `${prefix} ${key}`,
        isActive,
        isDefault: false,
        priority: 0,
      } as any);
      priceListIds[key] = saved.id;
    }

    const methods = ds.getRepository(PaymentMethodEntity);
    for (const [key, isActive, useForPurchases] of [
      ['active', true, true],
      ['inactive', false, true],
      ['purchase', true, true],
      ['nonPurchase', true, false],
    ] as const) {
      const saved = await methods.save(
        methods.create({
          code: `${prefix.slice(0, 12)}${key.slice(0, 8)}`.toUpperCase(),
          name: `${prefix} ${key}`,
          isActive,
          useForPurchases,
          sortOrder: 0,
        } as any),
      );
      methodIds[key] = (saved as unknown as PaymentMethodEntity).id;
    }
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      await ds.query(`DELETE FROM price_lists WHERE id = ANY($1)`, [
        Object.values(priceListIds).filter(Boolean),
      ]);
      await ds.query(`DELETE FROM payment_methods WHERE id = ANY($1)`, [
        Object.values(methodIds).filter(Boolean),
      ]);
      await removeSuiteTraces(ds, {
        userIds: [adminUserId],
        usernames: [adminUsername],
        entityIds: [...Object.values(priceListIds), ...Object.values(methodIds)].filter(Boolean),
      });
      await removeSuiteAdmin(ds, adminUsername);
    }
    await app?.close();
  });

  describe('GET /price-lists (#1306)', () => {
    // `search` narrows the page to this suite's rows, so the result is not
    // subject to pagination or to rows other suites own.
    const listOwn = async (filter: string) => {
      const res = await get(`/price-lists?search=${prefix}&page=1&limit=100&${filter}`).expect(200);
      return res.body.data as PriceList[];
    };

    it('isActive=true returns only the active list', async () => {
      const rows = await listOwn('isActive=true');
      expect(rows.map((r) => r.id)).toEqual([priceListIds.active]);
    });

    it('isActive=false returns only the inactive list', async () => {
      const rows = await listOwn('isActive=false');
      expect(rows.map((r) => r.id)).toEqual([priceListIds.inactive]);
    });

    it('isDefault=false returns both non-default lists', async () => {
      const rows = await listOwn('isDefault=false');
      expect(rows.map((r) => r.id).sort()).toEqual(
        [priceListIds.active, priceListIds.inactive].sort(),
      );
    });

    it('isDefault=true excludes non-default lists and returns only defaults', async () => {
      const own = await listOwn('isDefault=true');
      expect(own).toEqual([]);

      // Unscoped: the boot-seeded default exists, and nothing non-default leaks in.
      const res = await get('/price-lists?page=1&limit=100&isDefault=true').expect(200);
      const rows = res.body.data as PriceList[];
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows.every((r) => r.isDefault === true)).toBe(true);
    });

    it('rejects an unrecognised boolean value with 400', async () => {
      await get('/price-lists?isActive=yes').expect(400);
    });
  });

  describe('GET /settings/payment-methods (#1307)', () => {
    // No page/limit ⇒ the full set, so the owned rows are always present.
    const list = async (filter: string) => {
      const res = await get(`/settings/payment-methods?${filter}`).expect(200);
      return res.body.data as PaymentMethodEntity[];
    };
    const ownIds = (rows: PaymentMethodEntity[]) => {
      const owned = new Set(Object.values(methodIds));
      return rows
        .map((r) => r.id)
        .filter((id) => owned.has(id))
        .sort();
    };

    it('isActive=true returns active methods only', async () => {
      const rows = await list('isActive=true');
      expect(rows.every((r) => r.isActive === true)).toBe(true);
      expect(ownIds(rows)).toEqual(
        [methodIds.active, methodIds.purchase, methodIds.nonPurchase].sort(),
      );
    });

    it('isActive=false returns inactive methods only', async () => {
      const rows = await list('isActive=false');
      expect(rows.every((r) => r.isActive === false)).toBe(true);
      expect(ownIds(rows)).toEqual([methodIds.inactive]);
    });

    it('forPurchases=true returns purchase methods only', async () => {
      const rows = await list('forPurchases=true');
      expect(rows.every((r) => r.useForPurchases === true)).toBe(true);
      expect(ownIds(rows)).toEqual(
        [methodIds.active, methodIds.inactive, methodIds.purchase].sort(),
      );
    });

    it('forPurchases=false returns non-purchase methods only', async () => {
      const rows = await list('forPurchases=false');
      expect(rows.every((r) => r.useForPurchases === false)).toBe(true);
      expect(ownIds(rows)).toEqual([methodIds.nonPurchase]);
    });

    it('rejects an unrecognised boolean value with 400', async () => {
      await get('/settings/payment-methods?forPurchases=yes').expect(400);
    });
  });
});
