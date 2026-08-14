import { InMemoryRedisMemoryHistoryStore } from './in-memory-redis-memory-history.store';
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

describe('InMemoryRedisMemoryHistoryStore', () => {
  it('evicts the oldest sample at capacity while preserving order', () => {
    const store = new InMemoryRedisMemoryHistoryStore(3);
    [0, 1, 2, 3].forEach((minute) => store.append(sample(minute)));
    expect(store.recent()).toEqual([sample(1), sample(2), sample(3)]);
    expect(store.stats()).toMatchObject({ sampleCount: 3, capacity: 3 });
  });

  it('counts failed samples separately and uses the oldest retained timestamp', () => {
    const store = new InMemoryRedisMemoryHistoryStore(3);
    store.append(sample(0));
    store.append(sample(1, false));
    expect(store.stats()).toEqual({
      bufferStartedAt: sample(0).at,
      sampleCount: 2,
      validSampleCount: 1,
      capacity: 3,
      latestSampleAt: sample(1, false).at,
    });
  });

  it('returns defensive array copies from recent', () => {
    const store = new InMemoryRedisMemoryHistoryStore(3);
    store.append(sample(0));
    store.recent().length = 0;
    expect(store.recent()).toHaveLength(1);
  });
});
