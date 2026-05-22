import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { BackupSchedule } from '@database/entities/backup-schedule.entity';
import { BackupSchedulerService } from './backup-scheduler.service';
import { BackupService } from './backup.service';

describe('BackupSchedulerService', () => {
  it('registers enabled schedules with BullMQ repeat.pattern', async () => {
    const schedule = {
      id: 'schedule-1',
      name: 'Nightly',
      enabled: true,
      frequency: 'daily',
      time: '02:30',
      databases: ['erp'],
      includeSettings: true,
    } as BackupSchedule;

    const scheduleRepository = {
      create: jest.fn().mockReturnValue(schedule),
      save: jest.fn().mockResolvedValue(schedule),
    } as unknown as jest.Mocked<Repository<BackupSchedule>>;
    const backupQueue = {
      add: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<Queue>;

    const service = new BackupSchedulerService(
      scheduleRepository,
      backupQueue,
      {} as BackupService,
    );

    await service.createSchedule({
      name: 'Nightly',
      enabled: true,
      frequency: 'daily',
      time: '02:30',
      databases: ['erp'],
      includeSettings: true,
    });

    expect(backupQueue.add).toHaveBeenCalledWith(
      'create-backup',
      expect.objectContaining({
        scheduleId: 'schedule-1',
      }),
      {
        repeat: {
          pattern: '30 02 * * *',
        },
        jobId: 'schedule-schedule-1',
      },
    );
  });
});
