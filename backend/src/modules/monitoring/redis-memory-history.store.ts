import {
  KnownInstance,
  RedisMemoryHistoryStats,
  RedisMemorySample,
  RedisWindowStats,
} from './redis-memory.types';

export const REDIS_MEMORY_HISTORY_STORE = Symbol('REDIS_MEMORY_HISTORY_STORE');

/** Bounded, clamped query for the detail read path. */
export interface SampleQuery {
  /** Ignored when `allInstances` is true. */
  instanceId?: string;
  allInstances?: boolean;
  from?: Date;
  to?: Date;
  limit?: number;
}

/**
 * Async because the durable implementation is Postgres-backed. A synchronous
 * facade would require a write-behind cache with weaker durability and stale
 * reads; if sync reads are ever wanted, add an explicit cached decorator
 * rather than hiding write-behind semantics in the store.
 */
export interface RedisMemoryHistoryStore {
  append(sample: RedisMemorySample): Promise<void>;
  recent(query?: SampleQuery | number): Promise<RedisMemorySample[]>;
  stats(): Promise<RedisMemoryHistoryStats>;
  /** Distinct instance ids within the retention window, newest activity first. */
  knownInstances(): Promise<KnownInstance[]>;
  /** Rows matching `query` ignoring `limit` — powers `truncated`/`totalMatching`. */
  countMatching(query?: SampleQuery): Promise<number>;
  /**
   * Exact aggregate over the FULL filtered window, ignoring `limit`.
   *
   * The sample list is capped at REDIS_DETAIL_MAX_ROWS and newest-anchored, so
   * statistics computed from it would describe only the newest slice — at the
   * 60s interval a 30-day request returns roughly the newest 3.5 days. Peak
   * decisions (#1057) need the whole window.
   */
  windowStats(query?: SampleQuery): Promise<RedisWindowStats>;
}