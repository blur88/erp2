import { foldCounter, foldInstanceWindowStats } from './window-stats';
import { RedisMemorySample } from './redis-memory.types';

function sample(overrides: Partial<RedisMemorySample> = {}): RedisMemorySample {
  return {
    at: '2026-08-01T00:00:00.000Z',
    ok: true,
    failureReason: null,
    usedBytes: 1000,
    maxBytes: 268435456,
    utilizationPercent: 1,
    evictedKeys: 0,
    oomErrors: 0,
    instanceId: 'erp_backend',
    ...overrides,
  };
}

describe('foldCounter', () => {
  it('returns null delta when there are no readings', () => {
    expect(foldCounter([])).toEqual({ delta: null, resetObserved: false });
  });

  it('returns null delta for a single reading', () => {
    expect(foldCounter([5])).toEqual({ delta: null, resetObserved: false });
  });

  it('ignores nulls when counting comparable readings', () => {
    expect(foldCounter([null, 7, null])).toEqual({ delta: null, resetObserved: false });
  });

  it('reports zero delta when a counter is measured and does not move', () => {
    expect(foldCounter([3, 3, 3])).toEqual({ delta: 0, resetObserved: false });
  });

  it('sums monotonic increases', () => {
    expect(foldCounter([0, 2, 5])).toEqual({ delta: 5, resetObserved: false });
  });

  it('sums positive increases across a reset rather than undercounting', () => {
    // Climbs to 40, resets to 0, climbs to 10. True increase is 50.
    // max - min would report 40.
    expect(foldCounter([0, 40, 0, 10])).toEqual({ delta: 50, resetObserved: true });
  });

  it('does not overcount when a reset ends the window', () => {
    // Climbs to 40 then resets and stays. max - min would report 40.
    expect(foldCounter([0, 40, 0, 0])).toEqual({ delta: 40, resetObserved: true });
  });

  it('bridges gaps by comparing consecutive non-null readings', () => {
    expect(foldCounter([1, null, 4])).toEqual({ delta: 3, resetObserved: false });
  });
});

describe('foldInstanceWindowStats', () => {
  it('returns empty stats for no samples', () => {
    expect(foldInstanceWindowStats('erp_backend', [])).toEqual({
      instanceId: 'erp_backend',
      sampleCount: 0,
      validSampleCount: 0,
      peakUsedBytes: null,
      peakUtilizationPercent: null,
      firstSampleAt: null,
      lastSampleAt: null,
      distinctMaxBytes: [],
      evictedKeys: { delta: null, resetObserved: false },
      oomErrors: { delta: null, resetObserved: false },
    });
  });

  it('takes the peak across the whole window, not the newest samples', () => {
    const result = foldInstanceWindowStats('erp_backend', [
      sample({ at: '2026-08-01T00:00:00.000Z', usedBytes: 9_000, utilizationPercent: 90 }),
      sample({ at: '2026-08-02T00:00:00.000Z', usedBytes: 1_000, utilizationPercent: 10 }),
    ]);
    expect(result.peakUsedBytes).toBe(9_000);
    expect(result.peakUtilizationPercent).toBe(90);
    expect(result.firstSampleAt).toBe('2026-08-01T00:00:00.000Z');
    expect(result.lastSampleAt).toBe('2026-08-02T00:00:00.000Z');
  });

  it('counts failed samples in sampleCount but not validSampleCount', () => {
    const result = foldInstanceWindowStats('erp_backend', [
      sample({ ok: true }),
      sample({ ok: false, failureReason: 'timeout', usedBytes: null, utilizationPercent: null }),
    ]);
    expect(result.sampleCount).toBe(2);
    expect(result.validSampleCount).toBe(1);
  });

  it('collects distinct caps ascending when the cap changes mid-window', () => {
    const result = foldInstanceWindowStats('erp_backend', [
      sample({ maxBytes: 536870912 }),
      sample({ maxBytes: 268435456 }),
      sample({ maxBytes: 268435456 }),
    ]);
    expect(result.distinctMaxBytes).toEqual([268435456, 536870912]);
  });

  it('ignores null caps in distinctMaxBytes', () => {
    const result = foldInstanceWindowStats('erp_backend', [
      sample({ maxBytes: null }),
      sample({ maxBytes: 268435456 }),
    ]);
    expect(result.distinctMaxBytes).toEqual([268435456]);
  });

  it('folds both counters independently', () => {
    const result = foldInstanceWindowStats('erp_backend', [
      sample({ evictedKeys: 0, oomErrors: 0 }),
      sample({ evictedKeys: 0, oomErrors: 3 }),
    ]);
    expect(result.evictedKeys).toEqual({ delta: 0, resetObserved: false });
    expect(result.oomErrors).toEqual({ delta: 3, resetObserved: false });
  });
});
