import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { AppService } from './app.service';
import { RedisMemorySamplerService } from './modules/monitoring/redis-memory-sampler.service';

/**
 * AppService talks to Redis through a client it constructs itself in the
 * constructor, so the ioredis module is mocked wholesale. Memory-pressure
 * state comes from the sampler, which is mocked here; `info` must never be
 * called by `getHealth()`.
 */
const redisMock = {
  connect: (jest.fn as unknown as any)(),
  ping: (jest.fn as unknown as any)(),
  info: (jest.fn as unknown as any)(),
  disconnect: (jest.fn as unknown as any)(),
};

jest.mock('ioredis', () => ({
  __esModule: true,
  default: (jest.fn as unknown as any)(() => redisMock),
}));

const samplerMock = {
  getHealthView: (jest.fn as unknown as any)(),
  getDetail: (jest.fn as unknown as any)(),
};

const healthyView = {
  latestSample: {
    at: '2026-08-14T09:12:00.000Z', ok: true, failureReason: null,
    usedBytes: 2_850_000, maxBytes: 268_435_456, utilizationPercent: 1,
    evictedKeys: 0, oomErrors: 0,
  },
  history: {
    bufferStartedAt: '2026-08-14T09:03:00.000Z', sampleCount: 10,
    validSampleCount: 10, capacity: 1_440, latestSampleAt: '2026-08-14T09:12:00.000Z',
  },
  pressure: {
    state: 'healthy', reason: null,
    stateSince: '2026-08-14T09:12:00.000Z', streakSamples: 10,
  },
};

describe('AppService', () => {
  let service: AppService;
  let dataSource: { query: any };

  beforeEach(async () => {
    jest.clearAllMocks();

    redisMock.connect.mockResolvedValue(undefined);
    redisMock.ping.mockResolvedValue('PONG');
    redisMock.disconnect.mockReturnValue(undefined);

    dataSource = { query: (jest.fn as unknown as any)().mockResolvedValue([{ '?column?': 1 }]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppService,
        { provide: getDataSourceToken(), useValue: dataSource as unknown as DataSource },
        { provide: RedisMemorySamplerService, useValue: samplerMock },
      ],
    }).compile();

    service = module.get<AppService>(AppService);
  });

  describe('getHealth — Redis memory pressure state mapping', () => {
    it('reports healthy from a healthy sampler state without sampling itself', async () => {
      samplerMock.getHealthView.mockResolvedValue(healthyView);

      const health = await service.getHealth();

      expect(redisMock.info).not.toHaveBeenCalled();
      expect(health.services.redis.status).toBe('healthy');
      expect(health.services.redis.memory).toEqual({
        usedBytes: 2_850_000,
        maxBytes: 268_435_456,
        utilizationPercent: 1,
      });
      expect(health.services.redis.pressure).toEqual({
        state: 'healthy',
        reason: null,
        sampleCount: 10,
        validSampleCount: 10,
        latestSampleAt: '2026-08-14T09:12:00.000Z',
      });
      expect(health.status).toBe('healthy');
    });

    it.each(['sustained-pressure', 'unknown', 'insufficient-samples'])(
      'reports degraded for pressure state %s without throwing',
      async (state) => {
        samplerMock.getHealthView.mockResolvedValue({
          ...healthyView,
          pressure: {
            state,
            reason: state === 'unknown' ? 'sampling-failed' : null,
            stateSince: '2026-08-14T09:12:00.000Z',
            streakSamples: 0,
          },
        });

        const health = await service.getHealth();

        expect(health.services.redis.status).toBe('degraded');
        expect(health.services.redis.pressure?.state).toBe(state);
        expect(health.status).toBe('degraded');
      },
    );

    it('explains sustained pressure in the message', async () => {
      samplerMock.getHealthView.mockResolvedValue({
        ...healthyView,
        pressure: { state: 'sustained-pressure', reason: null, stateSince: '2026-08-14T09:12:00.000Z', streakSamples: 10 },
      });

      const health = await service.getHealth();

      expect(health.services.redis.message).toContain('sustained');
      expect(health.services.redis.message).toContain('10');
    });

    it('explains insufficient post-restart samples in the message', async () => {
      samplerMock.getHealthView.mockResolvedValue({
        ...healthyView,
        pressure: { state: 'insufficient-samples', reason: null, stateSince: '2026-08-14T09:12:00.000Z', streakSamples: 5 },
      });

      const health = await service.getHealth();

      expect(health.services.redis.message).toContain('insufficient');
      expect(health.services.redis.message).toContain('restart');
    });

    it('drops the memory block when the latest sample failed', async () => {
      samplerMock.getHealthView.mockResolvedValue({
        latestSample: {
          at: '2026-08-14T09:12:00.000Z', ok: false, failureReason: 'timeout',
          usedBytes: null, maxBytes: null, utilizationPercent: null,
          evictedKeys: null, oomErrors: null,
        },
        history: healthyView.history,
        pressure: { state: 'unknown', reason: 'sampling-failed', stateSince: '2026-08-14T09:12:00.000Z', streakSamples: 0 },
      });

      const health = await service.getHealth();

      expect(health.services.redis.status).toBe('degraded');
      expect(health.services.redis.memory).toBeNull();
    });

    it('marks redis unhealthy when the connection fails', async () => {
      redisMock.ping.mockRejectedValue(new Error('ECONNREFUSED'));

      const health = await service.getHealth();

      expect(health.services.redis.status).toBe('unhealthy');
      expect(health.services.redis.message).toContain('ECONNREFUSED');
      expect(health.services.redis.memory).toBeNull();
      expect(health.services.redis.pressure).toBeNull();
      expect(health.status).toBe('unhealthy');
    });

    it('reports degraded — never unhealthy — when the monitoring history read fails', async () => {
      samplerMock.getHealthView.mockRejectedValue(new Error('db down'));

      const health = await service.getHealth();

      // Redis itself answered PING; the failure is monitoring storage.
      expect(health.services.redis.status).toBe('degraded');
      expect(health.services.redis.message).toContain('monitoring history unavailable');
      expect(health.services.redis.memory).toBeNull();
      expect(health.services.redis.pressure).toBeNull();
      expect(health.status).toBe('degraded');
      expect(health.uptime).toBeDefined();
    });

    it('disconnects after a successful check', async () => {
      samplerMock.getHealthView.mockResolvedValue(healthyView);
      await service.getHealth();

      expect(redisMock.disconnect).toHaveBeenCalled();
    });
  });

  describe('getHealth — overall status precedence', () => {
    it('reports unhealthy when the database is down even if redis is degraded', async () => {
      dataSource.query.mockRejectedValue(new Error('connection terminated'));
      samplerMock.getHealthView.mockResolvedValue({
        ...healthyView,
        pressure: { state: 'sustained-pressure', reason: null, stateSince: '2026-08-14T09:12:00.000Z', streakSamples: 10 },
      });

      const health = await service.getHealth();

      expect(health.services.database.status).toBe('unhealthy');
      expect(health.services.redis.status).toBe('degraded');
      // unhealthy outranks degraded.
      expect(health.status).toBe('unhealthy');
    });
  });
});