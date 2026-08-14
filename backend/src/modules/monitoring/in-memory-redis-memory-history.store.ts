import {
  REDIS_HISTORY_CAPACITY,
  RedisMemoryHistoryStats,
  RedisMemorySample,
  RedisWindowStats,
  KnownInstance,
} from './redis-memory.types';
import {
  RedisMemoryHistoryStore,
  SampleQuery,
} from './redis-memory-history.store';
import { foldInstanceWindowStats } from './window-stats';
import { normalizeSampleQuery } from './normalize-sample-query';

export const IN_MEMORY_INSTANCE_ID = 'in-memory';

/**
 * Bounded in-memory ring buffer of the most recent scheduled samples.
 *
 * The retention boundary is deliberate: the buffer starts empty after a
 * restart, holds at most 24 hours of samples (1440 at the 60s interval), and
 * is NOT a production cap-re-evaluation dataset. A durable store can replace
 * it later through the `RedisMemoryHistoryStore` contract without touching
 * the sampler or controller.
 */
export class InMemoryRedisMemoryHistoryStore implements RedisMemoryHistoryStore {
  private readonly samples: RedisMemorySample[] = [];

  constructor(private readonly capacity: number = REDIS_HISTORY_CAPACITY) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error(`History capacity must be a positive integer, got ${capacity}`);
    }
  }

  async append(sample: RedisMemorySample): Promise<void> {
    this.samples.push(sample);
    if (this.samples.length > this.capacity) {
      this.samples.shift();
    }
  }

  async recent(query?: SampleQuery | number): Promise<RedisMemorySample[]> {
    const normalized: SampleQuery =
      typeof query === 'number' ? { limit: query } : (query ?? {});
    const rows = this.matching(normalized).map((sample) => ({
      ...sample,
      instanceId: IN_MEMORY_INSTANCE_ID,
    }));
    const count = normalized.limit;
    return count === undefined ? rows : rows.slice(-count);
  }

  async stats(): Promise<RedisMemoryHistoryStats> {
    const sampleCount = this.samples.length;
    const validSampleCount = this.samples.filter((sample) => sample.ok).length;
    return {
      bufferStartedAt: this.samples[0]?.at ?? null,
      sampleCount,
      validSampleCount,
      capacity: this.capacity,
      latestSampleAt: this.samples[sampleCount - 1]?.at ?? null,
    };
  }

  /**
   * Honours the same query contract as `recent()` minus `limit`, so
   * `truncated`/`totalMatching` mean the same thing on this implementation as
   * on the durable one. Returning the whole buffer regardless of the query
   * would report spurious truncation for any narrowed window.
   */
  async countMatching(query: SampleQuery = {}): Promise<number> {
    return this.matching(query).length;
  }

  private matching(query: SampleQuery): RedisMemorySample[] {
    const wantsOtherInstance =
      !query.allInstances &&
      query.instanceId !== undefined &&
      query.instanceId !== IN_MEMORY_INSTANCE_ID;
    if (wantsOtherInstance) {
      return [];
    }
    return this.samples.filter((sample) => {
      const at = Date.parse(sample.at);
      if (query.from && at < query.from.getTime()) {
        return false;
      }
      if (query.to && at > query.to.getTime()) {
        return false;
      }
      return true;
    });
  }

  async knownInstances(): Promise<KnownInstance[]> {
    if (this.samples.length === 0) {
      return [];
    }
    return [
      {
        instanceId: IN_MEMORY_INSTANCE_ID,
        firstSampleAt: this.samples[0].at,
        lastSampleAt: this.samples[this.samples.length - 1].at,
        sampleCount: this.samples.length,
        current: true,
      },
    ];
  }

  /**
   * Same semantics as the durable store's aggregate, over the buffer.
   *
   * Deliberately ignores `limit`: the aggregate describes the whole window,
   * which is the entire reason it exists separately from `recent()`.
   */
  async windowStats(query: SampleQuery = {}): Promise<RedisWindowStats> {
    const normalized = normalizeSampleQuery(query);
    const rows = this.matching(normalized).map((sample) => ({
      ...sample,
      instanceId: IN_MEMORY_INSTANCE_ID,
    }));
    return {
      from: normalized.from?.toISOString() ?? null,
      to: normalized.to?.toISOString() ?? null,
      perInstance:
        rows.length === 0 ? [] : [foldInstanceWindowStats(IN_MEMORY_INSTANCE_ID, rows)],
    };
  }
}
