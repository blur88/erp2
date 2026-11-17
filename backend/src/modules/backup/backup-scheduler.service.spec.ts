import { jest } from '@jest/globals';
import { defaultRepeatStrategy, Queue } from 'bullmq';
import { Logger } from '@nestjs/common';
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

  it('boots past an invalid saved cron, disables it, and registers later schedules', async () => {
    const invalid = { ...schedule, id: 'invalid', name: 'Old custom', cronExpression: '0 0 * * 1-5L' };
    scheduleRepository.find.mockResolvedValue([invalid, schedule]);
    scheduleRepository.update = (jest.fn as any)().mockResolvedValue({ affected: 1 });
    backupQueue.upsertJobScheduler.mockImplementation(async (_id, options) => {
      defaultRepeatStrategy(Date.now(), options);
    });
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      await expect(service.onModuleInit()).resolves.toBeUndefined();
      expect(backupQueue.upsertJobScheduler).toHaveBeenCalledWith(
        'schedule-schedule-1', { pattern: '30 02 * * *' }, expect.anything(),
      );
      expect(error).toHaveBeenCalledWith(
        expect.stringMatching(/invalid "Old custom".*0 0 \* \* 1-5L.*Constraint error/),
        expect.any(String),
      );
      expect(scheduleRepository.update).toHaveBeenCalledWith('invalid', { enabled: false, nextRunAt: null });
      expect(reconciler.scanOrphanedSchedulers).toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });

  it('continues boot even when recording a registration failure fails', async () => {
    scheduleRepository.find.mockResolvedValue([schedule, { ...schedule, id: 'later' }]);
    scheduleRepository.update = (jest.fn as any)().mockRejectedValue(new Error('database unavailable'));
    backupQueue.upsertJobScheduler.mockRejectedValueOnce(new Error('queue unavailable'));
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      await expect(service.onModuleInit()).resolves.toBeUndefined();
      expect(backupQueue.upsertJobScheduler).toHaveBeenCalledWith(
        'schedule-later', expect.anything(), expect.anything(),
      );
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to disable backup schedule schedule-1'), expect.any(String),
      );
    } finally {
      error.mockRestore();
    }
  });

  describe.each(['0 0 * * 1-5L', '0 0 31 2 *', '*5 * * * *', 'not a cron'])(
    'invalid cron %s', (cronExpression) => {
      it('rejects create with 400 before saving, even when disabled', async () => {
        await expect(service.createSchedule({ ...schedule, enabled: false, cronExpression }))
          .rejects.toMatchObject({ status: 400 });
        expect(scheduleRepository.save).not.toHaveBeenCalled();
        expect(backupQueue.upsertJobScheduler).not.toHaveBeenCalled();
      });

      it('rejects update with 400 without changing the saved schedule or queue', async () => {
        scheduleRepository.findOne = (jest.fn as any)().mockResolvedValue(schedule);
        await expect(service.update(schedule.id, { name: 'Changed', cronExpression }))
          .rejects.toMatchObject({ status: 400 });
        expect(schedule.name).toBe('Nightly');
        expect(schedule.cronExpression).toBeUndefined();
        expect(scheduleRepository.save).not.toHaveBeenCalled();
        expect(backupQueue.removeJobScheduler).not.toHaveBeenCalled();
        expect(backupQueue.upsertJobScheduler).not.toHaveBeenCalled();
      });
    },
  );

  it.each([
    { frequency: 'hourly', pattern: '30 * * * *' },
    { frequency: 'daily', pattern: '30 02 * * *' },
    { frequency: 'weekly', pattern: '30 02 * * 0' },
    { frequency: 'monthly', pattern: '30 02 1 * *' },
    { frequency: 'daily', cronExpression: '0 4 * * 1-5', pattern: '0 4 * * 1-5' },
    { frequency: 'daily', cronExpression: '', pattern: '30 02 * * *' },
  ])('creates and updates a valid $frequency schedule ($cronExpression)', async ({ pattern, ...options }) => {
    scheduleRepository.create.mockImplementation((dto) => Object.assign(schedule, dto));
    scheduleRepository.findOne = (jest.fn as any)().mockResolvedValue(schedule);
    const dto = { ...schedule, ...options } as Parameters<typeof service.createSchedule>[0];
    await expect(service.createSchedule(dto)).resolves.toMatchObject({ enabled: true });
    expect(backupQueue.upsertJobScheduler).toHaveBeenLastCalledWith(
      'schedule-schedule-1', { pattern }, expect.anything(),
    );
    await expect(service.update(schedule.id, { ...options, name: 'Updated' } as Parameters<typeof service.update>[1]))
      .resolves.toMatchObject({ name: 'Updated' });
    expect(backupQueue.upsertJobScheduler).toHaveBeenLastCalledWith(
      'schedule-schedule-1', { pattern }, expect.anything(),
    );
    expect(scheduleRepository.save).toHaveBeenCalledTimes(2);
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
