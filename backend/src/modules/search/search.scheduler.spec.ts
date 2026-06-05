import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { SearchScheduler } from './search.scheduler';

describe('SearchScheduler', () => {
  let scheduler: SearchScheduler;
  let mockQueryRunner: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    query: jest.Mock;
  };
  let mockDataSource: { createQueryRunner: jest.Mock };

  beforeEach(async () => {
    mockQueryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([{ id: 'row-1' }, { id: 'row-2' }]),
    };
    mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
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
