import { Module } from '@nestjs/common';
import { InMemoryRedisMemoryHistoryStore } from './in-memory-redis-memory-history.store';
import { MonitoringController } from './monitoring.controller';
import { REDIS_MEMORY_HISTORY_STORE } from './redis-memory-history.store';
import { RedisAlertService } from './redis-alert.service';
import { RedisMemorySamplerService } from './redis-memory-sampler.service';

@Module({
  controllers: [MonitoringController],
  providers: [
    InMemoryRedisMemoryHistoryStore,
    {
      provide: REDIS_MEMORY_HISTORY_STORE,
      useExisting: InMemoryRedisMemoryHistoryStore,
    },
    RedisAlertService,
    RedisMemorySamplerService,
  ],
  exports: [RedisMemorySamplerService, RedisAlertService],
})
export class MonitoringModule {}
