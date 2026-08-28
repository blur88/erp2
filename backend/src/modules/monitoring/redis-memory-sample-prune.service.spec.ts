import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { RedisMemorySamplePruneService } from './redis-memory-sample-prune.service';
import { REDIS_PRUNE_BATCH_SIZE, REDIS_PRUNE_MAX_BATCHES } from './redis-memory.types';

describe('RedisMemorySamplePruneService', () => {
  const makeService = (affectedPerCall: number[], remaining = 0) => {
    const execute = (jest.fn as unknown as any)();
    affectedPerCall.forEach((affected) => execute.mockResolvedValueOnce({ affected }));
    execute.mockResolvedValue({ affected: 0 });
    const count = (jest.fn as unknown as any)().mockResolvedValue(remaining);
    const dataSource = {
      createQueryBuilder: () => ({
        delete: () => ({ from: () => ({ where: () => ({ execute }) }) }),
      }),
      getRepository: () => ({ count }),
    };
    const logger = { warn: (jest.fn as unknown as any)(), log: (jest.fn as unknown as any)() } as unknown as Logger;
    return {
      service: new RedisMemorySamplePruneService(dataSource as any, logger),
      execute,
      count,
      logger,
    };
  };

  it('stops when a batch deletes zero rows', async () => {
    const { service, execute, count } = makeService([REDIS_PRUNE_BATCH_SIZE, 12, 0]);
    const result = await service.prune();
    expect(result).toEqual({
      deleted: REDIS_PRUNE_BATCH_SIZE + 12,
      remaining: 0,
      hitCeiling: false,
    });
    expect(execute).toHaveBeenCalledTimes(3);
    // Drained naturally — no probe needed.
    expect(count).not.toHaveBeenCalled();
  });

  it('probes and reports the ceiling when expired rows remain', async () => {
    const full = new Array(REDIS_PRUNE_MAX_BATCHES + 5).fill(REDIS_PRUNE_BATCH_SIZE);
    const { service, execute, logger } = makeService(full, 7_500);
    const result = await service.prune();
    expect(execute).toHaveBeenCalledTimes(REDIS_PRUNE_MAX_BATCHES);
    expect(result.hitCeiling).toBe(true);
    expect(result.remaining).toBe(7_500);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('7500'));
  });

  it('does not claim a ceiling when the last full batch exactly drained the table', async () => {
    // Exactly REDIS_PRUNE_MAX_BATCHES full batches, and nothing expired left.
    const full = new Array(REDIS_PRUNE_MAX_BATCHES).fill(REDIS_PRUNE_BATCH_SIZE);
    const { service, logger } = makeService(full, 0);
    const result = await service.prune();
    expect(result.hitCeiling).toBe(false);
    expect(result.remaining).toBe(0);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('returns zero when nothing is old enough', async () => {
    const { service } = makeService([0]);
    await expect(service.prune()).resolves.toEqual({
      deleted: 0, remaining: 0, hitCeiling: false,
    });
  });

  it('never throws when the delete fails', async () => {
    const dataSource = {
      createQueryBuilder: () => ({
        delete: () => ({
          from: () => ({ where: () => ({ execute: (jest.fn as unknown as any)().mockRejectedValue(new Error('db down')) }) }),
        }),
      }),
      getRepository: () => ({ count: (jest.fn as unknown as any)().mockResolvedValue(0) }),
    };
    const logger = { warn: (jest.fn as unknown as any)(), log: (jest.fn as unknown as any)() } as unknown as Logger;
    const service = new RedisMemorySamplePruneService(dataSource as any, logger);
    // remaining is -1 (unknown), never 0: a failed delete is not evidence
    // that the table drained.
    await expect(service.prune()).resolves.toEqual({
      deleted: 0, remaining: -1, hitCeiling: false,
    });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('never throws when the remaining-rows probe fails', async () => {
    const full = new Array(REDIS_PRUNE_MAX_BATCHES).fill(REDIS_PRUNE_BATCH_SIZE);
    const { service, count } = makeService(full);
    count.mockRejectedValue(new Error('probe failed'));
    const result = await service.prune();
    // Unknown remaining is reported as -1, never as a false all-clear.
    expect(result.remaining).toBe(-1);
    expect(result.hitCeiling).toBe(true);
  });
});
