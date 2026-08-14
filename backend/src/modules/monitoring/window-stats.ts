import {
  RedisInstanceWindowStats,
  RedisMemorySample,
  RedisWindowCounter,
} from './redis-memory.types';

/**
 * Folds a cumulative counter's readings into one window delta.
 *
 * Sums POSITIVE consecutive increases. `max - min` is wrong across a reset in
 * both directions: 0→40→0→10 has a true increase of 50 but a max-min of 40
 * (undercount), and 0→40→0 has a true increase of 40 from the pre-reset climb
 * that max-min happens to match only by coincidence — while 40→0→0 read as a
 * fresh window would overcount. This matches `applyOomCounter`'s live-path
 * semantics so the aggregate and the alert state agree.
 *
 * Nulls are skipped rather than treated as zero: a failed sample is a missing
 * reading, and reading it as 0 would fabricate a reset.
 */
export function foldCounter(values: (number | null)[]): RedisWindowCounter {
  const readings = values.filter((value): value is number => value !== null);
  if (readings.length < 2) {
    // One reading cannot establish movement. Distinct from a delta of 0.
    return { delta: null, resetObserved: false };
  }

  let delta = 0;
  let resetObserved = false;
  for (let index = 1; index < readings.length; index += 1) {
    const difference = readings[index] - readings[index - 1];
    if (difference > 0) {
      delta += difference;
    } else if (difference < 0) {
      resetObserved = true;
    }
  }
  return { delta, resetObserved };
}

/** `samples` MUST already be ordered ascending by (sampledAt, id). */
export function foldInstanceWindowStats(
  instanceId: string,
  samples: RedisMemorySample[],
): RedisInstanceWindowStats {
  const caps = new Set<number>();
  let peakUsedBytes: number | null = null;
  let peakUtilizationPercent: number | null = null;
  let validSampleCount = 0;

  for (const sample of samples) {
    if (sample.ok) {
      validSampleCount += 1;
    }
    if (sample.maxBytes !== null) {
      caps.add(sample.maxBytes);
    }
    if (sample.usedBytes !== null && (peakUsedBytes === null || sample.usedBytes > peakUsedBytes)) {
      peakUsedBytes = sample.usedBytes;
    }
    if (
      sample.utilizationPercent !== null &&
      (peakUtilizationPercent === null || sample.utilizationPercent > peakUtilizationPercent)
    ) {
      peakUtilizationPercent = sample.utilizationPercent;
    }
  }

  return {
    instanceId,
    sampleCount: samples.length,
    validSampleCount,
    peakUsedBytes,
    peakUtilizationPercent,
    firstSampleAt: samples[0]?.at ?? null,
    lastSampleAt: samples[samples.length - 1]?.at ?? null,
    distinctMaxBytes: [...caps].sort((left, right) => left - right),
    evictedKeys: foldCounter(samples.map((sample) => sample.evictedKeys)),
    oomErrors: foldCounter(samples.map((sample) => sample.oomErrors)),
  };
}