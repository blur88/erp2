import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';

/**
 * Redis utilization at or above which the health check reports `degraded`.
 *
 * 80% leaves headroom to react before `noeviction` turns memory pressure into
 * hard `OOM command not allowed` write failures (issue #1036). At the measured
 * baseline (~2.8MB of 256MiB, ~1%) this threshold is dormant by design — it is
 * a floor for future growth, not an expected-to-fire signal.
 */
const REDIS_MEMORY_DEGRADED_PERCENT = 80;

export interface RedisMemory {
  usedBytes: number;
  /** null when Redis runs uncapped (`maxmemory:0`). */
  maxBytes: number | null;
  /** null when no cap makes utilization undefined. */
  utilizationPercent: number | null;
}

@Injectable()
export class AppService implements OnModuleDestroy {
  private redisClient: Redis;

  constructor(
    @InjectDataSource() private dataSource: DataSource,
  ) {
    // Initialize Redis client for health checks
    this.redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null, // Don't retry for health checks
      lazyConnect: true, // Don't connect immediately
    });
  }

  /**
   * Parse `used_memory` / `maxmemory` out of an `INFO memory` payload.
   *
   * Returns null when the fields are absent or unparseable. A parse gap is
   * missing visibility, not evidence of pressure, so callers keep reporting
   * healthy rather than false-alarming on an unexpected INFO shape.
   */
  private parseRedisMemory(info: unknown): RedisMemory | null {
    if (typeof info !== 'string') {
      return null;
    }

    const readField = (field: string): number | null => {
      const match = info.match(new RegExp(`^${field}:(\\d+)`, 'm'));
      if (!match) {
        return null;
      }
      const value = Number(match[1]);
      return Number.isFinite(value) ? value : null;
    };

    const usedBytes = readField('used_memory');
    const maxMemory = readField('maxmemory');

    if (usedBytes === null || maxMemory === null) {
      return null;
    }

    // `maxmemory:0` means uncapped — utilization is undefined, not zero.
    if (maxMemory === 0) {
      return { usedBytes, maxBytes: null, utilizationPercent: null };
    }

    return {
      usedBytes,
      maxBytes: maxMemory,
      utilizationPercent: Math.round((usedBytes / maxMemory) * 100),
    };
  }

  /**
   * Aggregate health for `/api/health`.
   *
   * The Redis branch carries an interim memory-pressure signal (issue #1036):
   * it surfaces utilization for visibility only. It notifies no one and is not
   * alerting — it becomes an operational guard only if something polls or
   * displays this endpoint. Real monitoring (collection, storage, alert
   * routing, dashboards) is tracked separately.
   *
   * Degraded states intentionally keep HTTP 200 so the container health check
   * (`curl -f`) does not restart an otherwise functional backend.
   */
  async getHealth() {
    const services: {
      backend: { status: string; message: string };
      database: { status: string; message: string };
      redis: { status: string; message: string; memory: RedisMemory | null };
    } = {
      backend: { status: 'healthy', message: 'Backend is running' },
      database: { status: 'unknown', message: 'Not checked' },
      redis: { status: 'unknown', message: 'Not checked', memory: null },
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

    // Check Redis connection, then sample memory utilization for visibility.
    try {
      await this.redisClient.connect();
      await this.redisClient.ping();

      const memory = this.parseRedisMemory(await this.redisClient.info('memory'));
      const utilization = memory?.utilizationPercent ?? null;
      const underPressure =
        utilization !== null && utilization >= REDIS_MEMORY_DEGRADED_PERCENT;

      services.redis = {
        status: underPressure ? 'degraded' : 'healthy',
        message: underPressure
          ? `Redis connected — memory ${utilization}% of maxmemory (>= ${REDIS_MEMORY_DEGRADED_PERCENT}% threshold)`
          : utilization !== null
            ? `Redis connected — memory ${utilization}% of maxmemory`
            : 'Redis connected',
        memory,
      };

      await this.redisClient.disconnect();
    } catch (error) {
      services.redis = {
        status: 'unhealthy',
        message: `Redis error: ${error.message}`,
        memory: null,
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
