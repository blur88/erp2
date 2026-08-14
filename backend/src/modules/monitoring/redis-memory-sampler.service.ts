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
import {
  REDIS_MEMORY_HISTORY_STORE,
  RedisMemoryHistoryStore,
} from './redis-memory-history.store';
import { parseEvictedKeys, parseOomErrors, parseRedisMemory } from './redis-info.parser';
import { RedisMemoryPressureEvaluator } from './redis-memory-pressure.evaluator';
import { RedisAlertService } from './redis-alert.service';
import { RedisOomCounterEvent } from './redis-alert.types';
import {
  REDIS_COMMAND_TIMEOUT_MS,
  REDIS_HISTORY_CAPACITY,
  REDIS_PRESSURE_THRESHOLD_PERCENT,
  REDIS_PRESSURE_WINDOW_SAMPLES,
  REDIS_SAMPLE_INTERVAL_MS,
  REDIS_STALE_AFTER_MS,
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
  ) {
    this.redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: 1, // never queue retries against a Redis under pressure
      retryStrategy: () => null,
      lazyConnect: true,
      commandTimeout: REDIS_COMMAND_TIMEOUT_MS,
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

  async getDetail(): Promise<RedisMemoryDetail> {
    const trackerStatus = (tracker: CounterTracker): RedisCounterStatus => ({
      available: tracker.value !== null,
      value: tracker.value,
      lastDelta: tracker.lastDelta,
      lastChangedAt: tracker.lastChangedAt,
    });
    return {
      ...(await this.getHealthView()),
      samples: await this.historyStore.recent(),
      configuration: {
        intervalMs: REDIS_SAMPLE_INTERVAL_MS,
        capacity: REDIS_HISTORY_CAPACITY,
        windowSamples: REDIS_PRESSURE_WINDOW_SAMPLES,
        thresholdPercent: REDIS_PRESSURE_THRESHOLD_PERCENT,
        commandTimeoutMs: REDIS_COMMAND_TIMEOUT_MS,
        staleAfterMs: REDIS_STALE_AFTER_MS,
      },
      counters: {
        oomErrors: trackerStatus(this.oomTracker),
        evictedKeys: trackerStatus(this.evictedTracker),
      },
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

    try {
      if (this.redisClient.status === 'wait' || this.redisClient.status === 'end') {
        await this.redisClient.connect();
      }
      await this.redisClient.ping();
    } catch {
      await this.recordSample(this.failedSample(at, 'connection-failed'));
      return;
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
    await this.historyStore.append(sample);

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

    this.alerts?.onPressureState({
      state: after,
      utilizationPercent: sample.utilizationPercent,
      at: sample.at,
    });

    if (sample.ok) {
      this.trackCounter(this.oomTracker, 'OOM errors', sample.oomErrors, sample.at, (event) =>
        this.alerts?.onOomCounter(event),
      );
      this.trackCounter(this.evictedTracker, 'evicted_keys', sample.evictedKeys, sample.at);
    }
  }

  /**
   * Cumulative-counter handling: the first observation baselines silently, an
   * increase reports an occurrence with the delta, and a decrease (Redis
   * restart or `CONFIG RESETSTAT`) re-baselines silently.
   */
  private trackCounter(
    tracker: CounterTracker,
    label: string,
    value: number | null,
    at: string,
    emit?: (event: RedisOomCounterEvent) => void,
  ): void {
    if (value === null) {
      return;
    }
    if (tracker.value === null) {
      tracker.value = value;
      emit?.({ previousValue: null, value, delta: 0, kind: 'baseline', at });
      return;
    }
    if (value > tracker.value) {
      const delta = value - tracker.value;
      tracker.lastDelta = delta;
      tracker.lastChangedAt = at;
      this.logger.warn(`Redis ${label} counter increased by ${delta} (now ${value}) at ${at}`);
      emit?.({ previousValue: tracker.value, value, delta, kind: 'increase', at });
    } else if (value < tracker.value) {
      tracker.lastDelta = 0;
      tracker.lastChangedAt = null;
      emit?.({ previousValue: tracker.value, value, delta: 0, kind: 'reset', at });
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
