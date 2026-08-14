import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserRole } from '@/database/entities/user.entity';
import { RedisMemoryDetail } from './modules/monitoring/redis-memory.types';

const detail = {
  latestSample: null,
  history: {
    bufferStartedAt: null,
    sampleCount: 0,
    validSampleCount: 0,
    capacity: 1_440,
    latestSampleAt: null,
  },
  pressure: {
    state: 'insufficient-samples',
    reason: null,
    stateSince: '2026-08-14T09:12:00.000Z',
    streakSamples: 0,
  },
  samples: [],
  configuration: {
    intervalMs: 60_000,
    capacity: 1_440,
    windowSamples: 10,
    thresholdPercent: 80,
    commandTimeoutMs: 5_000,
    staleAfterMs: 180_000,
  },
  counters: {
    oomErrors: { available: false, value: null, lastDelta: 0, lastChangedAt: null },
    evictedKeys: { available: false, value: null, lastDelta: 0, lastChangedAt: null },
  },
} satisfies RedisMemoryDetail;

describe('AppController', () => {
  let controller: AppController;
  const appService = {
    getHealth: jest.fn(),
    getInfo: jest.fn(),
    getRedisMemoryDetail: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AppController(appService as unknown as AppService);
  });

  it('delegates Redis memory detail to AppService', async () => {
    appService.getRedisMemoryDetail.mockReturnValue(detail);
    await expect(controller.getRedisMemoryDetail()).resolves.toBe(detail);
  });

  it('restricts Redis memory detail to administrators', () => {
    const roles = Reflect.getMetadata('roles', AppController.prototype.getRedisMemoryDetail);
    expect(roles).toEqual([UserRole.ADMIN]);
  });

  it('does not mark Redis memory detail public', () => {
    const isPublic = Reflect.getMetadata('isPublic', AppController.prototype.getRedisMemoryDetail);
    expect(isPublic).not.toBe(true);
  });
});