import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { AppService } from './app.service';

/**
 * AppService talks to Redis through a client it constructs itself in the
 * constructor, so the ioredis module is mocked wholesale. Each test drives the
 * shared mock instance's `info` / `ping` behaviour.
 */
const redisMock = {
  connect: jest.fn(),
  ping: jest.fn(),
  info: jest.fn(),
  disconnect: jest.fn(),
};

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn(() => redisMock),
}));

/** Build a realistic `INFO memory` payload with the fields AppService parses. */
const infoMemory = (usedMemory: number, maxMemory: number): string =>
  [
    '# Memory',
    `used_memory:${usedMemory}`,
    `used_memory_human:${(usedMemory / 1024 / 1024).toFixed(2)}M`,
    `maxmemory:${maxMemory}`,
    `maxmemory_policy:noeviction`,
    'mem_fragmentation_ratio:1.20',
    '',
  ].join('\r\n');

const MAX_256_MIB = 268435456;

describe('AppService', () => {
  let service: AppService;
  let dataSource: { query: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    redisMock.connect.mockResolvedValue(undefined);
    redisMock.ping.mockResolvedValue('PONG');
    redisMock.disconnect.mockReturnValue(undefined);
    redisMock.info.mockResolvedValue(infoMemory(2_850_000, MAX_256_MIB));

    dataSource = { query: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppService,
        { provide: getDataSourceToken(), useValue: dataSource as unknown as DataSource },
      ],
    }).compile();

    service = module.get<AppService>(AppService);
  });

  describe('getHealth — Redis memory pressure signal', () => {
    it('reports healthy with utilization well below the threshold', async () => {
      // ~2.85MB of 256MiB is ~1%, matching the measured local baseline.
      const health = await service.getHealth();

      expect(health.services.redis.status).toBe('healthy');
      expect(health.services.redis.memory).toEqual({
        usedBytes: 2_850_000,
        maxBytes: MAX_256_MIB,
        utilizationPercent: 1,
      });
      expect(health.status).toBe('healthy');
    });

    it('marks redis and overall status degraded at or above 80% utilization', async () => {
      redisMock.info.mockResolvedValue(infoMemory(Math.round(MAX_256_MIB * 0.85), MAX_256_MIB));

      const health = await service.getHealth();

      expect(health.services.redis.status).toBe('degraded');
      expect(health.services.redis.memory?.utilizationPercent).toBe(85);
      expect(health.services.redis.message).toContain('85%');
      // The overall `degraded` branch becomes reachable for the first time.
      expect(health.status).toBe('degraded');
    });

    it('treats exactly 80% as degraded (boundary is inclusive)', async () => {
      redisMock.info.mockResolvedValue(infoMemory(MAX_256_MIB * 0.8, MAX_256_MIB));

      const health = await service.getHealth();

      expect(health.services.redis.status).toBe('degraded');
      expect(health.services.redis.memory?.utilizationPercent).toBe(80);
    });

    it('stays healthy just below the threshold', async () => {
      redisMock.info.mockResolvedValue(infoMemory(Math.round(MAX_256_MIB * 0.79), MAX_256_MIB));

      const health = await service.getHealth();

      expect(health.services.redis.status).toBe('healthy');
      expect(health.status).toBe('healthy');
    });

    it('reports healthy with null utilization when maxmemory is unlimited (0)', async () => {
      // maxmemory:0 means no cap — utilization is not computable, and the
      // absence of a cap is not evidence of memory pressure.
      redisMock.info.mockResolvedValue(infoMemory(2_850_000, 0));

      const health = await service.getHealth();

      expect(health.services.redis.status).toBe('healthy');
      expect(health.services.redis.memory).toEqual({
        usedBytes: 2_850_000,
        maxBytes: null,
        utilizationPercent: null,
      });
      expect(health.status).toBe('healthy');
    });

    it('stays healthy with a null memory block when INFO output is malformed', async () => {
      // A parse gap is missing visibility, not evidence of pressure; degrading
      // here would false-alarm on any INFO shape change.
      redisMock.info.mockResolvedValue('# Memory\r\ngarbage-without-fields\r\n');

      const health = await service.getHealth();

      expect(health.services.redis.status).toBe('healthy');
      expect(health.services.redis.memory).toBeNull();
      expect(health.status).toBe('healthy');
    });

    it('stays healthy with a null memory block when INFO returns a non-string', async () => {
      redisMock.info.mockResolvedValue(undefined);

      const health = await service.getHealth();

      expect(health.services.redis.status).toBe('healthy');
      expect(health.services.redis.memory).toBeNull();
    });

    it('marks redis unhealthy when the connection fails', async () => {
      redisMock.connect.mockRejectedValue(new Error('ECONNREFUSED'));

      const health = await service.getHealth();

      expect(health.services.redis.status).toBe('unhealthy');
      expect(health.services.redis.message).toContain('ECONNREFUSED');
      expect(health.services.redis.memory).toBeNull();
      expect(health.status).toBe('unhealthy');
    });

    it('marks redis unhealthy when INFO itself fails', async () => {
      redisMock.info.mockRejectedValue(new Error('OOM command not allowed'));

      const health = await service.getHealth();

      expect(health.services.redis.status).toBe('unhealthy');
      expect(health.services.redis.message).toContain('OOM command not allowed');
    });

    it('disconnects after a successful check', async () => {
      await service.getHealth();

      expect(redisMock.disconnect).toHaveBeenCalled();
    });
  });

  describe('getHealth — overall status precedence', () => {
    it('reports unhealthy when the database is down even if redis is degraded', async () => {
      dataSource.query.mockRejectedValue(new Error('connection terminated'));
      redisMock.info.mockResolvedValue(infoMemory(Math.round(MAX_256_MIB * 0.9), MAX_256_MIB));

      const health = await service.getHealth();

      expect(health.services.database.status).toBe('unhealthy');
      expect(health.services.redis.status).toBe('degraded');
      // unhealthy outranks degraded.
      expect(health.status).toBe('unhealthy');
    });
  });
});
