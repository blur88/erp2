import { TypeOrmRedisMemoryHistoryStore } from './typeorm-redis-memory-history.store';
import { REDIS_DETAIL_MAX_ROWS } from './redis-memory.types';

describe('TypeOrmRedisMemoryHistoryStore', () => {
  const sample = {
    at: '2026-08-14T10:00:00.000Z',
    ok: true,
    failureReason: null,
    usedBytes: 2297720,
    maxBytes: 268435456,
    utilizationPercent: 1,
    evictedKeys: 0,
    oomErrors: 0,
  };

  const makeRepo = () => ({
    insert: jest.fn().mockResolvedValue(undefined),
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn(),
  });

  it('writes the resolved instance id with each sample', async () => {
    const repo = makeRepo();
    const store = new TypeOrmRedisMemoryHistoryStore(repo as any, 'erp_backend');
    await store.append(sample);
    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ instanceId: 'erp_backend', ok: true, usedBytes: 2297720 }),
    );
  });

  it('clamps a limit above the hard cap', async () => {
    const repo = makeRepo();
    const store = new TypeOrmRedisMemoryHistoryStore(repo as any, 'erp_backend');
    await store.recent({ limit: 99_999 });
    expect(repo.find).toHaveBeenCalledWith(
      expect.objectContaining({ take: REDIS_DETAIL_MAX_ROWS }),
    );
  });

  it('scopes to the current instance by default', async () => {
    const repo = makeRepo();
    const store = new TypeOrmRedisMemoryHistoryStore(repo as any, 'erp_backend');
    await store.recent();
    const call = repo.find.mock.calls[0][0];
    expect(call.where.instanceId).toBe('erp_backend');
  });

  it('drops the instance filter when allInstances wins over instanceId', async () => {
    const repo = makeRepo();
    const store = new TypeOrmRedisMemoryHistoryStore(repo as any, 'erp_backend');
    await store.recent({ allInstances: true, instanceId: 'other' });
    const call = repo.find.mock.calls[0][0];
    expect(call.where.instanceId).toBeUndefined();
  });

  it('reads a specific prior instance when asked', async () => {
    const repo = makeRepo();
    const store = new TypeOrmRedisMemoryHistoryStore(repo as any, 'erp_backend');
    await store.recent({ instanceId: 'old-container' });
    const call = repo.find.mock.calls[0][0];
    expect(call.where.instanceId).toBe('old-container');
  });
});