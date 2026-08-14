import {
  REDIS_HISTORY_CAPACITY,
  RedisMemoryHistoryStats,
  RedisMemorySample,
} from './redis-memory.types';
import {
  RedisMemoryHistoryStore,
  SampleQuery,
} from './redis-memory-history.store';

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
    const count = typeof query === 'number' ? query : query?.limit;
    if (count === undefined) {
      return [...this.samples];
    }
    return this.samples.slice(-count);
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
}