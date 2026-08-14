import { InMemoryRedisMemoryHistoryStore, IN_MEMORY_INSTANCE_ID } from './in-memory-redis-memory-history.store';
import { foldInstanceWindowStats } from './window-stats';
import { RedisMemorySample } from './redis-memory.types';

/**
 * One case table, two implementations.
 *
 * The durable store computes these in SQL and the in-memory store in JS; they
 * are required to agree. The SQL itself is exercised against real Postgres in
 * test/redis-monitoring-persistence.e2e-spec.ts — this suite pins the semantics
 * both are implementing so neither drifts.
 */
interface ContractCase {
  name: string;
  counters: { evicted: (number | null)[]; oom: (number | null)[] };
  expected: {
    evicted: { delta: number | null; resetObserved: boolean };
    oom: { delta: number | null; resetObserved: boolean };
  };
}

const CASES: ContractCase[] = [
  {
    name: 'flat counters report a measured zero',
    counters: { evicted: [0, 0, 0], oom: [0, 0, 0] },
    expected: {
      evicted: { delta: 0, resetObserved: false },
      oom: { delta: 0, resetObserved: false },
    },
  },
  {
    name: 'monotonic growth sums',
    counters: { evicted: [0, 1, 4], oom: [0, 2, 2] },
    expected: {
      evicted: { delta: 4, resetObserved: false },
      oom: { delta: 2, resetObserved: false },
    },
  },
  {
    name: 'a mid-window reset sums both climbs',
    counters: { evicted: [0, 40, 0, 10], oom: [0, 0, 0, 0] },
    expected: {
      evicted: { delta: 50, resetObserved: true },
      oom: { delta: 0, resetObserved: false },
    },
  },
  {
    name: 'a trailing reset does not overcount',
    counters: { evicted: [0, 40, 0, 0], oom: [0, 0, 0, 0] },
    expected: {
      evicted: { delta: 40, resetObserved: true },
      oom: { delta: 0, resetObserved: false },
    },
  },
  {
    name: 'a single reading yields a null delta',
    counters: { evicted: [7], oom: [7] },
    expected: {
      evicted: { delta: null, resetObserved: false },
      oom: { delta: null, resetObserved: false },
    },
  },
  {
    name: 'nulls are skipped, not read as zero',
    counters: { evicted: [1, null, 4], oom: [null, null, 3] },
    expected: {
      evicted: { delta: 3, resetObserved: false },
      oom: { delta: null, resetObserved: false },
    },
  },
];

function samplesFor(testCase: ContractCase): RedisMemorySample[] {
  return testCase.counters.evicted.map((evicted, index) => ({
    at: new Date(Date.UTC(2026, 7, 1, 0, index)).toISOString(),
    ok: true,
    failureReason: null,
    usedBytes: 1_000 + index,
    maxBytes: 268435456,
    utilizationPercent: 1,
    evictedKeys: evicted,
    oomErrors: testCase.counters.oom[index],
    instanceId: IN_MEMORY_INSTANCE_ID,
  }));
}

describe.each(CASES)('window-stats contract: $name', (testCase) => {
  it('holds for the folding logic the SQL mirrors', () => {
    const result = foldInstanceWindowStats(IN_MEMORY_INSTANCE_ID, samplesFor(testCase));
    expect(result.evictedKeys).toEqual(testCase.expected.evicted);
    expect(result.oomErrors).toEqual(testCase.expected.oom);
  });

  it('holds for the in-memory store', async () => {
    const store = new InMemoryRedisMemoryHistoryStore();
    for (const sample of samplesFor(testCase)) {
      await store.append(sample);
    }
    const stats = await store.windowStats();
    expect(stats.perInstance[0].evictedKeys).toEqual(testCase.expected.evicted);
    expect(stats.perInstance[0].oomErrors).toEqual(testCase.expected.oom);
  });
});
