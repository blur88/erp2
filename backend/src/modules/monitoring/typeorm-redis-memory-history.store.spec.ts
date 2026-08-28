import { jest } from '@jest/globals';
import { TypeOrmRedisMemoryHistoryStore } from './typeorm-redis-memory-history.store';
import { REDIS_DETAIL_MAX_ROWS } from './redis-memory.types';
import { Repository } from 'typeorm';
import { RedisMemorySampleEntity } from '@/database/entities/redis-memory-sample.entity';

describe('TypeOrmRedisMemoryHistoryStore', () => {
  const sample = {
    at: '2026-08-14T10:00:00.000Z',
    ok: true,
    failureReason: null,
    usedBytes: 2297720,
    maxBytes: 268435456,
    utilizationPercent: 1,
    evictedKeys: 0,
    oomErrors: 0,
  };

  const makeRepo = () => ({
    insert: (jest.fn as unknown as any)().mockResolvedValue(undefined),
    find: (jest.fn as unknown as any)().mockResolvedValue([]),
    count: (jest.fn as unknown as any)().mockResolvedValue(0),
    createQueryBuilder: (jest.fn as unknown as any)(),
  });

  it('writes the resolved instance id with each sample', async () => {
    const repo = makeRepo();
    const store = new TypeOrmRedisMemoryHistoryStore(repo as any, 'erp_backend');
    await store.append(sample);
    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ instanceId: 'erp_backend', ok: true, usedBytes: 2297720 }),
    );
  });

  it('clamps a limit above the hard cap', async () => {
    const repo = makeRepo();
    const store = new TypeOrmRedisMemoryHistoryStore(repo as any, 'erp_backend');
    await store.recent({ limit: 99_999 });
    expect(repo.find).toHaveBeenCalledWith(
      expect.objectContaining({ take: REDIS_DETAIL_MAX_ROWS }),
    );
  });

  it('scopes to the current instance by default', async () => {
    const repo = makeRepo();
    const store = new TypeOrmRedisMemoryHistoryStore(repo as any, 'erp_backend');
    await store.recent();
    const call = repo.find.mock.calls[0][0];
    expect(call.where.instanceId).toBe('erp_backend');
  });

  it('drops the instance filter when allInstances wins over instanceId', async () => {
    const repo = makeRepo();
    const store = new TypeOrmRedisMemoryHistoryStore(repo as any, 'erp_backend');
    await store.recent({ allInstances: true, instanceId: 'other' });
    const call = repo.find.mock.calls[0][0];
    expect(call.where.instanceId).toBeUndefined();
  });

  it('reads a specific prior instance when asked', async () => {
    const repo = makeRepo();
    const store = new TypeOrmRedisMemoryHistoryStore(repo as any, 'erp_backend');
    await store.recent({ instanceId: 'old-container' });
    const call = repo.find.mock.calls[0][0];
    expect(call.where.instanceId).toBe('old-container');
  });

  describe('windowStats', () => {
    it('maps bigint aggregate columns from strings without precision loss', async () => {
      const store = buildStore({
        rawWindowStats: [
          {
            instance_id: 'erp_backend',
            sample_count: '1440',
            valid_sample_count: '1438',
            peak_used_bytes: '9007199254740991',
            peak_utilization_percent: '87.50',
            first_sample_at: new Date('2026-08-01T00:00:00.000Z'),
            last_sample_at: new Date('2026-08-02T00:00:00.000Z'),
            distinct_max_bytes: ['268435456'],
            evicted_delta: '0',
            evicted_reset: false,
            evicted_readings: '1438',
            oom_delta: '5',
            oom_reset: true,
            oom_readings: '1438',
          },
        ],
      });

      const stats = await store.windowStats({});

      expect(stats.perInstance).toEqual([
        {
          instanceId: 'erp_backend',
          sampleCount: 1440,
          validSampleCount: 1438,
          peakUsedBytes: 9007199254740991,
          peakUtilizationPercent: 87.5,
          firstSampleAt: '2026-08-01T00:00:00.000Z',
          lastSampleAt: '2026-08-02T00:00:00.000Z',
          distinctMaxBytes: [268435456],
          evictedKeys: { delta: 0, resetObserved: false },
          oomErrors: { delta: 5, resetObserved: true },
        },
      ]);
    });

    it('throws rather than silently truncating a bigint past MAX_SAFE_INTEGER', async () => {
      const store = buildStore({
        rawWindowStats: [
          {
            instance_id: 'erp_backend',
            sample_count: '1',
            valid_sample_count: '1',
            peak_used_bytes: '9007199254740993',
            peak_utilization_percent: null,
            first_sample_at: new Date('2026-08-01T00:00:00.000Z'),
            last_sample_at: new Date('2026-08-01T00:00:00.000Z'),
            distinct_max_bytes: [],
            evicted_delta: null,
            evicted_reset: false,
            evicted_readings: '1',
            oom_delta: null,
            oom_reset: false,
            oom_readings: '1',
          },
        ],
      });

      await expect(store.windowStats({})).rejects.toThrow();
    });

    it('reports delta null when fewer than two comparable readings exist', async () => {
      const store = buildStore({
        rawWindowStats: [
          {
            instance_id: 'erp_backend',
            sample_count: '1',
            valid_sample_count: '1',
            peak_used_bytes: '1000',
            peak_utilization_percent: '1.00',
            first_sample_at: new Date('2026-08-01T00:00:00.000Z'),
            last_sample_at: new Date('2026-08-01T00:00:00.000Z'),
            distinct_max_bytes: ['268435456'],
            evicted_delta: null,
            evicted_reset: false,
            evicted_readings: '1',
            oom_delta: null,
            oom_reset: false,
            oom_readings: '1',
          },
        ],
      });

      const stats = await store.windowStats({});
      expect(stats.perInstance[0].evictedKeys).toEqual({ delta: null, resetObserved: false });
      expect(stats.perInstance[0].oomErrors).toEqual({ delta: null, resetObserved: false });
    });

    it('returns the resolved bounds it queried under', async () => {
      const store = buildStore({ rawWindowStats: [] });
      const from = new Date('2026-08-01T00:00:00.000Z');
      const to = new Date('2026-08-08T00:00:00.000Z');

      const stats = await store.windowStats({ from, to });

      expect(stats.from).toBe(from.toISOString());
      expect(stats.to).toBe(to.toISOString());
      expect(stats.perInstance).toEqual([]);
    });

    it('groups one entry per instance when allInstances is set', async () => {
      const store = buildStore({
        rawWindowStats: [
          {
            instance_id: 'erp_backend',
            sample_count: '10', valid_sample_count: '10',
            peak_used_bytes: '2000', peak_utilization_percent: '2.00',
            first_sample_at: new Date('2026-08-01T00:00:00.000Z'),
            last_sample_at: new Date('2026-08-02T00:00:00.000Z'),
            distinct_max_bytes: ['268435456'],
            evicted_delta: '0', evicted_reset: false, evicted_readings: '10',
            oom_delta: '0', oom_reset: false, oom_readings: '10',
          },
          {
            instance_id: 'erp_backend_staging',
            sample_count: '5', valid_sample_count: '5',
            peak_used_bytes: '3000', peak_utilization_percent: '3.00',
            first_sample_at: new Date('2026-08-01T00:00:00.000Z'),
            last_sample_at: new Date('2026-08-02T00:00:00.000Z'),
            distinct_max_bytes: ['268435456'],
            evicted_delta: '0', evicted_reset: false, evicted_readings: '5',
            oom_delta: '0', oom_reset: false, oom_readings: '5',
          },
        ],
      });

      const stats = await store.windowStats({ allInstances: true });
      expect(stats.perInstance.map((entry) => entry.instanceId)).toEqual([
        'erp_backend',
        'erp_backend_staging',
      ]);
    });
  });
});

function buildStore(options: { rawWindowStats: unknown[] }) {
  const repository = {
    find: (jest.fn as unknown as any)().mockResolvedValue([]),
    count: (jest.fn as unknown as any)().mockResolvedValue(0),
    insert: (jest.fn as unknown as any)().mockResolvedValue(undefined),
    query: (jest.fn as unknown as any)().mockResolvedValue(options.rawWindowStats),
    manager: { query: (jest.fn as unknown as any)().mockResolvedValue(options.rawWindowStats) },
  } as unknown as Repository<RedisMemorySampleEntity>;
  return new TypeOrmRedisMemoryHistoryStore(repository, 'erp_backend');
}