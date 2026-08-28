import { Injectable } from '@nestjs/common';
import { Between, FindOptionsWhere, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { RedisMemorySampleEntity } from '@/database/entities/redis-memory-sample.entity';
import type { RedisMemoryHistoryStore, SampleQuery } from './redis-memory-history.store';
import { normalizeSampleQuery } from './normalize-sample-query';
import {
  KNOWN_INSTANCES_LIMIT,
  REDIS_HISTORY_CAPACITY,
  REDIS_SAMPLE_RETENTION_DAYS,
  KnownInstance,
  RedisMemoryHistoryStats,
  RedisMemorySample,
  RedisWindowCounter,
  RedisWindowStats,
  SampleFailureReason,
} from './redis-memory.types';
import { safeIntegerTransformer } from '@/database/transformers/safe-integer.transformer';

/**
 * Postgres-backed sample history.
 *
 * Reads default to the current instance over the last 24 hours so `stats()`
 * and the detail route keep the exact semantics the in-memory ring buffer had.
 */
@Injectable()
export class TypeOrmRedisMemoryHistoryStore implements RedisMemoryHistoryStore {
  constructor(
    private readonly repository: Repository<RedisMemorySampleEntity>,
    private readonly instanceId: string,
  ) {}

  async append(sample: RedisMemorySample): Promise<void> {
    await this.repository.insert({
      instanceId: this.instanceId,
      sampledAt: new Date(sample.at),
      ok: sample.ok,
      failureReason: sample.failureReason,
      usedBytes: sample.usedBytes,
      maxBytes: sample.maxBytes,
      utilizationPercent: sample.utilizationPercent,
      evictedKeys: sample.evictedKeys,
      oomErrors: sample.oomErrors,
    });
  }

  async recent(query?: SampleQuery | number): Promise<RedisMemorySample[]> {
    const normalized = normalizeSampleQuery(query);
    const take = normalized.limit;

    // Newest-anchored: take the most recent `take` rows in the window, then
    // emit ascending so a truncated window is a recent slice, not an old one.
    const rows = await this.repository.find({
      where: this.whereFor(normalized),
      order: { sampledAt: 'DESC', id: 'DESC' },
      take,
    });

    return rows
      .reverse()
      .map((row) => ({
        at: row.sampledAt.toISOString(),
        ok: row.ok,
        failureReason: row.failureReason as SampleFailureReason | null,
        usedBytes: row.usedBytes,
        maxBytes: row.maxBytes,
        utilizationPercent:
          row.utilizationPercent === null ? null : Number(row.utilizationPercent),
        evictedKeys: row.evictedKeys,
        oomErrors: row.oomErrors,
        instanceId: row.instanceId,
      }));
  }

  /** Current-instance, 24-hour-window statistics — the in-memory semantics. */
  async stats(): Promise<RedisMemoryHistoryStats> {
    const samples = await this.recent({ limit: REDIS_HISTORY_CAPACITY });
    return {
      bufferStartedAt: samples[0]?.at ?? null,
      sampleCount: samples.length,
      validSampleCount: samples.filter((sample) => sample.ok).length,
      capacity: REDIS_HISTORY_CAPACITY,
      latestSampleAt: samples[samples.length - 1]?.at ?? null,
    };
  }

  async countMatching(query: SampleQuery = {}): Promise<number> {
    return this.repository.count({ where: this.whereFor(query) });
  }

  /**
   * Exact aggregate over the full filtered window.
   *
   * One pass: `LAG` over (sampled_at, id) — the same ordering `recent()` uses —
   * yields each reading's predecessor, so positive increases sum and any
   * decrease flags a reset without pulling up to ~43k rows into JS. `MAX(...) -
   * MIN(...)` is deliberately NOT used; it is wrong across a counter reset.
   */
  async windowStats(query: SampleQuery = {}): Promise<RedisWindowStats> {
    const normalized = normalizeSampleQuery(query);

    const conditions: string[] = [];
    const parameters: unknown[] = [];

    if (!normalized.allInstances) {
      conditions.push(`"instanceId" = $${parameters.length + 1}`);
      parameters.push(normalized.instanceId ?? this.instanceId);
    }
    if (normalized.from) {
      conditions.push(`"sampledAt" >= $${parameters.length + 1}`);
      parameters.push(normalized.from);
    }
    if (normalized.to) {
      conditions.push(`"sampledAt" <= $${parameters.length + 1}`);
      parameters.push(normalized.to);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      WITH windowed AS (
        SELECT
          "instanceId", "sampledAt", "id", ok, "usedBytes", "maxBytes",
          "utilizationPercent", "evictedKeys", "oomErrors"
        FROM redis_memory_samples
        ${whereClause}
      ),
      stepped AS (
        SELECT
          "instanceId", "sampledAt", "id", ok, "usedBytes", "maxBytes", "utilizationPercent",
          "evictedKeys",
          LAG("evictedKeys") OVER (
            PARTITION BY "instanceId" ORDER BY "sampledAt", "id"
          ) AS prev_evicted,
          "oomErrors",
          LAG("oomErrors") OVER (
            PARTITION BY "instanceId" ORDER BY "sampledAt", "id"
          ) AS prev_oom
        FROM windowed
      )
      SELECT
        "instanceId" AS instance_id,
        COUNT(*)                                        AS sample_count,
        COUNT(*) FILTER (WHERE ok)                      AS valid_sample_count,
        MAX("usedBytes")                                AS peak_used_bytes,
        MAX("utilizationPercent")                       AS peak_utilization_percent,
        MIN("sampledAt")                                AS first_sample_at,
        MAX("sampledAt")                                AS last_sample_at,
        COALESCE(
          ARRAY_AGG(DISTINCT "maxBytes") FILTER (WHERE "maxBytes" IS NOT NULL),
          '{}'
        )                                               AS distinct_max_bytes,
        COUNT("evictedKeys")                            AS evicted_readings,
        SUM(GREATEST("evictedKeys" - prev_evicted, 0))
          FILTER (WHERE prev_evicted IS NOT NULL)       AS evicted_delta,
        COALESCE(
          BOOL_OR("evictedKeys" < prev_evicted) FILTER (WHERE prev_evicted IS NOT NULL),
          false
        )                                               AS evicted_reset,
        COUNT("oomErrors")                              AS oom_readings,
        SUM(GREATEST("oomErrors" - prev_oom, 0))
          FILTER (WHERE prev_oom IS NOT NULL)           AS oom_delta,
        COALESCE(
          BOOL_OR("oomErrors" < prev_oom) FILTER (WHERE prev_oom IS NOT NULL),
          false
        )                                               AS oom_reset
      FROM stepped
      GROUP BY "instanceId"
      ORDER BY "instanceId" ASC
    `;

    const rows: RawWindowStatsRow[] = await this.repository.query(sql, parameters);

    return {
      from: normalized.from?.toISOString() ?? null,
      to: normalized.to?.toISOString() ?? null,
      perInstance: rows.map((row) => ({
        instanceId: row.instance_id,
        sampleCount: toCount(row.sample_count),
        validSampleCount: toCount(row.valid_sample_count),
        peakUsedBytes: toBigIntOrNull(row.peak_used_bytes),
        peakUtilizationPercent:
          row.peak_utilization_percent === null ? null : Number(row.peak_utilization_percent),
        firstSampleAt: row.first_sample_at?.toISOString() ?? null,
        lastSampleAt: row.last_sample_at?.toISOString() ?? null,
        distinctMaxBytes: row.distinct_max_bytes
          .map((value) => toBigIntOrNull(value))
          .filter((value): value is number => value !== null)
          .sort((left, right) => left - right),
        evictedKeys: toCounter(row.evicted_readings, row.evicted_delta, row.evicted_reset),
        oomErrors: toCounter(row.oom_readings, row.oom_delta, row.oom_reset),
      })),
    };
  }

  async knownInstances(): Promise<KnownInstance[]> {
    const floor = new Date(Date.now() - REDIS_SAMPLE_RETENTION_DAYS * 86_400_000);
    const rows = await this.repository
      .createQueryBuilder('sample')
      .select('sample.instanceId', 'instanceId')
      .addSelect('MIN(sample.sampledAt)', 'firstSampleAt')
      .addSelect('MAX(sample.sampledAt)', 'lastSampleAt')
      .addSelect('COUNT(*)', 'sampleCount')
      .where('sample.sampledAt >= :floor', { floor })
      .groupBy('sample.instanceId')
      .orderBy('MAX(sample.sampledAt)', 'DESC')
      .limit(KNOWN_INSTANCES_LIMIT)
      .getRawMany<{
        instanceId: string;
        firstSampleAt: Date;
        lastSampleAt: Date;
        sampleCount: string;
      }>();

    return rows.map((row) => ({
      instanceId: row.instanceId,
      firstSampleAt: row.firstSampleAt.toISOString(),
      lastSampleAt: row.lastSampleAt.toISOString(),
      sampleCount: Number(row.sampleCount),
      current: row.instanceId === this.instanceId,
    }));
  }

  private whereFor(query: SampleQuery): FindOptionsWhere<RedisMemorySampleEntity> {
    const where: FindOptionsWhere<RedisMemorySampleEntity> = {};

    // allInstances wins over instanceId: a client that sets the flag and
    // leaves a stale instanceId in its query state must not silently get a
    // narrower result than it asked for.
    if (!query.allInstances) {
      where.instanceId = query.instanceId ?? this.instanceId;
    }

    const { from, to } = clampWindow(query.from, query.to);
    if (from && to) {
      where.sampledAt = Between(from, to);
    } else if (from) {
      where.sampledAt = MoreThanOrEqual(from);
    } else if (to) {
      where.sampledAt = LessThanOrEqual(to);
    }
    return where;
  }
}

/** Clamps rather than erroring; `from` after `to` yields an empty window. */
function clampWindow(from?: Date, to?: Date): { from: Date; to: Date } {
  const now = new Date();
  const floor = new Date(now.getTime() - REDIS_SAMPLE_RETENTION_DAYS * 86_400_000);
  const defaultFrom = new Date(now.getTime() - 24 * 3_600_000);

  const resolvedTo = to && to < now ? to : now;
  const requestedFrom = from ?? defaultFrom;
  const resolvedFrom = requestedFrom < floor ? floor : requestedFrom;
  return { from: resolvedFrom, to: resolvedTo };
}

interface RawWindowStatsRow {
  instance_id: string;
  sample_count: string;
  valid_sample_count: string;
  peak_used_bytes: string | null;
  peak_utilization_percent: string | null;
  first_sample_at: Date | null;
  last_sample_at: Date | null;
  distinct_max_bytes: string[];
  evicted_readings: string;
  evicted_delta: string | null;
  evicted_reset: boolean;
  oom_readings: string;
  oom_delta: string | null;
  oom_reset: boolean;
}

/** COUNT(*) is bounded by retention; a plain parse is safe here. */
function toCount(value: string): number {
  return Number.parseInt(value, 10);
}

/**
 * pg returns bigint as a string. Routed through the entity transformer so an
 * out-of-range value throws instead of silently truncating (see CLAUDE.md).
 */
function toBigIntOrNull(value: string | null): number | null {
  return value === null ? null : (safeIntegerTransformer.from(value) as number | null);
}

/**
 * Fewer than two comparable readings cannot establish movement, so the delta is
 * null — distinct from 0, which asserts the counter was measured and did not
 * move. Under `noeviction` that distinction matters: a null evicted delta is
 * missing evidence, not a clean bill of health.
 */
function toCounter(
  readings: string,
  delta: string | null,
  resetObserved: boolean,
): RedisWindowCounter {
  if (toCount(readings) < 2 || delta === null) {
    return { delta: null, resetObserved };
  }
  return { delta: toBigIntOrNull(delta) ?? 0, resetObserved };
}