import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { User, UserRole, UserStatus } from '../src/database/entities/user.entity';
import { RedisAlertStateEntity } from '../src/database/entities/redis-alert-state.entity';
import { RedisMemorySampleEntity } from '../src/database/entities/redis-memory-sample.entity';
import { RedisAlertStateRepository } from '../src/modules/monitoring/redis-alert-state.repository';
import { RedisAlertService } from '../src/modules/monitoring/redis-alert.service';
import { TypeOrmRedisMemoryHistoryStore } from '../src/modules/monitoring/typeorm-redis-memory-history.store';
import { applyOomCounter } from '../src/modules/monitoring/redis-alert.transitions';
import { RedisMemorySample } from '../src/modules/monitoring/redis-memory.types';

/**
 * E2E suites share one database and run in size order, so this suite
 * allow-lists ONLY the rows it creates (unique run_id / instance_id per test)
 * and never asserts "everything except mine equals N".
 */
describe('Redis monitoring persistence (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let repository: RedisAlertStateRepository;
  let adminToken: string;

  const uniqueRun = () => `run-${randomUUID()}`;
  const uniqueInstance = () => `instance-${randomUUID()}`;

  const WINDOW_STATS_USER = 'redis_mon_admin';
  const WINDOW_STATS_PASSWORD = 'Str0ng@Pass!';

  async function ensureAdmin(): Promise<void> {
    const users = ds.getRepository(User);
    if (!(await users.findOneBy({ username: WINDOW_STATS_USER }))) {
      await users.save(
        users.create({
          username: WINDOW_STATS_USER,
          email: `${WINDOW_STATS_USER}@test.example`,
          password: await bcrypt.hash(WINDOW_STATS_PASSWORD, 12),
          firstName: 'Test',
          lastName: 'Admin',
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
          isActive: true,
          failedLoginAttempts: 0,
        }),
      );
    }
  }

  // Log in ONCE and reuse the token; /auth/login is throttled to 5 req/min.
  async function loginAdmin(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ usernameOrEmail: WINDOW_STATS_USER, password: WINDOW_STATS_PASSWORD })
      .expect(200);
    return res.body.accessToken as string;
  }

  /**
   * Timestamps are relative to execution time, never fixed dates.
   * `recent()` defaults to a 24-hour window, so hard-coded 2026-08-14 rows
   * would silently stop appearing once that date is more than a day past —
   * a suite that passes today and fails next week for no code reason.
   */
  const minutesAgo = (minutes: number): string =>
    new Date(Date.now() - minutes * 60_000).toISOString();

  const sampleAt = (at: string, oomErrors: number | null = 0): RedisMemorySample => ({
    at,
    ok: true,
    failureReason: null,
    usedBytes: 2_297_720,
    maxBytes: 268_435_456,
    utilizationPercent: 1,
    evictedKeys: 0,
    oomErrors,
  });

  const storeFor = (instanceId: string) =>
    new TypeOrmRedisMemoryHistoryStore(
      ds.getRepository(RedisMemorySampleEntity),
      instanceId,
    );

  const serviceOverFreshRepo = () =>
    new RedisAlertService(new RedisAlertStateRepository(ds));

  /** Applies one counter reading through the repository, as a tick would. */
  const applyCounter = (runId: string, raw: number, at: string) =>
    repository.mutate(runId, (state, isNew) => applyOomCounter(state, raw, at, isNew));

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    repository = new RedisAlertStateRepository(ds);
    await ensureAdmin();
    adminToken = await loginAdmin();
  });

  afterAll(async () => {
    await app.close();
  });

  it('sample history survives a restart', async () => {
    const instanceId = uniqueInstance();
    const older = minutesAgo(2);
    const newer = minutesAgo(1);
    const writer = storeFor(instanceId);
    await writer.append(sampleAt(older));
    await writer.append(sampleAt(newer));

    // A "restart" is a brand-new store object over the same identity.
    const afterRestart = storeFor(instanceId);
    const samples = await afterRestart.recent();

    expect(samples).toHaveLength(2);
    expect(samples.map((s) => s.at)).toEqual([older, newer]);
    expect(samples.every((s) => s.instanceId === instanceId)).toBe(true);
  });

  it('does not return another instance samples by default', async () => {
    const mine = uniqueInstance();
    const theirs = uniqueInstance();
    await storeFor(theirs).append(sampleAt(minutesAgo(2)));
    await storeFor(mine).append(sampleAt(minutesAgo(1)));

    const samples = await storeFor(mine).recent();
    expect(samples.every((s) => s.instanceId === mine)).toBe(true);
  });

  it('excludes samples older than the requested window', async () => {
    const instanceId = uniqueInstance();
    const writer = storeFor(instanceId);
    await writer.append(sampleAt(minutesAgo(60 * 30)));  // 30h ago
    await writer.append(sampleAt(minutesAgo(5)));

    // Default window is 24h.
    const samples = await storeFor(instanceId).recent();
    expect(samples).toHaveLength(1);
  });

  it('keeps the OOM watermark across a restart', async () => {
    const runId = uniqueRun();
    await applyCounter(runId, 5, '2026-08-14T10:00:00.000Z');   // baseline
    await applyCounter(runId, 9, '2026-08-14T10:01:00.000Z');   // +4

    const view = await serviceOverFreshRepo().getView(runId, null);
    expect(view.severity).toBe('critical');
    expect(view.oom?.unacknowledgedDelta).toBe(4);
    expect(view.oom?.observedValue).toBe(9);
  });

  it('does not re-alert an acknowledged incident after a restart', async () => {
    const runId = uniqueRun();
    await applyCounter(runId, 5, '2026-08-14T10:00:00.000Z');
    await applyCounter(runId, 9, '2026-08-14T10:01:00.000Z');
    await serviceOverFreshRepo().acknowledgeOom(9, 'user-1', 'Ada', runId);

    // Restart: the counter still reads 9.
    await applyCounter(runId, 9, '2026-08-14T10:05:00.000Z');
    const view = await serviceOverFreshRepo().getView(runId, null);

    expect(view.severity).toBe('none');
    expect(view.oom?.acknowledgedValue).toBe(9);
  });

  it('reports an increase that happened while the backend was down', async () => {
    // THE REGRESSION: a cold tracker emits kind:'baseline' delta:0 here. The
    // persisted comparison must produce 9 - 5 = 4.
    const runId = uniqueRun();
    await applyCounter(runId, 5, '2026-08-14T10:00:00.000Z');

    const afterDowntime = await applyCounter(runId, 9, '2026-08-14T12:00:00.000Z');

    expect(afterDowntime.oomUnacknowledgedDelta).toBe(4);
    expect(afterDowntime.oomBaselineValue).toBe(5);
    expect(afterDowntime.oomIncidentStartedAt).toBe('2026-08-14T12:00:00.000Z');
  });

  it('re-baselines when RESETSTAT ran during downtime', async () => {
    const runId = uniqueRun();
    await applyCounter(runId, 5, '2026-08-14T10:00:00.000Z');
    await applyCounter(runId, 40, '2026-08-14T10:01:00.000Z');
    await serviceOverFreshRepo().acknowledgeOom(40, 'user-1', 'Ada', runId);

    // Same run_id (RESETSTAT does not change it), counter now lower.
    const afterReset = await applyCounter(runId, 2, '2026-08-14T12:00:00.000Z');

    expect(afterReset.oomBaselineValue).toBe(2);
    expect(afterReset.oomObservedValue).toBe(2);
    expect(afterReset.oomAcknowledgedValue).toBeNull();

    const view = await serviceOverFreshRepo().getView(runId, null);
    expect(view.severity).toBe('none');
  });

  it('gives a restarted Redis a new row instead of inheriting the watermark', async () => {
    const runA = uniqueRun();
    const runB = uniqueRun();
    await applyCounter(runA, 5, '2026-08-14T10:00:00.000Z');
    await applyCounter(runA, 40, '2026-08-14T10:01:00.000Z');

    // New identity, counter starts low again.
    const stateB = await applyCounter(runB, 0, '2026-08-14T12:00:00.000Z');
    expect(stateB.oomBaselineValue).toBe(0);

    const rows = await ds
      .getRepository(RedisAlertStateEntity)
      .find({ where: [{ redisRunId: runA }, { redisRunId: runB }] });
    expect(rows).toHaveLength(2);

    // The old row is retained, not cleared.
    const viewA = await serviceOverFreshRepo().getView(runA, null);
    expect(viewA.oom?.observedValue).toBe(40);
  });

  it('inserts exactly one row when two instances first see the same run_id', async () => {
    const runId = uniqueRun();
    await Promise.all([
      applyCounter(runId, 3, '2026-08-14T10:00:00.000Z'),
      applyCounter(runId, 3, '2026-08-14T10:00:00.000Z'),
    ]);

    const rows = await ds
      .getRepository(RedisAlertStateEntity)
      .find({ where: { redisRunId: runId } });
    expect(rows).toHaveLength(1);
  });

  it('leaves no bare row when the mutator throws for a new identity', async () => {
    // The insert lives INSIDE the transaction precisely so this cannot happen.
    // A pre-BEGIN insert would commit a default-valued row here, and the next
    // tick would read its zeroes as an established baseline — silently
    // suppressing an OOM.
    const runId = uniqueRun();
    await expect(
      repository.mutate(runId, () => {
        throw new Error('transition failed');
      }),
    ).rejects.toThrow('transition failed');

    const rows = await ds
      .getRepository(RedisAlertStateEntity)
      .find({ where: { redisRunId: runId } });
    expect(rows).toHaveLength(0);
  });

  it('lets only one of two concurrent acknowledgements succeed', async () => {
    const runId = uniqueRun();
    await applyCounter(runId, 5, '2026-08-14T10:00:00.000Z');
    await applyCounter(runId, 9, '2026-08-14T10:01:00.000Z');

    const service = serviceOverFreshRepo();
    const results = await Promise.allSettled([
      service.acknowledgeOom(9, 'user-1', 'Ada', runId),
      service.acknowledgeOom(9, 'user-2', 'Grace', runId),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ConflictException);
  });

  describe('windowStats over real rows', () => {
    const INSTANCE = 'e2e-window-stats';

    // Relative timestamps, per this suite's convention: `recent()` defaults to
    // a 24-hour window, so fixed dates would silently stop appearing.
    // The peak sits at index 0 — outside the newest REDIS_DETAIL_MAX_ROWS.
    const base = Date.now() - 5_100 * 60_000;

    beforeAll(async () => {
      const sampleRepository = ds.getRepository(RedisMemorySampleEntity);
      await sampleRepository.delete({ instanceId: INSTANCE });

      // 5,100 samples: more than REDIS_DETAIL_MAX_ROWS, so the newest-anchored
      // sample read cannot see the oldest rows.
      const rows: Partial<RedisMemorySampleEntity>[] = [];
      for (let index = 0; index < 5_100; index += 1) {
        rows.push({
          instanceId: INSTANCE,
          sampledAt: new Date(base + index * 60_000),
          ok: true,
          failureReason: null,
          usedBytes: index === 0 ? 250_000_000 : 1_000_000,
          maxBytes: 268435456,
          utilizationPercent: index === 0 ? 93.13 : 0.37,
          evictedKeys: 0,
          oomErrors: index < 5_000 ? 0 : 1,
        });
      }
      await sampleRepository.insert(rows);
    });

    afterAll(async () => {
      await ds.getRepository(RedisMemorySampleEntity).delete({ instanceId: INSTANCE });
    });

    it('reports a peak that the capped sample list cannot see', async () => {
      // `recent()` defaults to a 24-hour window; passing `from` spanning the
      // whole seed keeps the 5,100 rows in scope so the cap on the sample
      // list is what truncates, not the default window.
      const from = new Date(base).toISOString();
      const response = await request(app.getHttpServer())
        .get('/health/redis-memory')
        .query({ instanceId: INSTANCE, limit: 5000, from })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const stats = response.body.windowStats.perInstance.find(
        (entry: { instanceId: string }) => entry.instanceId === INSTANCE,
      );

      // The regression this design exists to prevent: the returned samples
      // start after the peak, so a client-side max would report 1_000_000.
      expect(response.body.samples[0].usedBytes).toBe(1_000_000);
      expect(response.body.truncated).toBe(true);
      expect(stats.peakUsedBytes).toBe(250_000_000);
      expect(stats.sampleCount).toBe(5_100);
    });

    it('sums the oom counter increase across the full window', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/redis-memory')
        .query({ instanceId: INSTANCE })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const stats = response.body.windowStats.perInstance.find(
        (entry: { instanceId: string }) => entry.instanceId === INSTANCE,
      );

      expect(stats.oomErrors).toEqual({ delta: 1, resetObserved: false });
      expect(stats.evictedKeys).toEqual({ delta: 0, resetObserved: false });
      expect(stats.distinctMaxBytes).toEqual([268435456]);
    });

    it('honours a narrowed range in the aggregate', async () => {
      const from = new Date(base + 60 * 60_000).toISOString();

      const response = await request(app.getHttpServer())
        .get('/health/redis-memory')
        .query({ instanceId: INSTANCE, from })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const stats = response.body.windowStats.perInstance.find(
        (entry: { instanceId: string }) => entry.instanceId === INSTANCE,
      );

      expect(response.body.windowStats.from).toBe(from);
      // The peak at index 0 is now outside the window.
      expect(stats.peakUsedBytes).toBe(1_000_000);
    });
  });
});
