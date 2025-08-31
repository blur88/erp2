import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullOptionsFactory, BullModuleOptions } from '@nestjs/bull';

@Injectable()
export class RedisConfig implements BullOptionsFactory {
  constructor(private configService: ConfigService) {}

  createBullOptions(): BullModuleOptions {
    return {
      redis: {
        host: this.configService.get('REDIS_HOST', 'localhost'),
        port: this.configService.get('REDIS_PORT', 6379),
        password: this.configService.get('REDIS_PASSWORD'),
        family: 4, // Force IPv4
        retryDelayOnFailover: 100,
        enableReadyCheck: false,
        lazyConnect: true,
        maxRetriesPerRequest: 3,
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    };
  }
}