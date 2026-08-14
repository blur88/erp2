export const REDIS_SAMPLE_INTERVAL_MS = 60_000;
export const REDIS_HISTORY_CAPACITY = 1_440;
export const REDIS_PRESSURE_WINDOW_SAMPLES = 10;
export const REDIS_PRESSURE_THRESHOLD_PERCENT = 80;
export const REDIS_COMMAND_TIMEOUT_MS = 5_000;
export const REDIS_STALE_AFTER_MS = REDIS_SAMPLE_INTERVAL_MS * 3;
export const REDIS_SAMPLE_RETENTION_DAYS = 90;
export const REDIS_PRUNE_BATCH_SIZE = 5_000;
export const REDIS_PRUNE_MAX_BATCHES = 20;
export const REDIS_DETAIL_MAX_ROWS = 5_000;
export const KNOWN_INSTANCES_LIMIT = 50;

export type SampleFailureReason =
  | 'overlap-skipped'
  | 'timeout'
  | 'connection-failed'
  | 'parse-failed';
export type RedisPressureState =
  | 'insufficient-samples'
  | 'healthy'
  | 'sustained-pressure'
  | 'unknown';
export type RedisPressureUnknownReason =
  | 'sampling-failed'
  | 'sampling-gap'
  | 'stale'
  | 'uncapped'
  | 'unparseable';

export interface RedisMemorySample {
  at: string;
  ok: boolean;
  failureReason: SampleFailureReason | null;
  usedBytes: number | null;
  maxBytes: number | null;
  utilizationPercent: number | null;
  evictedKeys: number | null;
  oomErrors: number | null;
  /**
   * Set by the store on READ only. The sampler constructs samples without it
   * — the store owns the value and supplies it on the way back out.
   */
  instanceId?: string;
}

export interface KnownInstance {
  instanceId: string;
  firstSampleAt: string;
  lastSampleAt: string;
  sampleCount: number;
  current: boolean;
}

export interface RedisMemoryHistoryStats {
  bufferStartedAt: string | null;
  sampleCount: number;
  validSampleCount: number;
  capacity: number;
  latestSampleAt: string | null;
}

export interface RedisPressureSnapshot {
  state: RedisPressureState;
  reason: RedisPressureUnknownReason | null;
  /**
   * `at` of the sample that established the CURRENT state. For the initial
   * `insufficient-samples` state — before any sample exists — this is the
   * evaluator's construction time, so the field is never null and an operator
   * can always tell how long the current state has held.
   * For `unknown/stale` it is the stale boundary (`latestSampleAt +
   * REDIS_STALE_AFTER_MS`), i.e. the moment the data became stale, not the
   * moment it was last read.
   */
  stateSince: string;
  /**
   * Count of consecutive valid samples supporting the current position:
   * - while a state is established, how many consecutive samples on the
   *   OPPOSITE side have accumulated toward replacing it (0 when none);
   * - while `insufficient-samples`, how many consecutive same-side samples
   *   have accumulated toward establishing a state (0-9);
   * - always 0 for `unknown`, whose streak was discarded.
   * It is a progress indicator toward the next transition, never a total.
   */
  streakSamples: number;
}

export interface RedisCounterStatus {
  available: boolean;
  value: number | null;
  lastDelta: number;
  lastChangedAt: string | null;
}

/** A cumulative counter's movement across one window. */
export interface RedisWindowCounter {
  /**
   * Sum of positive consecutive increases — NOT max - min, which is wrong in
   * both directions across a reset. null when fewer than two comparable
   * (non-null) readings exist; that is missing evidence, not "did not move".
   */
  delta: number | null;
  /** True if any reading was lower than its predecessor. */
  resetObserved: boolean;
}

export interface RedisInstanceWindowStats {
  instanceId: string;
  sampleCount: number;
  validSampleCount: number;
  peakUsedBytes: number | null;
  peakUtilizationPercent: number | null;
  firstSampleAt: string | null;
  lastSampleAt: string | null;
  /** Distinct caps observed in-window, ascending. More than one ⇒ cap changed. */
  distinctMaxBytes: number[];
  evictedKeys: RedisWindowCounter;
  oomErrors: RedisWindowCounter;
}

export interface RedisWindowStats {
  /** Resolved bounds actually queried; null means unbounded on that side. */
  from: string | null;
  to: string | null;
  perInstance: RedisInstanceWindowStats[];
}

export interface RedisMemoryHealthView {
  latestSample: RedisMemorySample | null;
  history: RedisMemoryHistoryStats;
  pressure: RedisPressureSnapshot;
}

export interface RedisMemoryDetail extends RedisMemoryHealthView {
  samples: RedisMemorySample[];
  historyAvailable: boolean;
  truncated: boolean;
  totalMatching: number;
  appliedInstanceFilter: 'current' | 'specific' | 'all';
  knownInstances: KnownInstance[];
  configuration: {
    intervalMs: number;
    capacity: number;
    windowSamples: number;
    thresholdPercent: number;
    commandTimeoutMs: number;
    staleAfterMs: number;
    retentionDays: number;
    maxRows: number;
    instanceId: string;
    instanceIdSource: 'configured' | 'hostname' | 'generated';
  };
  counters: {
    oomErrors: RedisCounterStatus;
    evictedKeys: RedisCounterStatus;
  };
  windowStats: RedisWindowStats;
}
