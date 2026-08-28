import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { InMemoryRedisMemoryHistoryStore } from './in-memory-redis-memory-history.store';
import { RedisMemoryPressureEvaluator } from './redis-memory-pressure.evaluator';
import { RedisMemorySamplerService } from './redis-memory-sampler.service';
import type { SampleQuery } from './redis-memory-history.store';
import { REDIS_COMMAND_TIMEOUT_MS, RedisMemorySample } from './redis-memory.types';

const redisMock = {
  status: 'wait',
  connect: (jest.fn as unknown as any)(),
  ping: (jest.fn as unknown as any)(),
  info: (jest.fn as unknown as any)(),
  disconnect: (jest.fn as unknown as any)(),
};

jest.mock('ioredis', () => ({
  __esModule: true,
  default: (jest.fn as unknown as any)(() => redisMock),
}));

const infoMemory = (used: number, max: number): string =>
  `used_memory:${used}\r\nmaxmemory:${max}\r\n`;

describe('RedisMemorySamplerService', () => {
  let store: InMemoryRedisMemoryHistoryStore;
  let evaluator: RedisMemoryPressureEvaluator;
  let logger: { warn: any; error: any; log: any };
  let service: RedisMemorySamplerService;

  beforeEach(() => {
    jest.clearAllMocks();
    redisMock.status = 'wait';
    redisMock.connect.mockResolvedValue(undefined);
    redisMock.ping.mockResolvedValue('PONG');
    redisMock.disconnect.mockReturnValue(undefined);
    redisMock.info.mockResolvedValue(infoMemory(2_850_000, 268_435_456));

    store = new InMemoryRedisMemoryHistoryStore();
    evaluator = new RedisMemoryPressureEvaluator();
    logger = { warn: (jest.fn as unknown as any)(), error: (jest.fn as unknown as any)(), log: (jest.fn as unknown as any)() };
    service = new RedisMemorySamplerService(
      store,
      logger as unknown as Logger,
      evaluator,
      undefined,
      { instanceId: 'erp_backend', source: 'configured' },
    );
  });

  it('samples immediately on module init and cleans up on destroy', async () => {
    await service.onModuleInit();
    expect(redisMock.info).toHaveBeenCalledWith('memory');
    expect((await store.stats()).sampleCount).toBe(1);
    expect(await service.getLatestSample()).toMatchObject({ ok: true });

    await service.onModuleDestroy();
    expect(redisMock.disconnect).toHaveBeenCalled();
  });

  it('records a valid memory sample with partial counter availability', async () => {
    await service.onModuleInit();
    redisMock.info.mockImplementation((section: string) => {
      if (section === 'memory') return Promise.resolve('used_memory:80\r\nmaxmemory:100\r\n');
      if (section === 'stats') return Promise.resolve('# Stats\r\nevicted_keys:0\r\n');
      return Promise.resolve('# Stats\r\n');
    });

    await service.sampleNow();
    expect(await service.getLatestSample()).toMatchObject({
      ok: true,
      usedBytes: 80,
      maxBytes: 100,
      utilizationPercent: 80,
      evictedKeys: 0,
      oomErrors: null,
    });

    const detail = await service.getDetail();
    // Parsed zero is distinguishable from an unavailable counter.
    expect(detail.counters.evictedKeys).toEqual({
      available: true,
      value: 0,
      lastDelta: 0,
      lastChangedAt: null,
    });
    expect(detail.counters.oomErrors).toEqual({
      available: false,
      value: null,
      lastDelta: 0,
      lastChangedAt: null,
    });
  });

  it('keeps a valid memory sample when a counter read times out', async () => {
    await service.onModuleInit();
    jest.useFakeTimers();
    redisMock.info.mockImplementation((section: string) => {
      if (section === 'memory') return Promise.resolve('used_memory:80\r\nmaxmemory:100\r\n');
      if (section === 'stats') return new Promise(() => {});
      return Promise.resolve('# Errorstats\r\nerrorstat_ERR:count=2\r\n');
    });

    const pending = service.sampleNow();
    await jest.advanceTimersByTimeAsync(REDIS_COMMAND_TIMEOUT_MS + 1);
    await pending;

    expect(await service.getLatestSample()).toMatchObject({
      ok: true,
      usedBytes: 80,
      evictedKeys: null,
      oomErrors: 0,
    });
    jest.useRealTimers();
  });

  it('appends an overlap-skipped record only after the in-flight sample settles', async () => {
    await service.onModuleInit();
    redisMock.info.mockImplementation((section: string) => {
      if (section === 'memory') return Promise.resolve('used_memory:80\r\nmaxmemory:100\r\n');
      if (section === 'stats') return Promise.resolve('# Stats\r\nevicted_keys:0\r\n');
      return Promise.resolve('# Stats\r\n');
    });
    await service.sampleNow();

    let releaseFirst: () => void;
    redisMock.info.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseFirst = () => resolve('used_memory:10\r\nmaxmemory:100\r\n');
        }),
    );
    const first = service.sampleNow();
    const skipped = service.sampleNow(); // suppressed by the in-flight guard
    // The in-flight invocation must first pass its connect/ping microtasks
    // and reach the INFO call, whose promise executor assigns releaseFirst.
    await new Promise<void>((resolve) => setImmediate(resolve));
    releaseFirst!();
    await Promise.all([first, skipped]);

    const [inFlight, overlapRecord] = await store.recent(2);
    expect(inFlight).toMatchObject({ ok: true });
    expect(overlapRecord).toMatchObject({
      ok: false,
      failureReason: 'overlap-skipped',
    });
    expect(Date.parse(overlapRecord.at)).toBeGreaterThanOrEqual(Date.parse(inFlight.at));
  });

  it('records a timeout sample when INFO hangs', async () => {
    await service.onModuleInit();
    jest.useFakeTimers();
    redisMock.info.mockImplementation((section: string) =>
      section === 'memory' ? new Promise(() => {}) : Promise.resolve('used_memory:10\r\nmaxmemory:100\r\n'),
    ); // memory never settles

    const pending = service.sampleNow();
    await jest.advanceTimersByTimeAsync(REDIS_COMMAND_TIMEOUT_MS + 1);
    await pending;

    expect(await service.getLatestSample()).toMatchObject({
      ok: false,
      failureReason: 'timeout',
      usedBytes: null,
    });
    jest.useRealTimers();
  });

  it('maps connection failures to bounded reasons and never leaks raw errors', async () => {
    await service.onModuleInit();

    redisMock.ping.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await service.sampleNow();
    expect(await service.getLatestSample()).toMatchObject({
      ok: false,
      failureReason: 'connection-failed',
    });
    expect(JSON.stringify(await service.getLatestSample())).not.toContain('ECONNREFUSED');

    redisMock.info.mockImplementation((section: string) =>
      section === 'memory'
        ? Promise.reject(new Error('OOM command not allowed'))
        : Promise.resolve('used_memory:10\r\nmaxmemory:100\r\n'),
    );
    await service.sampleNow();
    expect(await service.getLatestSample()).toMatchObject({
      ok: false,
      failureReason: 'connection-failed',
    });
    expect(JSON.stringify(await service.getLatestSample())).not.toContain('OOM command');
  });

  it('marks a sample parse-failed when INFO memory is malformed', async () => {
    await service.onModuleInit();
    redisMock.info.mockImplementation((section: string) =>
      Promise.resolve(
        section === 'memory' ? '# Memory\r\nused_memory:x\r\nmaxmemory:100\r\n' : '# Stats\r\n',
      ),
    );

    await service.sampleNow();
    expect(await service.getLatestSample()).toMatchObject({
      ok: false,
      failureReason: 'parse-failed',
    });
  });

  it('warns once per state transition, not per sample', async () => {
    await service.onModuleInit();
    redisMock.info.mockImplementation((section: string) => {
      if (section === 'memory') return Promise.resolve('used_memory:90\r\nmaxmemory:100\r\n');
      if (section === 'stats') return Promise.resolve('# Stats\r\nevicted_keys:0\r\n');
      return Promise.resolve('# Stats\r\n');
    });

    for (let i = 0; i < 10; i++) {
      await service.sampleNow();
    }
    expect(logger.warn).toHaveBeenCalledTimes(1);
    redisMock.info.mockImplementation((section: string) => {
      if (section === 'memory') return Promise.resolve('used_memory:20\r\nmaxmemory:100\r\n');
      if (section === 'stats') return Promise.resolve('# Stats\r\nevicted_keys:0\r\n');
      return Promise.resolve('# Stats\r\n');
    });
    for (let i = 0; i < 10; i++) {
      await service.sampleNow();
    }
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it('baselines counters silently, warns per positive delta, and rebaselines decreases', async () => {
    await service.onModuleInit();
    let evicted = 0;
    let oom = 0;
    redisMock.info.mockImplementation((section: string) => {
      if (section === 'memory') return Promise.resolve('used_memory:20\r\nmaxmemory:100\r\n');
      if (section === 'stats') return Promise.resolve(`# Stats\r\nevicted_keys:${evicted}\r\n`);
      return Promise.resolve(`# Errorstats\r\nerrorstat_OOM:count=${oom}\r\n`);
    });

    await service.sampleNow(); // first observation baselines silently
    expect(logger.warn).toHaveBeenCalledTimes(0);

    evicted = 3;
    oom = 2;
    await service.sampleNow(); // +3 evicted, +2 oom
    expect(logger.warn).toHaveBeenCalledTimes(2);

    await service.sampleNow(); // unchanged counters produce no warnings
    expect(logger.warn).toHaveBeenCalledTimes(2);

    evicted = 1;
    oom = 0;
    await service.sampleNow(); // decreases re-baseline silently
    expect(logger.warn).toHaveBeenCalledTimes(2);

    evicted = 5;
    oom = 4;
    await service.sampleNow(); // +4 evicted, +4 oom
    expect(logger.warn).toHaveBeenCalledTimes(4);

    const detail = await service.getDetail();
    expect(detail.counters.evictedKeys.lastDelta).toBe(4);
    expect(detail.counters.oomErrors.lastDelta).toBe(4);
    expect(detail.counters.evictedKeys.available).toBe(true);
    expect(detail.counters.evictedKeys.value).toBe(5);
  });

  const sampleFixture: RedisMemorySample = {
    at: '2026-08-14T10:00:00.000Z',
    ok: true,
    failureReason: null,
    usedBytes: 1_000,
    maxBytes: 2_000,
    utilizationPercent: 50,
    evictedKeys: 0,
    oomErrors: 0,
  };
  const otherInstanceSample: RedisMemorySample = {
    ...sampleFixture,
    at: '2026-08-14T10:01:00.000Z',
    instanceId: 'other-instance',
  };

  it('reports truncation when more rows match than are returned', async () => {
    store.recent = (jest.fn as unknown as any)().mockResolvedValue([sampleFixture]);
    store.countMatching = (jest.fn as unknown as any)().mockResolvedValue(4200);
    const detail = await service.getDetail({});
    expect(detail.truncated).toBe(true);
    expect(detail.totalMatching).toBe(4200);
  });

  it('reports no truncation when the window fits', async () => {
    store.recent = (jest.fn as unknown as any)().mockResolvedValue([sampleFixture]);
    store.countMatching = (jest.fn as unknown as any)().mockResolvedValue(1);
    const detail = await service.getDetail({});
    expect(detail.truncated).toBe(false);
  });

  it('echoes allInstances precedence over instanceId', async () => {
    const detail = await service.getDetail({ allInstances: true, instanceId: 'other' });
    expect(detail.appliedInstanceFilter).toBe('all');
  });

  it('degrades to historyAvailable false when the store throws', async () => {
    store.recent = (jest.fn as unknown as any)().mockRejectedValue(new Error('db down'));
    const detail = await service.getDetail({});
    expect(detail.historyAvailable).toBe(false);
    expect(detail.samples).toEqual([]);
    // Configuration is still present so an operator can see the resolved id.
    expect(detail.configuration.instanceId).toBe('erp_backend');
  });

  it('keeps latestSample scoped to the current instance under allInstances', async () => {
    // latestSample feeds the health view; widening the query must not change
    // which instance's reading /health reports.
    store.recent = (jest.fn as unknown as any)()
      .mockImplementation(async (q: SampleQuery | number | undefined) =>
        typeof q === 'object' && q?.allInstances ? [otherInstanceSample] : [sampleFixture],
      );
    const detail = await service.getDetail({ allInstances: true });
    expect(detail.samples).toEqual([otherInstanceSample]);
    expect(detail.latestSample).toEqual(sampleFixture);
  });

  describe('getDetail windowStats', () => {
    it('passes the same filter to the aggregate as to the sample read', async () => {
      store.windowStats = (jest.fn as unknown as any)().mockResolvedValue({ from: null, to: null, perInstance: [] });
      const from = new Date('2026-08-01T00:00:00.000Z');
      const to = new Date('2026-08-08T00:00:00.000Z');

      await service.getDetail({ from, to, instanceId: 'erp_backend', limit: 10 });

      expect(store.windowStats).toHaveBeenCalledWith(
        expect.objectContaining({ from, to, instanceId: 'erp_backend' }),
      );
    });

    it('includes windowStats in the response', async () => {
      store.windowStats = (jest.fn as unknown as any)().mockResolvedValue({
        from: null,
        to: null,
        perInstance: [
          {
            instanceId: 'erp_backend',
            sampleCount: 1440,
            validSampleCount: 1440,
            peakUsedBytes: 2_800_000,
            peakUtilizationPercent: 1.04,
            firstSampleAt: '2026-08-01T00:00:00.000Z',
            lastSampleAt: '2026-08-02T00:00:00.000Z',
            distinctMaxBytes: [268435456],
            evictedKeys: { delta: 0, resetObserved: false },
            oomErrors: { delta: 0, resetObserved: false },
          },
        ],
      });

      const detail = await service.getDetail({});

      expect(detail.windowStats.perInstance[0].peakUsedBytes).toBe(2_800_000);
    });

    it('still returns a windowStats shape when the aggregate read fails', async () => {
      store.windowStats = (jest.fn as unknown as any)().mockRejectedValue(new Error('db down'));

      const detail = await service.getDetail({});

      expect(detail.windowStats).toEqual({ from: null, to: null, perInstance: [] });
    });
  });
});

