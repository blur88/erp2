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
    // Assigned per-test. The cleanup path must never consult it (the
    // field-presence test primes it to prove that).
    hget?: jest.Mock;
  };
  let service: BackupSchedulerService;
  let reconciler: { scanOrphanedSchedulers: jest.Mock };

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

    reconciler = {
      scanOrphanedSchedulers: jest.fn().mockResolvedValue({
        orphans: [],
        unclassifiable: [],
        legacySkipped: [],
        scanned: 0,
        classified: 0,
        liveCount: 0,
      }),
    };

    service = new BackupSchedulerService(
      scheduleRepository,
      backupQueue,
      {} as BackupService,
      reconciler as any,
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

      // Two cleanup pages, then the mock above restores the default. The
      // orphan diagnostic no longer scans here — it is delegated to the
      // reconciler — so counting exactly two proves no cleanup page was lost.
      expect(redisClient.zscan.mock.calls.slice(0, 2)).toEqual([
        ['bull:backup-queue:repeat', '0'],
        ['bull:backup-queue:repeat', '42'],
      ]);
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

  describe('orphaned scheduler diagnostic', () => {
    const MEMBER = '60f88ec415a02b45f5c02094f3aca23d';
    let warn: jest.SpyInstance;
    let error: jest.SpyInstance;

    const emptyScan = {
      orphans: [],
      unclassifiable: [],
      legacySkipped: [],
      scanned: 0,
      classified: 0,
      liveCount: 0,
    };

    beforeEach(() => {
      warn = jest
        .spyOn(service['logger'], 'warn')
        .mockImplementation(() => undefined);
      error = jest
        .spyOn(service['logger'], 'error')
        .mockImplementation(() => undefined);
    });

    afterEach(() => {
      warn.mockRestore();
      error.mockRestore();
    });

    const warnings = () => warn.mock.calls.map((c) => String(c[0]));

    it('warns about each orphan and never removes it', async () => {
      reconciler.scanOrphanedSchedulers.mockResolvedValue({
        ...emptyScan,
        orphans: [{ member: MEMBER, scheduleId: 'a556cb35' }],
        scanned: 1,
        classified: 1,
      });

      await service.onModuleInit();

      expect(warnings()).toEqual([
        expect.stringContaining(
          `Orphaned backup-queue repeat entry "${MEMBER}"`,
        ),
        expect.stringContaining('Found 1 orphaned backup-queue repeat entries'),
      ]);
      // Report-only: the diagnostic must never mutate queue state.
      expect(backupQueue.removeJobScheduler).not.toHaveBeenCalled();
    });

    it('does not fail boot when the scan throws', async () => {
      reconciler.scanOrphanedSchedulers.mockRejectedValue(
        new Error('redis unavailable'),
      );

      await expect(service.onModuleInit()).resolves.toBeUndefined();

      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('redis unavailable'),
        expect.anything(),
      );
      expect(warn).not.toHaveBeenCalled();
      expect(backupQueue.removeJobScheduler).not.toHaveBeenCalled();
    });
  });
});
