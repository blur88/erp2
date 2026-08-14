import {
  REDIS_STALE_AFTER_MS,
  RedisMemorySample,
  SampleFailureReason,
} from './redis-memory.types';
import { RedisMemoryPressureEvaluator } from './redis-memory-pressure.evaluator';

/** Minute N of a fixed UTC test day, as an ISO string. */
const nowAt = (minute: number): string =>
  new Date(Date.UTC(2026, 7, 14, 0, minute)).toISOString();

const valid = (percent: number, minute: number): RedisMemorySample => ({
  at: nowAt(minute),
  ok: true,
  failureReason: null,
  usedBytes: percent,
  maxBytes: 100,
  utilizationPercent: percent,
  evictedKeys: 0,
  oomErrors: 0,
});

const failed = (
  reason: SampleFailureReason,
  minute: number,
): RedisMemorySample => ({
  at: nowAt(minute),
  ok: false,
  failureReason: reason,
  usedBytes: null,
  maxBytes: null,
  utilizationPercent: null,
  evictedKeys: null,
  oomErrors: null,
});

/** Records one sample per minute starting at `startMinute`. */
const recordMany = (
  evaluator: RedisMemoryPressureEvaluator,
  percentages: number[],
  startMinute: number,
): void => {
  percentages.forEach((percent, index) =>
    evaluator.record(valid(percent, startMinute + index)),
  );
};

describe('RedisMemoryPressureEvaluator', () => {
  it('retains healthy through nine high samples and changes on the tenth', () => {
    const evaluator = new RedisMemoryPressureEvaluator();
    recordMany(evaluator, Array(10).fill(20), 0);   // minutes 0-9  → healthy
    recordMany(evaluator, Array(9).fill(80), 10);   // minutes 10-18 → 9 high, not yet
    expect(evaluator.snapshot(nowAt(18)).state).toBe('healthy');
    evaluator.record(valid(80, 19));                // 10th consecutive high
    expect(evaluator.snapshot(nowAt(19)).state).toBe('sustained-pressure');
  });

  it('retains sustained pressure through nine low samples and recovers on the tenth', () => {
    const evaluator = new RedisMemoryPressureEvaluator();
    recordMany(evaluator, Array(10).fill(90), 0);   // minutes 0-9  → sustained-pressure
    recordMany(evaluator, Array(9).fill(20), 10);   // minutes 10-18 → 9 low, not yet
    expect(evaluator.snapshot(nowAt(18)).state).toBe('sustained-pressure');
    evaluator.record(valid(20, 19));                // 10th consecutive low
    expect(evaluator.snapshot(nowAt(19)).state).toBe('healthy');
  });

  it('does not establish a state from alternating cold-start samples', () => {
    const evaluator = new RedisMemoryPressureEvaluator();
    recordMany(evaluator, [20, 90, 20, 90, 20, 90, 20, 90, 20, 90], 0);
    expect(evaluator.snapshot(nowAt(9)).state).toBe('insufficient-samples');
  });

  it('treats exactly 80% as pressure (threshold is inclusive)', () => {
    const evaluator = new RedisMemoryPressureEvaluator();
    recordMany(evaluator, Array(10).fill(80), 0);
    expect(evaluator.snapshot(nowAt(9)).state).toBe('sustained-pressure');
  });

  it.each([
    ['overlap-skipped', 'sampling-gap'],
    ['parse-failed', 'unparseable'],
    ['timeout', 'sampling-failed'],
    ['connection-failed', 'sampling-failed'],
  ])('maps failure %s to unknown/%s', (failureReason, expectedReason) => {
    const evaluator = new RedisMemoryPressureEvaluator();
    recordMany(evaluator, Array(10).fill(20), 0);
    evaluator.record(failed(failureReason as SampleFailureReason, 10));
    expect(evaluator.snapshot(nowAt(10))).toMatchObject({
      state: 'unknown',
      reason: expectedReason,
    });
  });

  it('reports unknown/uncapped for a successful sample with no cap', () => {
    const evaluator = new RedisMemoryPressureEvaluator();
    recordMany(evaluator, Array(10).fill(20), 0);
    evaluator.record({ ...valid(0, 10), maxBytes: null, utilizationPercent: null });
    expect(evaluator.snapshot(nowAt(10))).toMatchObject({
      state: 'unknown',
      reason: 'uncapped',
    });
  });

  it('does not resume the pre-gap state after recovery', () => {
    const evaluator = new RedisMemoryPressureEvaluator();
    recordMany(evaluator, Array(10).fill(20), 0);
    evaluator.record(failed('timeout', 10));
    recordMany(evaluator, Array(9).fill(20), 0);
    expect(evaluator.snapshot(nowAt(19)).state).toBe('insufficient-samples');
    evaluator.record(valid(20, 20));
    expect(evaluator.snapshot(nowAt(20)).state).toBe('healthy');
  });

  it('overlays stale once the latest sample exceeds the stale window', () => {
    const evaluator = new RedisMemoryPressureEvaluator();
    recordMany(evaluator, Array(10).fill(20), 0);
    const latest = Date.parse(nowAt(9));
    expect(evaluator.snapshot(new Date(latest + REDIS_STALE_AFTER_MS).toISOString()).state)
      .toBe('healthy');
    expect(evaluator.snapshot(new Date(latest + REDIS_STALE_AFTER_MS + 1).toISOString()))
      .toMatchObject({
        state: 'unknown',
        reason: 'stale',
        stateSince: new Date(latest + REDIS_STALE_AFTER_MS).toISOString(),
      });
  });

  it('exposes streak progress toward the next transition', () => {
    const evaluator = new RedisMemoryPressureEvaluator();
    recordMany(evaluator, Array(10).fill(20), 0);   // healthy established
    recordMany(evaluator, Array(3).fill(90), 10);   // 3 high samples accumulate
    expect(evaluator.snapshot(nowAt(12)).streakSamples).toBe(3);
    evaluator.record(valid(20, 13));                // same-side sample resets the streak
    expect(evaluator.snapshot(nowAt(13)).streakSamples).toBe(0);
  });
});
