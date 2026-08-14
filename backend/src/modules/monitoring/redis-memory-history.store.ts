import { RedisMemoryHistoryStats, RedisMemorySample } from './redis-memory.types';

export const REDIS_MEMORY_HISTORY_STORE = Symbol('REDIS_MEMORY_HISTORY_STORE');

export interface RedisMemoryHistoryStore {
  append(sample: RedisMemorySample): void;
  recent(count?: number): RedisMemorySample[];
  stats(): RedisMemoryHistoryStats;
}
