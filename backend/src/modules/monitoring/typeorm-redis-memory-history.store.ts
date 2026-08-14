import { Injectable } from '@nestjs/common';
import { Between, FindOptionsWhere, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { RedisMemorySampleEntity } from '@/database/entities/redis-memory-sample.entity';
import { RedisMemoryHistoryStore, SampleQuery } from './redis-memory-history.store';
import {
  REDIS_DETAIL_MAX_ROWS,
  REDIS_HISTORY_CAPACITY,
  REDIS_SAMPLE_RETENTION_DAYS,
  RedisMemoryHistoryStats,
  RedisMemorySample,
  SampleFailureReason,
} from './redis-memory.types';

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
    const normalized: SampleQuery =
      typeof query === 'number' ? { limit: query } : (query ?? {});
    const take = clampLimit(normalized.limit);

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

function clampLimit(limit?: number): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return REDIS_HISTORY_CAPACITY;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), REDIS_DETAIL_MAX_ROWS);
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