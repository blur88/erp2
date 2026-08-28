import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import Redis from 'ioredis';
import { REDIS_MEMORY_HISTORY_STORE } from './redis-memory-history.store';
import type { RedisMemoryHistoryStore, SampleQuery } from './redis-memory-history.store';
import { parseEvictedKeys, parseOomErrors, parseRedisMemory, parseRunId } from './redis-info.parser';
import { RedisMemoryPressureEvaluator } from './redis-memory-pressure.evaluator';
import { RedisAlertService } from './redis-alert.service';
import { RedisAlertUnavailableReason } from './redis-alert.types';
import type { ResolvedInstanceId } from './instance-identity';
import { MONITORING_INSTANCE_ID } from './monitoring.constants';
import { RedisMemoryDetailQueryDto } from './dto/redis-memory-detail-query.dto';
import {
  REDIS_COMMAND_TIMEOUT_MS,
  REDIS_HISTORY_CAPACITY,
  REDIS_PRESSURE_THRESHOLD_PERCENT,
  REDIS_PRESSURE_WINDOW_SAMPLES,
  REDIS_SAMPLE_INTERVAL_MS,
  REDIS_SAMPLE_RETENTION_DAYS,
  REDIS_STALE_AFTER_MS,
  REDIS_DETAIL_MAX_ROWS,
  RedisCounterStatus,
  RedisMemoryDetail,
  RedisMemoryHealthView,
  RedisMemorySample,
  RedisPressureSnapshot,
  SampleFailureReason,
} from './redis-memory.types';

/** Distinguishes our deadline from a genuine Redis rejection. */
const SAMPLE_TIMEOUT = Symbol('redis-sample-timeout');

interface CounterTracker {
  value: number | null;
  lastDelta: number;
  lastChangedAt: string | null;
}

/**
 * Single source of truth for Redis memory-pressure state.
 *
 * Samples `INFO memory` / `INFO stats` / `INFO errorstats` once per minute,
 * records each tick into the bounded history store, feeds the pressure
 * evaluator, tracks cumulative OOM/eviction counter deltas, and logs state
 * transitions. It never writes Redis keys — Redis remains the BullMQ queue
 * backing store only.
 *
 * Failed and skipped ticks are recorded as failed samples with bounded
 * `failureReason` enums; raw Redis error messages never reach samples or API
 * objects.
 */
@Injectable()
export class RedisMemorySamplerService implements OnModuleInit, OnModuleDestroy {
  private readonly redisClient: Redis;
  private inFlight: Promise<void> | null = null;
  private lastIdentity: { runId: string; observedAt: string } | null = null;
  private lastIdentityAttempt: 'ok' | 'failed' | 'never' = 'never';
  private readonly oomTracker: CounterTracker = {
    value: null,
    lastDelta: 0,
    lastChangedAt: null,
  };
  private readonly evictedTracker: CounterTracker = {
    value: null,
    lastDelta: 0,
    lastChangedAt: null,
  };

