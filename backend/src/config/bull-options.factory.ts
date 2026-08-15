import { ConfigModule, ConfigService } from '@nestjs/config';
import { SharedBullAsyncConfiguration } from '@nestjs/bullmq';

/**
 * Single source of Redis connection options for BullMQ.
 *
 * Shared by AppModule and the reconcile-schedulers CLI module deliberately: if
 * the CLI connected to a different Redis than the server, it would scan an
 * empty queue, report zero orphans, and read as success.
 *
 * `protocol: 2` pins RESP2. ioredis 6 defaults to RESP3 (`protocol: 3`) where
 * v5 used RESP2; BullMQ 6.1.1 declares `ioredis: >=5.0.0` but pins 5.11.1 as its
 * devDependency, so RESP3 is not a tested configuration for it. BullMQ derives
 * its blocking and QueueEvents connections from these options via `duplicate()`,
 * so pinning here covers every queue connection. Removing this adopts RESP3 for
 * the whole queue layer — treat that as its own change, not a cleanup.
 */
export const createBullOptions = (): SharedBullAsyncConfiguration => ({
  imports: [ConfigModule],
  useFactory: (configService: ConfigService) => ({
    connection: {
      host: configService.get<string>('REDIS_HOST', 'redis'),
      port: parseInt(configService.get<string>('REDIS_PORT', '6379')),
      password: configService.get<string>('REDIS_PASSWORD'),
      protocol: 2 as const,
    },
  }),
  inject: [ConfigService],
});