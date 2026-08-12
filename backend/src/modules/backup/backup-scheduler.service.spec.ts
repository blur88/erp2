import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { BackupSchedule } from '@database/entities/backup-schedule.entity';
import { BackupSchedulerService } from './backup-scheduler.service';
import { BackupService } from './backup.service';

describe('BackupSchedulerService', () => {
  let schedule: BackupSchedule;
  let scheduleRepository: jest.Mocked<Repository<BackupSchedule>>;
  let backupQueue: jest.Mocked<Queue>;
  let redisClient: {
    zscan: jest.Mock;
    hexists: jest.Mock;
    // Only assigned by the field-presence test, which primes hget to prove
    // the implementation does not consult it.
    hget?: jest.Mock;
  };
  let service: BackupSchedulerService;

  beforeEach(() => {
    schedule = {
      id: 'schedule-1',
      name: 'Nightly',
      enabled: true,
      frequency: 'daily',
      time: '02:30',
      databases: ['erp'],
      includeSettings: true,
    } as BackupSchedule;

    scheduleRepository = {
      create: jest.fn().mockReturnValue(schedule),
      save: jest.fn().mockResolvedValue(schedule),
    } as unknown as jest.Mocked<Repository<BackupSchedule>>;

    backupQueue = {
      add: jest.fn().mockResolvedValue(undefined),
      upsertJobScheduler: jest.fn().mockResolvedValue(undefined),
      removeJobScheduler: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<Queue>;

    redisClient = {
      zscan: jest.fn().mockResolvedValue(['0', []]),
      hexists: jest.fn().mockResolvedValue(0), // 0 = no ic field
    };
    (backupQueue as any).getBackend = jest.fn().mockReturnValue({
      client: Promise.resolve(redisClient),
    });
    (backupQueue as any).toKey = jest.fn((type: string) => `bull:backup-queue:${type}`);
    scheduleRepository.find = jest.fn().mockResolvedValue([]);

    service = new BackupSchedulerService(
      scheduleRepository,
      backupQueue,
      {} as BackupService,
    );
  });

  it('registers enabled schedules as a BullMQ job scheduler', async () => {
    await service.createSchedule({
      name: 'Nightly',
      enabled: true,
      frequency: 'daily',
      time: '02:30',
      databases: ['erp'],
      includeSettings: true,
    });

    expect(backupQueue.upsertJobScheduler).toHaveBeenCalledWith(
      'schedule-schedule-1',
      { pattern: '30 02 * * *' },
      expect.objectContaining({
        name: 'create-backup',
        data: expect.objectContaining({ scheduleId: 'schedule-1' }),
      }),
    );
  });

  it('removes a schedule using removeJobScheduler with the scheduler id', async () => {
    scheduleRepository.findOne = jest.fn().mockResolvedValue(schedule);
    scheduleRepository.remove = jest.fn().mockResolvedValue(undefined);

    await service.remove('schedule-1');

    expect(backupQueue.removeJobScheduler).toHaveBeenCalledWith(
      'schedule-schedule-1',
    );
  });

  describe('legacy repeatable cleanup', () => {
    const HASHED = 'a'.repeat(32);

    it('completes the full scan before removing any member', async () => {
      // The key assertion is inside the second zscan: if the implementation
      // removed page-one members before requesting page two, removeJobScheduler
      // would already have been called by this point. Asserting only that both
      // pages were visited would NOT catch mutate-while-scanning.
      redisClient.zscan
        .mockResolvedValueOnce(['42', [HASHED, '111']])
        .mockImplementationOnce(async () => {
          expect(backupQueue.removeJobScheduler).not.toHaveBeenCalled();
          return ['0', ['b'.repeat(32), '222']];
        });

      await service.onModuleInit();

      expect(redisClient.zscan).toHaveBeenCalledTimes(2);
      expect(backupQueue.removeJobScheduler).toHaveBeenCalledWith(HASHED);
      expect(backupQueue.removeJobScheduler).toHaveBeenCalledWith('b'.repeat(32));
      expect(backupQueue.removeJobScheduler).toHaveBeenCalledTimes(2);
    });

    it('leaves scheduler-format entries carrying ic untouched', async () => {
      redisClient.zscan.mockResolvedValueOnce(['0', ['schedule-abc', '111']]);
      redisClient.hexists.mockResolvedValueOnce(1);

      await service.onModuleInit();

      expect(backupQueue.removeJobScheduler).not.toHaveBeenCalled();
    });

    it('treats ic as field presence, not a truthy value', async () => {
      // hexists returns 1 for a freshly upserted scheduler whose counter is
      // still "0". Guards against a future refactor to `hget` + truthiness,
      // which would delete live schedulers that have not yet run.
      redisClient.zscan.mockResolvedValueOnce(['0', ['schedule-abc', '111']]);
      redisClient.hexists.mockResolvedValueOnce(1);
      redisClient.hget = jest.fn().mockResolvedValue('0');

      await service.onModuleInit();

      expect(redisClient.hexists).toHaveBeenCalledWith(
        expect.stringContaining('repeat:schedule-abc'),
        'ic',
      );
      expect(backupQueue.removeJobScheduler).not.toHaveBeenCalled();
    });

    it('throws and removes nothing when a non-ic member is not a 32-char hex hash', async () => {
      redisClient.zscan.mockResolvedValueOnce([
        '0',
        ['create-backup:schedule-1:::0 2 * * *', '111'],
      ]);

      await expect(service.onModuleInit()).rejects.toThrow(
        /unsupported legacy repeatable/i,
      );

      expect(backupQueue.removeJobScheduler).not.toHaveBeenCalled();
      expect(backupQueue.upsertJobScheduler).not.toHaveBeenCalled();
    });

    it('removes nothing when a valid hash and an unsupported member share a snapshot', async () => {
      // Proves the unsupported branch aborts the WHOLE run: classification
      // must complete before any removal, so the removable member survives.
      redisClient.zscan.mockResolvedValueOnce([
        '0',
        [HASHED, '111', 'create-backup:schedule-1:::0 2 * * *', '222'],
      ]);

      await expect(service.onModuleInit()).rejects.toThrow(
        /unsupported legacy repeatable/i,
      );

      expect(backupQueue.removeJobScheduler).not.toHaveBeenCalled();
      expect(backupQueue.upsertJobScheduler).not.toHaveBeenCalled();
    });

    it('completes all removals before the first upsert', async () => {
      const calls: string[] = [];
      redisClient.zscan.mockResolvedValueOnce(['0', [HASHED, '111']]);
      (backupQueue.removeJobScheduler as jest.Mock).mockImplementation(() => {
        calls.push('remove');
        return Promise.resolve(true);
      });
      (backupQueue.upsertJobScheduler as jest.Mock).mockImplementation(() => {
        calls.push('upsert');
        return Promise.resolve(undefined);
      });
      scheduleRepository.find = jest.fn().mockResolvedValue([schedule]);

      await service.onModuleInit();

      expect(calls).toEqual(['remove', 'upsert']);
    });
  });
});
