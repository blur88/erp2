import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { SearchScheduler } from './search.scheduler';

describe('SearchScheduler', () => {
  let scheduler: SearchScheduler;
  let mockQueryRunner: {
    connect: any;
    startTransaction: any;
    commitTransaction: any;
    rollbackTransaction: any;
    release: any;
    query: any;
  };
  let mockDataSource: { createQueryRunner: any };

  beforeEach(async () => {
    mockQueryRunner = {
      connect: (jest.fn as unknown as any)().mockResolvedValue(undefined),
      startTransaction: (jest.fn as unknown as any)().mockResolvedValue(undefined),
      commitTransaction: (jest.fn as unknown as any)().mockResolvedValue(undefined),
      rollbackTransaction: (jest.fn as unknown as any)().mockResolvedValue(undefined),
      release: (jest.fn as unknown as any)().mockResolvedValue(undefined),
      query: (jest.fn as unknown as any)().mockResolvedValue([{ id: 'row-1' }, { id: 'row-2' }]),
    };
    mockDataSource = {
      createQueryRunner: (jest.fn as unknown as any)().mockReturnValue(mockQueryRunner),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchScheduler,
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    scheduler = module.get(SearchScheduler);
  });

  it('deletes clicks before queries in one transaction', async () => {
    await scheduler.handleRetentionCleanup();

    expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
    expect(mockQueryRunner.query).toHaveBeenCalledTimes(2);

    const [firstCall, secondCall] = mockQueryRunner.query.mock.calls;
    expect(firstCall[0]).toContain('search_clicks');
    expect(secondCall[0]).toContain('search_queries');

    expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    expect(mockQueryRunner.release).toHaveBeenCalled();
  });

  it('rolls back and does not rethrow on error', async () => {
    mockQueryRunner.query.mockRejectedValueOnce(new Error('db error'));

    await expect(scheduler.handleRetentionCleanup()).resolves.not.toThrow();
    expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(mockQueryRunner.release).toHaveBeenCalled();
  });

  it('always releases the query runner even on rollback failure', async () => {
    mockQueryRunner.query.mockRejectedValueOnce(new Error('db error'));
    mockQueryRunner.rollbackTransaction.mockRejectedValueOnce(
      new Error('rollback error'),
    );

    await expect(scheduler.handleRetentionCleanup()).resolves.not.toThrow();
    expect(mockQueryRunner.release).toHaveBeenCalled();
  });
});
