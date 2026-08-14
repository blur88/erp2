import { Logger, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RedisAlertStateEntity } from '@/database/entities/redis-alert-state.entity';
import { RedisMemorySampleEntity } from '@/database/entities/redis-memory-sample.entity';
import { MonitoringController } from './monitoring.controller';
import { resolveInstanceId } from './instance-identity';
import { REDIS_MEMORY_HISTORY_STORE } from './redis-memory-history.store';
import { RedisAlertService } from './redis-alert.service';
import { RedisAlertStateRepository } from './redis-alert-state.repository';
import { RedisMemorySamplerService } from './redis-memory-sampler.service';
import { TypeOrmRedisMemoryHistoryStore } from './typeorm-redis-memory-history.store';

export const MONITORING_INSTANCE_ID = Symbol('MONITORING_INSTANCE_ID');

@Module({
  imports: [TypeOrmModule.forFeature([RedisMemorySampleEntity, RedisAlertStateEntity])],
  controllers: [MonitoringController],
  providers: [
    {
      provide: MONITORING_INSTANCE_ID,
      useFactory: () => {
        const resolved = resolveInstanceId();
        if (resolved.source === 'generated') {
          // Silently converts durable history into per-boot history.
          new Logger('MonitoringModule').warn(
            'MONITORING_INSTANCE_ID and HOSTNAME are unset; using a generated id. ' +
              'Samples from previous runs will not appear in the default detail view.',
          );
        }
        return resolved;
      },
    },
    {
      provide: REDIS_MEMORY_HISTORY_STORE,
      inject: [DataSource, MONITORING_INSTANCE_ID],
      useFactory: (dataSource: DataSource, identity: { instanceId: string }) =>
        new TypeOrmRedisMemoryHistoryStore(
          dataSource.getRepository(RedisMemorySampleEntity),
          identity.instanceId,
        ),
    },
    RedisAlertStateRepository,
    RedisAlertService,
    RedisMemorySamplerService,
  ],
  exports: [RedisMemorySamplerService, RedisAlertService],
})
export class MonitoringModule {}