  constructor(
    @Inject(REDIS_MEMORY_HISTORY_STORE)
    private readonly historyStore: RedisMemoryHistoryStore,
    @Optional()
    private readonly logger: Logger = new Logger(RedisMemorySamplerService.name),
    @Optional()
    private readonly evaluator: RedisMemoryPressureEvaluator = new RedisMemoryPressureEvaluator(),
    @Optional()
    private readonly alerts: RedisAlertService | null = null,
    @Optional()
    @Inject(MONITORING_INSTANCE_ID)
    private readonly instanceIdentity: ResolvedInstanceId | null = null,
  ) {
    this.redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: 1, // never queue retries against a Redis under pressure
      retryStrategy: () => null,
      lazyConnect: true,
      commandTimeout: REDIS_COMMAND_TIMEOUT_MS,
      // ioredis 6 defaults to RESP3 (`protocol: 3`); v5 used RESP2. Pinned to 2
      // so the ioredis 6 upgrade changed only the dependency, not the wire
      // protocol. Matters here because INFO parsing reads raw reply text.
      protocol: 2,
    });
  }

  async onModuleInit(): Promise<void> {
    // Immediate startup sample so the buffer is not empty for a full interval.
    await this.sampleNow();
  }

  async onModuleDestroy(): Promise<void> {
    try {
      this.redisClient.disconnect();
    } catch {
      // Ignore teardown errors; the sampler must not fail application shutdown.
    }
  }

  /**
   * Sample Redis once and record the result. Scheduled invocations must never
   * overlap: a tick that arrives while one is in flight awaits the in-flight
   * sample, then appends an `overlap-skipped` record so the sequence (and
   * therefore the pressure evaluator's "no bridging" guarantee) stays intact.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async sampleNow(): Promise<void> {
    if (this.inFlight) {
      const inFlight = this.inFlight;
      await inFlight;
      await this.recordSample(this.failedSample(new Date().toISOString(), 'overlap-skipped'));
      return;
    }

    const invocation = this.performSample();
    this.inFlight = invocation;
    try {
      await invocation;
    } finally {
      this.inFlight = null;
    }
  }

  async getLatestSample(): Promise<RedisMemorySample | null> {
    return (await this.historyStore.recent(1))[0] ?? null;
  }

  /**
   * Attempt status is checked BEFORE freshness so the two rules cannot
   * disagree: after a tick fails to read run_id, a still-fresh previous
   * success must not keep serving a row the write path has stopped
   * maintaining.
   *
   * `lastIdentity.runId` survives a failure for diagnostics and to let a
   * recovered tick resume against the same row — it never decides identity
   * novelty, which comes only from the repository insert's affected-row count.
   */
  getIdentity(): { runId: string | null; reason: RedisAlertUnavailableReason | null } {
    if (this.lastIdentityAttempt === 'failed' || this.lastIdentityAttempt === 'never') {
      return { runId: null, reason: 'redis-identity-unknown' };
    }
    const observedAt = this.lastIdentity ? Date.parse(this.lastIdentity.observedAt) : 0;
    if (!this.lastIdentity || Date.now() - observedAt > REDIS_STALE_AFTER_MS) {
      return { runId: null, reason: 'redis-identity-stale' };
    }
    return { runId: this.lastIdentity.runId, reason: null };
  }

  getPressureSnapshot(): RedisPressureSnapshot {
    return this.evaluator.snapshot(new Date().toISOString());
  }

  async getHealthView(): Promise<RedisMemoryHealthView> {
    return {
      latestSample: await this.getLatestSample(),
      history: await this.historyStore.stats(),
      pressure: this.getPressureSnapshot(),
    };
  }

  async getDetail(query: RedisMemoryDetailQueryDto = {}): Promise<RedisMemoryDetail> {
    const identity =
      this.instanceIdentity ?? { instanceId: 'unknown', source: 'generated' as const };
    const storeQuery: SampleQuery = {
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      limit: query.limit,
      instanceId: query.instanceId,
      allInstances: query.allInstances,
    };

    // allInstances wins over instanceId (see spec: a client with a stale
    // instanceId in its query state must not silently get a narrower result).
    const appliedInstanceFilter: 'current' | 'specific' | 'all' = query.allInstances
      ? 'all'
      : query.instanceId
        ? 'specific'
        : 'current';

    const base = {
      configuration: {
        intervalMs: REDIS_SAMPLE_INTERVAL_MS,
        capacity: REDIS_HISTORY_CAPACITY,
        windowSamples: REDIS_PRESSURE_WINDOW_SAMPLES,
        thresholdPercent: REDIS_PRESSURE_THRESHOLD_PERCENT,
        commandTimeoutMs: REDIS_COMMAND_TIMEOUT_MS,
        staleAfterMs: REDIS_STALE_AFTER_MS,
        retentionDays: REDIS_SAMPLE_RETENTION_DAYS,
        maxRows: REDIS_DETAIL_MAX_ROWS,
        instanceId: identity.instanceId,
        instanceIdSource: identity.source,
      },
      counters: {
        oomErrors: this.trackerStatus(this.oomTracker),
        evictedKeys: this.trackerStatus(this.evictedTracker),
      },
      appliedInstanceFilter,
    };

    try {
      const [samples, totalMatching, knownInstances, history, latestSample, windowStats] =
        await Promise.all([
          this.historyStore.recent(storeQuery),
          this.historyStore.countMatching(storeQuery),
          this.historyStore.knownInstances(),
          this.historyStore.stats(),
          // Fetched INDEPENDENTLY of the filtered query. `latestSample` feeds
          // the health view, whose meaning is "this instance's most recent
          // reading". Taking it from the filtered result set would silently
          // change that meaning whenever an operator widened the range or
          // asked for all instances.
          this.getLatestSample(),
          this.historyStore.windowStats(storeQuery),
        ]);

      return {
        ...base,
        latestSample,
        history,
        pressure: this.getPressureSnapshot(),
        samples,
        historyAvailable: true,
        // Truncation is reported so a clipped window is never mistaken for a
        // quiet one.
        truncated: totalMatching > samples.length,
        totalMatching,
        knownInstances,
        windowStats,
      };
    } catch (error) {
      // A storage failure degrades the view; it never 500s a monitoring read.
      this.logger.warn(`Redis memory detail unavailable: ${error.message}`);
      return {
        ...base,
        latestSample: null,
        history: {
          bufferStartedAt: null,
          sampleCount: 0,
          validSampleCount: 0,
          capacity: REDIS_HISTORY_CAPACITY,
          latestSampleAt: null,
        },
        pressure: this.getPressureSnapshot(),
        samples: [],
        historyAvailable: false,
        truncated: false,
        totalMatching: 0,
        knownInstances: [],
        // A failed aggregate must not blank the whole detail response; an empty
        // window is reported as empty, never as a peak of zero.
        windowStats: { from: null, to: null, perInstance: [] },
      };
    }
  }

  private trackerStatus(tracker: CounterTracker): RedisCounterStatus {
    return {
      available: tracker.value !== null,
      value: tracker.value,
      lastDelta: tracker.lastDelta,
      lastChangedAt: tracker.lastChangedAt,
    };
  }

  /**
   * Enforce the command deadline in application code. A mocked or driver-level
   * promise never passes through ioredis's transport, so its own
   * `commandTimeout` cannot be relied on; the deadline must be enforced here.
   */
  private async withTimeout<T>(operation: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(SAMPLE_TIMEOUT), REDIS_COMMAND_TIMEOUT_MS);
        }),
      ]);
    } finally {
      // Always clear, or a pending timer keeps the process alive.
      clearTimeout(timer);
    }
  }

  private async performSample(): Promise<void> {
    const at = new Date().toISOString();

    // Pessimistic by default: any path that leaves this method without
    // parsing a run_id — including the connection-failed early return below —
    // must leave identity invalid. Promoting only on success means no failure
    // path can be forgotten.
    this.lastIdentityAttempt = 'failed';

    try {
      if (this.redisClient.status === 'wait' || this.redisClient.status === 'end') {
        await this.redisClient.connect();
      }
      await this.redisClient.ping();
    } catch {
      await this.recordSample(this.failedSample(at, 'connection-failed'));
      return;   // identity stays 'failed'
    }

    try {
      const runId = parseRunId(await this.withTimeout(this.redisClient.info('server')));
      if (runId !== null) {
        this.lastIdentityAttempt = 'ok';
        this.lastIdentity = { runId, observedAt: at };
      }
    } catch {
      // stays 'failed'
    }

    let usedBytes: number | null = null;
    let maxBytes: number | null = null;
    let utilizationPercent: number | null = null;
    let failureReason: SampleFailureReason | null = null;

    try {
      const parsed = parseRedisMemory(
        await this.withTimeout(this.redisClient.info('memory')),
      );
      if (parsed === null) {
        failureReason = 'parse-failed';
      } else {
        usedBytes = parsed.usedBytes;
        maxBytes = parsed.maxBytes;
        utilizationPercent = parsed.utilizationPercent;
      }
    } catch (error) {
      failureReason = error === SAMPLE_TIMEOUT ? 'timeout' : 'connection-failed';
    }

    // Counter reads are independent of the memory reading: a hanging or
    // failing counter read yields a null counter but never fails an otherwise
    // valid memory sample.
    let evictedKeys: number | null = null;
    let oomErrors: number | null = null;
    if (failureReason === null) {
      try {
        evictedKeys = parseEvictedKeys(
          await this.withTimeout(this.redisClient.info('stats')),
        );
      } catch {
        evictedKeys = null;
      }
      try {
        oomErrors = parseOomErrors(
          await this.withTimeout(this.redisClient.info('errorstats')),
        );
      } catch {
        oomErrors = null;
      }
    }

    await this.recordSample({
      at,
      ok: failureReason === null,
      failureReason,
      usedBytes,
      maxBytes,
      utilizationPercent,
      evictedKeys,
      oomErrors,
    });
  }

  private async recordSample(sample: RedisMemorySample): Promise<void> {
    try {
      await this.historyStore.append(sample);
    } catch (error) {
      // A diagnostic must never fail a sample or boot.
      this.logger.warn(`Failed to persist Redis memory sample: ${error.message}`);
    }

    const before = this.evaluator.snapshot(sample.at).state;
    this.evaluator.record(sample);
    const after = this.evaluator.snapshot(sample.at).state;
    if (before !== after) {
      this.logger.warn(
        `Redis memory pressure state changed: ${before} -> ${after} ` +
          `(utilization ${sample.utilizationPercent ?? 'n/a'}%, ` +
          `${sample.usedBytes ?? 'n/a'} of ${sample.maxBytes ?? 'n/a'} bytes, ` +
          `window ${REDIS_PRESSURE_WINDOW_SAMPLES} samples, at ${sample.at})`,
      );
    }

    const { runId } = this.getIdentity();
    try {
      // ONE call, therefore one transaction and one lock per tick.
      await this.alerts?.applySample(
        {
          pressure: { state: after, utilizationPercent: sample.utilizationPercent, at: sample.at },
          rawOomCounter: sample.ok ? sample.oomErrors : null,
          at: sample.at,
        },
        runId,
      );
    } catch (error) {
      this.logger.warn(`Failed to persist Redis alert state: ${error.message}`);
    }

    if (sample.ok) {
      this.trackCounter(this.evictedTracker, 'evicted_keys', sample.evictedKeys, sample.at);
      this.trackCounter(this.oomTracker, 'OOM errors', sample.oomErrors, sample.at);
    }
  }

  /**
   * Cumulative-counter handling: the first observation baselines silently, an
   * increase reports an occurrence with the delta, and a decrease (Redis
   * restart or `CONFIG RESETSTAT`) re-baselines silently.
   *
   * Kept for `RedisCounterStatus` reporting and warn logging only — it no
   * longer emits alert events; alert transitions consume the raw counter
   * through `RedisAlertService.applySample`.
   */
  private trackCounter(
    tracker: CounterTracker,
    label: string,
    value: number | null,
    at: string,
  ): void {
    if (value === null) {
      return;
    }
    if (tracker.value === null) {
      tracker.value = value;
      return;
    }
    if (value > tracker.value) {
      const delta = value - tracker.value;
      tracker.lastDelta = delta;
      tracker.lastChangedAt = at;
      this.logger.warn(`Redis ${label} counter increased by ${delta} (now ${value}) at ${at}`);
    } else if (value < tracker.value) {
      tracker.lastDelta = 0;
      tracker.lastChangedAt = null;
    }
    tracker.value = value;
  }

  private failedSample(at: string, failureReason: SampleFailureReason): RedisMemorySample {
    return {
      at,
      ok: false,
      failureReason,
      usedBytes: null,
      maxBytes: null,
      utilizationPercent: null,
      evictedKeys: null,
      oomErrors: null,
    };
  }
}
