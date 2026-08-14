import { Logger } from '@nestjs/common';
import { InMemoryRedisMemoryHistoryStore } from './in-memory-redis-memory-history.store';
import { RedisMemoryPressureEvaluator } from './redis-memory-pressure.evaluator';
import { RedisMemorySamplerService } from './redis-memory-sampler.service';
import { REDIS_COMMAND_TIMEOUT_MS } from './redis-memory.types';

const redisMock = {
  status: 'wait',
  connect: jest.fn(),
  ping: jest.fn(),
  info: jest.fn(),
  disconnect: jest.fn(),
};

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn(() => redisMock),
}));

const infoMemory = (used: number, max: number): string =>
  `used_memory:${used}\r\nmaxmemory:${max}\r\n`;

describe('RedisMemorySamplerService', () => {
  let store: InMemoryRedisMemoryHistoryStore;
  let evaluator: RedisMemoryPressureEvaluator;
  let logger: { warn: jest.Mock; error: jest.Mock; log: jest.Mock };
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
    logger = { warn: jest.fn(), error: jest.fn(), log: jest.fn() };
    service = new RedisMemorySamplerService(
      store,
      logger as unknown as Logger,
      evaluator,
    );
  });

  it('samples immediately on module init and cleans up on destroy', async () => {
    await service.onModuleInit();
    expect(redisMock.info).toHaveBeenCalledWith('memory');
    expect(store.stats().sampleCount).toBe(1);
    expect(service.getLatestSample()).toMatchObject({ ok: true });

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
    expect(service.getLatestSample()).toMatchObject({
      ok: true,
      usedBytes: 80,
      maxBytes: 100,
      utilizationPercent: 80,
      evictedKeys: 0,
      oomErrors: null,
    });

    const detail = service.getDetail();
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

    expect(service.getLatestSample()).toMatchObject({
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

    const [inFlight, overlapRecord] = store.recent(2);
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
    redisMock.info.mockImplementationOnce(() => new Promise(() => {})); // never settles

    const pending = service.sampleNow();
    await jest.advanceTimersByTimeAsync(REDIS_COMMAND_TIMEOUT_MS + 1);
    await pending;

    expect(service.getLatestSample()).toMatchObject({
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
    expect(service.getLatestSample()).toMatchObject({
      ok: false,
      failureReason: 'connection-failed',
    });
    expect(JSON.stringify(service.getLatestSample())).not.toContain('ECONNREFUSED');

    redisMock.info.mockRejectedValueOnce(new Error('OOM command not allowed'));
    await service.sampleNow();
    expect(service.getLatestSample()).toMatchObject({
      ok: false,
      failureReason: 'connection-failed',
    });
    expect(JSON.stringify(service.getLatestSample())).not.toContain('OOM command');
  });

  it('marks a sample parse-failed when INFO memory is malformed', async () => {
    await service.onModuleInit();
    redisMock.info.mockImplementation((section: string) =>
      Promise.resolve(
        section === 'memory' ? '# Memory\r\nused_memory:x\r\nmaxmemory:100\r\n' : '# Stats\r\n',
      ),
    );

    await service.sampleNow();
    expect(service.getLatestSample()).toMatchObject({
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

    const detail = service.getDetail();
    expect(detail.counters.evictedKeys.lastDelta).toBe(4);
    expect(detail.counters.oomErrors.lastDelta).toBe(4);
    expect(detail.counters.evictedKeys.available).toBe(true);
    expect(detail.counters.evictedKeys.value).toBe(5);
  });
});
