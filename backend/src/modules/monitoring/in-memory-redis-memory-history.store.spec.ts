import { InMemoryRedisMemoryHistoryStore, IN_MEMORY_INSTANCE_ID } from './in-memory-redis-memory-history.store';
import { RedisMemorySample } from './redis-memory.types';

const sample = (minute: number, ok = true): RedisMemorySample => ({
  at: new Date(Date.UTC(2026, 7, 14, 0, minute)).toISOString(),
  ok,
  failureReason: ok ? null : 'timeout',
  usedBytes: ok ? minute : null,
  maxBytes: ok ? 100 : null,
  utilizationPercent: ok ? minute : null,
  evictedKeys: ok ? 0 : null,
  oomErrors: ok ? 0 : null,
});

const withInstanceId = (s: RedisMemorySample): RedisMemorySample => ({
  ...s,
  instanceId: IN_MEMORY_INSTANCE_ID,
});

describe('InMemoryRedisMemoryHistoryStore', () => {
  it('evicts the oldest sample at capacity while preserving order', async () => {
    const store = new InMemoryRedisMemoryHistoryStore(3);
    for (const minute of [0, 1, 2, 3]) {
      await store.append(sample(minute));
    }
    expect(await store.recent()).toEqual([
      withInstanceId(sample(1)),
      withInstanceId(sample(2)),
      withInstanceId(sample(3)),
    ]);
    expect(await store.stats()).toMatchObject({ sampleCount: 3, capacity: 3 });
  });

  it('counts failed samples separately and uses the oldest retained timestamp', async () => {
    const store = new InMemoryRedisMemoryHistoryStore(3);
    await store.append(sample(0));
    await store.append(sample(1, false));
    expect(await store.stats()).toEqual({
      bufferStartedAt: sample(0).at,
      sampleCount: 2,
      validSampleCount: 1,
      capacity: 3,
      latestSampleAt: sample(1, false).at,
    });
  });

  it('returns defensive array copies from recent', async () => {
    const store = new InMemoryRedisMemoryHistoryStore(3);
    await store.append(sample(0));
    (await store.recent()).length = 0;
    expect(await store.recent()).toHaveLength(1);
  });
});

describe('async contract', () => {
  it('resolves append and reflects the sample in recent()', async () => {
    const store = new InMemoryRedisMemoryHistoryStore(3);
    await store.append({
      at: '2026-08-14T10:00:00.000Z',
      ok: true,
      failureReason: null,
      usedBytes: 100,
      maxBytes: 1000,
      utilizationPercent: 10,
      evictedKeys: 0,
      oomErrors: 0,
    });
    await expect(store.recent()).resolves.toHaveLength(1);
    await expect(store.stats()).resolves.toMatchObject({ sampleCount: 1 });
  });

  it('accepts a numeric recent() argument', async () => {
    const store = new InMemoryRedisMemoryHistoryStore(3);
    for (const at of ['2026-08-14T10:00:00.000Z', '2026-08-14T10:01:00.000Z']) {
      await store.append({
        at, ok: true, failureReason: null, usedBytes: 1, maxBytes: 2,
        utilizationPercent: 50, evictedKeys: 0, oomErrors: 0,
      });
    }
    const latest = await store.recent(1);
    expect(latest).toHaveLength(1);
    expect(latest[0].at).toBe('2026-08-14T10:01:00.000Z');
  });
});
