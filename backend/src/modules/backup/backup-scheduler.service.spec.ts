import { jest } from '@jest/globals';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { BackupSchedule } from '@database/entities/backup-schedule.entity';
import { BackupSchedulerService } from './backup-scheduler.service';
import { BackupService } from './backup.service';

describe('BackupSchedulerService', () => {
  let schedule: BackupSchedule;
  let scheduleRepository: any;
  let backupQueue: any;
  let service: BackupSchedulerService;
  let reconciler: { scanOrphanedSchedulers: any };

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
      create: (jest.fn as unknown as any)().mockReturnValue(schedule),
      save: (jest.fn as unknown as any)().mockResolvedValue(schedule),
    } as unknown as any;

    backupQueue = {
      add: (jest.fn as unknown as any)().mockResolvedValue(undefined),
      upsertJobScheduler: (jest.fn as unknown as any)().mockResolvedValue(undefined),
      removeJobScheduler: (jest.fn as unknown as any)().mockResolvedValue(true),
    } as unknown as any;

    scheduleRepository.find = (jest.fn as unknown as any)().mockResolvedValue([]);

    reconciler = {
      scanOrphanedSchedulers: (jest.fn as unknown as any)().mockResolvedValue({
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
    scheduleRepository.findOne = (jest.fn as unknown as any)().mockResolvedValue(schedule);
    scheduleRepository.remove = (jest.fn as unknown as any)().mockResolvedValue(undefined);

    await service.remove('schedule-1');

    expect(backupQueue.removeJobScheduler).toHaveBeenCalledWith(
      'schedule-schedule-1',
    );
  });

  describe('orphaned scheduler diagnostic', () => {
    const MEMBER = '60f88ec415a02b45f5c02094f3aca23d';
    let warn: any;
    let error: any;

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
