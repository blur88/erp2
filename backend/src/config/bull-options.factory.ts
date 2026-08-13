import { ConfigModule, ConfigService } from '@nestjs/config';
import { SharedBullAsyncConfiguration } from '@nestjs/bullmq';

/**
 * Single source of Redis connection options for BullMQ.
 *
 * Shared by AppModule and the reconcile-schedulers CLI module deliberately: if
 * the CLI connected to a different Redis than the server, it would scan an
 * empty queue, report zero orphans, and read as success.
 */
export const createBullOptions = (): SharedBullAsyncConfiguration => ({
  imports: [ConfigModule],
  useFactory: (configService: ConfigService) => ({
    connection: {
      host: configService.get<string>('REDIS_HOST', 'redis'),
      port: parseInt(configService.get<string>('REDIS_PORT', '6379')),
      password: configService.get<string>('REDIS_PASSWORD'),
    },
  }),
  inject: [ConfigService],
});