import { Job } from 'bullmq';
import { BackupProcessor } from './backup.processor';
import { BackupService } from './backup.service';

describe('BackupProcessor', () => {
  let backupService: jest.Mocked<
    Pick<
      BackupService,
      'createBackup' | 'cleanupOldBackups' | 'cleanupBackupsWithSettings'
    >
  >;
  let processor: BackupProcessor;

  beforeEach(() => {
    backupService = {
      createBackup: jest.fn(),
      cleanupOldBackups: jest.fn(),
      cleanupBackupsWithSettings: jest.fn(),
    };

    processor = new BackupProcessor(backupService as unknown as BackupService);
  });

  it('dispatches create-backup jobs to BackupService.createBackup', async () => {
    backupService.createBackup.mockResolvedValue({
      id: 'backup-1',
      filename: 'backup.sql',
    } as never);

    const result = await processor.process({
      id: 'job-1',
      name: 'create-backup',
      data: {
        backupDto: {
          type: 'full',
          includeFiles: true,
        },
      },
    } as Job);

    expect(backupService.createBackup).toHaveBeenCalledWith({
      type: 'full',
      includeFiles: true,
    });
    expect(result).toEqual({
      success: true,
      backupId: 'backup-1',
      filename: 'backup.sql',
    });
  });

  it('dispatches cleanup-old-backups jobs to BackupService.cleanupOldBackups', async () => {
    backupService.cleanupOldBackups.mockResolvedValue(3 as never);

    const result = await processor.process({
      id: 'job-2',
      name: 'cleanup-old-backups',
      data: {
        retentionDays: 30,
      },
    } as Job);

    expect(backupService.cleanupOldBackups).toHaveBeenCalledWith(30);
    expect(result).toEqual({ success: true, deletedCount: 3 });
  });

  it('dispatches cleanup-with-settings jobs to BackupService.cleanupBackupsWithSettings', async () => {
    backupService.cleanupBackupsWithSettings.mockResolvedValue(2 as never);

    const result = await processor.process({
      id: 'job-3',
      name: 'cleanup-with-settings',
      data: {},
    } as Job);

    expect(backupService.cleanupBackupsWithSettings).toHaveBeenCalled();
    expect(result).toEqual({ success: true, deletedCount: 2 });
  });
});
