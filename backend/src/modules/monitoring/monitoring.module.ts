import { Module } from '@nestjs/common';
import { InMemoryRedisMemoryHistoryStore } from './in-memory-redis-memory-history.store';
import { REDIS_MEMORY_HISTORY_STORE } from './redis-memory-history.store';
import { RedisMemorySamplerService } from './redis-memory-sampler.service';

@Module({
  providers: [
    InMemoryRedisMemoryHistoryStore,
    {
      provide: REDIS_MEMORY_HISTORY_STORE,
      useExisting: InMemoryRedisMemoryHistoryStore,
    },
    RedisMemorySamplerService,
  ],
  exports: [RedisMemorySamplerService],
})
export class MonitoringModule {}
