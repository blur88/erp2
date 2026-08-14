import {
  REDIS_PRESSURE_THRESHOLD_PERCENT,
  REDIS_PRESSURE_WINDOW_SAMPLES,
  REDIS_STALE_AFTER_MS,
  RedisMemorySample,
  RedisPressureSnapshot,
  RedisPressureState,
  RedisPressureUnknownReason,
  SampleFailureReason,
} from './redis-memory.types';

const SAMPLE_FAILURE_REASON_MAP: Record<
  SampleFailureReason,
  RedisPressureUnknownReason
> = {
  'overlap-skipped': 'sampling-gap',
  'parse-failed': 'unparseable',
  timeout: 'sampling-failed',
  'connection-failed': 'sampling-failed',
};

type SampleSide = 'high' | 'low';

const sideOf = (percent: number): SampleSide =>
  percent >= REDIS_PRESSURE_THRESHOLD_PERCENT ? 'high' : 'low';

/**
 * Deterministic sustained-pressure state machine.
 *
 * A state is established only by the latest 10 consecutive valid samples all
 * on the same side of the threshold. An established state is retained while
 * the opposite streak accumulates and is replaced only when that streak
 * itself reaches 10. A failed, skipped, or uncapped sample immediately yields
 * `unknown` and discards both the established state and any accumulated
 * streak, so a gap is never bridged by older valid samples.
 */
export class RedisMemoryPressureEvaluator {
  private state: RedisPressureState = 'insufficient-samples';
  private reason: RedisPressureUnknownReason | null = null;
  private stateSince: string = new Date().toISOString();
  private candidateSide: SampleSide | null = null;
  private candidateCount = 0;
  private latestSampleAt: string | null = null;

  record(sample: RedisMemorySample): void {
    if (
      this.latestSampleAt === null ||
      Date.parse(sample.at) > Date.parse(this.latestSampleAt)
    ) {
      this.latestSampleAt = sample.at;
    }

    if (!sample.ok) {
      this.discard(sample.at, SAMPLE_FAILURE_REASON_MAP[sample.failureReason ?? 'connection-failed']);
      return;
    }

    if (sample.utilizationPercent === null) {
      this.discard(sample.at, 'uncapped');
      return;
    }

    const side = sideOf(sample.utilizationPercent);

    if (this.state === 'healthy' || this.state === 'sustained-pressure') {
      const establishedSide = this.state === 'sustained-pressure' ? 'high' : 'low';
      if (side === establishedSide) {
        this.candidateSide = null;
        this.candidateCount = 0;
        return;
      }
      this.candidateSide = side;
      this.candidateCount += 1;
      if (this.candidateCount >= REDIS_PRESSURE_WINDOW_SAMPLES) {
        this.state = this.state === 'healthy' ? 'sustained-pressure' : 'healthy';
        this.reason = null;
        this.stateSince = sample.at;
        this.candidateSide = null;
        this.candidateCount = 0;
      }
      return;
    }

    // `insufficient-samples` (or a fresh start after `unknown`): accumulate
    // consecutive same-side samples toward establishing a state.
    if (this.state === 'unknown' || this.candidateSide !== side) {
      this.state = 'insufficient-samples';
      this.reason = null;
      this.candidateSide = side;
      this.candidateCount = 1;
      this.stateSince = sample.at;
      return;
    }
    this.candidateCount += 1;
    if (this.candidateCount >= REDIS_PRESSURE_WINDOW_SAMPLES) {
      this.state = side === 'high' ? 'sustained-pressure' : 'healthy';
      this.reason = null;
      this.stateSince = sample.at;
      this.candidateSide = null;
      this.candidateCount = 0;
    }
  }

  snapshot(now: string): RedisPressureSnapshot {
    const staleBoundary =
      this.latestSampleAt !== null &&
      (this.state === 'healthy' || this.state === 'sustained-pressure');
    if (staleBoundary) {
      const latest = Date.parse(this.latestSampleAt!);
      if (Date.parse(now) - latest > REDIS_STALE_AFTER_MS) {
        return {
          state: 'unknown',
          reason: 'stale',
          stateSince: new Date(latest + REDIS_STALE_AFTER_MS).toISOString(),
          streakSamples: 0,
        };
      }
    }
    return {
      state: this.state,
      reason: this.reason,
      stateSince: this.stateSince,
      streakSamples: this.candidateSide === null ? 0 : this.candidateCount,
    };
  }

  private discard(at: string, reason: RedisPressureUnknownReason): void {
    this.state = 'unknown';
    this.reason = reason;
    this.stateSince = at;
    this.candidateSide = null;
    this.candidateCount = 0;
  }
}
