import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';

import { RedisMemorySamplerService } from './modules/monitoring/redis-memory-sampler.service';
import { RedisMemoryDetailQueryDto } from './modules/monitoring/dto/redis-memory-detail-query.dto';
import {
  REDIS_PRESSURE_THRESHOLD_PERCENT,
  REDIS_PRESSURE_WINDOW_SAMPLES,
  RedisMemoryDetail,
  RedisMemoryHealthView,
  RedisPressureState,
  RedisPressureUnknownReason,
} from './modules/monitoring/redis-memory.types';

export interface RedisMemory {
  usedBytes: number;
  /** null when Redis runs uncapped (`maxmemory:0`). */
  maxBytes: number | null;
  /** null when no cap makes utilization undefined. */
  utilizationPercent: number | null;
}

export interface RedisPressureSummary {
  state: RedisPressureState;
  reason: RedisPressureUnknownReason | null;
  sampleCount: number;
  validSampleCount: number;
  latestSampleAt: string | null;
}

@Injectable()
export class AppService implements OnModuleDestroy {
  private redisClient: Redis;

  constructor(
    @InjectDataSource() private dataSource: DataSource,
    private readonly sampler: RedisMemorySamplerService,
  ) {
    // Initialize Redis client for health checks
    this.redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null, // Don't retry for health checks
      lazyConnect: true, // Don't connect immediately
      // ioredis 6 defaults to RESP3 (`protocol: 3`); v5 used RESP2. Pinned to 2
      // so the ioredis 6 upgrade changed only the dependency, not the wire
      // protocol. See the RESP3 note in CLAUDE.md before removing this.
      protocol: 2,
    });
  }

  /**
   * Aggregate health for `/api/health`.
   *
   * The Redis branch keeps its live per-request ping; memory-pressure state
   * comes from the sampler, the single source of truth for sustained
   * pressure. Degraded states intentionally keep HTTP 200 so the container
   * health check (`curl -f`) does not restart an otherwise functional
   * backend.
   */
  async getHealth() {
    const services: {
      backend: { status: string; message: string };
      database: { status: string; message: string };
      redis: {
        status: string;
        message: string;
        memory: RedisMemory | null;
        pressure: RedisPressureSummary | null;
      };
    } = {
      backend: { status: 'healthy', message: 'Backend is running' },
      database: { status: 'unknown', message: 'Not checked' },
      redis: { status: 'unknown', message: 'Not checked', memory: null, pressure: null },
    };

    // Check PostgreSQL connection
    try {
      await this.dataSource.query('SELECT 1');
      services.database = { status: 'healthy', message: 'Database connected' };
    } catch (error) {
      services.database = {
        status: 'unhealthy',
        message: `Database error: ${error.message}`
      };
    }

    // Check Redis connectivity with a live ping, then read the sampler's
    // memory-pressure state.
    try {
      await this.redisClient.connect();
      await this.redisClient.ping();

      let view: RedisMemoryHealthView | null = null;
      try {
        view = await this.sampler.getHealthView();
      } catch {
        // Monitoring storage is unreachable. Redis itself just answered PING,
        // so this is degraded visibility, never a Redis fault.
        view = null;
      }

      if (view === null) {
        services.redis = {
          status: 'degraded',
          message: 'Redis connected — monitoring history unavailable',
          memory: null,
          pressure: null,
        };
      } else {
        const { pressure, history } = view;
        const latest = view.latestSample;
        const memory =
          latest?.ok && latest.usedBytes !== null
            ? {
                usedBytes: latest.usedBytes,
                maxBytes: latest.maxBytes,
                utilizationPercent: latest.utilizationPercent,
              }
            : null;

        const redisStatus: string =
          pressure.state === 'healthy' ? 'healthy' : 'degraded';

        const message = this.redisMessage(pressure, memory);

        services.redis = {
          status: redisStatus,
          message,
          memory,
          pressure: {
            state: pressure.state,
            reason: pressure.reason,
            sampleCount: history.sampleCount,
            validSampleCount: history.validSampleCount,
            latestSampleAt: history.latestSampleAt,
          },
        };
      }

      await this.redisClient.disconnect();
    } catch (error) {
      services.redis = {
        status: 'unhealthy',
        message: `Redis error: ${error.message}`,
        memory: null,
        pressure: null,
      };
      try {
        await this.redisClient.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
    }

    // Determine overall status
    const allHealthy = Object.values(services).every(s => s.status === 'healthy');
    const anyUnhealthy = Object.values(services).some(s => s.status === 'unhealthy');

    return {
      status: allHealthy ? 'healthy' : anyUnhealthy ? 'unhealthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      services,
    };
  }

  /** Administrator-only detail view of the sampler's history and state. */
  async getRedisMemoryDetail(
    query: RedisMemoryDetailQueryDto = {},
  ): Promise<RedisMemoryDetail> {
    return this.sampler.getDetail(query);
  }

  private redisMessage(
    pressure: { state: RedisPressureState; reason: RedisPressureUnknownReason | null },
    memory: RedisMemory | null,
  ): string {
    switch (pressure.state) {
      case 'healthy':
        return memory?.utilizationPercent !== null
          ? `Redis connected — memory ${memory?.utilizationPercent ?? 'n/a'}% of maxmemory`
          : 'Redis connected';
      case 'sustained-pressure':
        return (
          `Redis connected — memory at or above ${REDIS_PRESSURE_THRESHOLD_PERCENT}% ` +
          `for ${REDIS_PRESSURE_WINDOW_SAMPLES} consecutive minutes (sustained pressure)`
        );
      case 'unknown':
        return `Redis connected — memory state unknown: ${pressure.reason ?? 'unknown reason'}`;
      case 'insufficient-samples':
        return 'Redis connected — memory state insufficient-samples: collecting post-restart history';
    }
  }

  getInfo() {
    return {
      name: 'ERP System API',
      version: '1.0.0',
      description: 'A comprehensive ERP system with modular architecture',
      modules: [
        'users',
        'inventory',
        'sales',
      ],
      features: [
        'Multi-level pricing',
        'Stock tracking',
        'Sales order management',
        'Purchase order workflow',
        'Real-time reporting',
        'Plugin system',
        'API documentation',
      ],
    };
  }

  async onModuleDestroy(): Promise<void> {
    try {
      this.redisClient.disconnect();
    } catch (_error) {
      // Ignore redis shutdown errors during application teardown.
    }
  }
}