describe('RedisMemorySamplerService alert wiring', () => {
  let store: InMemoryRedisMemoryHistoryStore;
  let evaluator: RedisMemoryPressureEvaluator;
  let logger: { warn: any; error: any; log: any };
  let alerts: { applySample: any };
  let service: RedisMemorySamplerService;

  const infoWithOom = (used: number, max: number, oom: number): string =>
    `used_memory:${used}\r\nmaxmemory:${max}\r\n`;

  beforeEach(() => {
    jest.clearAllMocks();
    redisMock.status = 'wait';
    redisMock.connect.mockResolvedValue(undefined);
    redisMock.ping.mockResolvedValue('PONG');
    redisMock.disconnect.mockReturnValue(undefined);
    redisMock.info.mockImplementation((section: string) => {
      if (section === 'server') return Promise.resolve('# Server\r\nrun_id:abc123\r\n');
      return Promise.resolve(infoWithOom(100, 1000, 0));
    });

    store = new InMemoryRedisMemoryHistoryStore();
    evaluator = new RedisMemoryPressureEvaluator();
    logger = { warn: (jest.fn as unknown as any)(), error: (jest.fn as unknown as any)(), log: (jest.fn as unknown as any)() };
    alerts = { applySample: (jest.fn as unknown as any)().mockResolvedValue(undefined) };
    service = new RedisMemorySamplerService(
      store,
      logger as unknown as Logger,
      evaluator,
      alerts as any,
    );
  });

  const mockInfo = (used: number, max: number, oom: number | null) => {
    redisMock.info.mockImplementation((section: string) => {
      if (section === 'server') return Promise.resolve('# Server\r\nrun_id:abc123\r\n');
      if (section === 'memory') return Promise.resolve(infoWithOom(used, max, 0));
      if (section === 'stats') return Promise.resolve('evicted_keys:0\r\n');
      if (section === 'errorstats') {
        return Promise.resolve(
          oom === null ? '' : `# Errorstats\r\nerrorstat_OOM:count=${oom}\r\n`,
        );
      }
      return Promise.resolve('');
    });
  };

  it('passes the raw counter and pressure state to a single applySample call', async () => {
    mockInfo(100, 1000, 4);
    await service.sampleNow();
    expect(alerts.applySample).toHaveBeenCalledTimes(1);
    const [input, runId] = alerts.applySample.mock.calls[0];
    expect(input.rawOomCounter).toBe(4);
    expect(input.pressure.utilizationPercent).toBe(10);
    expect(runId).toBe('abc123');
  });

  it('passes a null counter when the OOM read failed', async () => {
    mockInfo(100, 1000, null);
    await service.sampleNow();
    const [input] = alerts.applySample.mock.calls[0];
    expect(input.rawOomCounter).toBeNull();
  });

  it('passes the retained runId after an identity read failure', async () => {
    mockInfo(100, 1000, 4);
    await service.sampleNow();
    redisMock.info.mockImplementation((section: string) => {
      if (section === 'server') return Promise.reject(new Error('down'));
      if (section === 'memory') return Promise.resolve(infoWithOom(100, 1000, 0));
      return Promise.resolve('');
    });
    await service.sampleNow();
    const [input, runId] = alerts.applySample.mock.calls[1];
    // No errorstats section in the fallback payload, so the counter read
    // yields null.
    expect(input.rawOomCounter).toBeNull();
    // Identity is INVALID (diagnostic only) — applySample must be skipped
    // because the sampler reports runId: null.
    expect(runId).toBeNull();
  });

  it('invalidates identity when the connection fails after a recent success', async () => {
    redisMock.info.mockResolvedValue('# Server\r\nrun_id:abc123\r\n');
    await service.sampleNow();
    expect(service.getIdentity().runId).toBe('abc123');

    redisMock.ping.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await service.sampleNow();

    // A still-fresh previous success must not keep serving a row the write
    // path has stopped maintaining.
    expect(service.getIdentity()).toEqual({
      runId: null,
      reason: 'redis-identity-unknown',
    });
  });

  it('never lets a failed persist escape a sample', async () => {
    store.append = (jest.fn as unknown as any)().mockRejectedValue(new Error('db down'));
    await expect(service.sampleNow()).resolves.toBeUndefined();
  });
});
