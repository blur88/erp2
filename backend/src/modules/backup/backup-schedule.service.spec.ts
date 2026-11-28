import { jest } from '@jest/globals';
import { BadRequestException, ConflictException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { BackupScheduleService, BACKUP_SCHEDULE_TIMER } from './backup-schedule.service';
import { BACKUP_SETTINGS_DEFAULTS, BackupSettingsValues, validateBackupSettings } from './backup-settings';
import { BackupSettingsService, StoredBackupSettings } from './backup-settings.service';
import { makeReadyHarness } from './backup-test-fixtures';

/** 2026-11-28 10:07 UTC: the next 30-minute boundary is 10:30. */
const START = new Date('2026-11-28T10:07:00.000Z');
const MINUTE = 60_000;

interface Harness {
  schedule: BackupScheduleService;
  stored: { current: StoredBackupSettings | Error };
  settingsUpdate: jest.Mock<(...args: unknown[]) => Promise<BackupSettingsValues>>;
  backupStart: jest.Mock<(...args: unknown[]) => Promise<unknown>>;
  registry: SchedulerRegistry;
  backupHarness: Awaited<ReturnType<typeof makeReadyHarness>>;
  configuredStatus: { configured: boolean; missingSettings: string[]; startup: string; startupError: string | null };
  errorLog: jest.SpiedFunction<typeof Logger.prototype.error>;
  warnLog: jest.SpiedFunction<typeof Logger.prototype.warn>;
}

async function makeHarness(
  options: { stored?: StoredBackupSettings | Error; enabled?: boolean; configured?: boolean } = {},
): Promise<Harness> {
  const stored = { current: options.stored ?? { state: 'valid' as const, settings: { ...BACKUP_SETTINGS_DEFAULTS } } };
  const configuredStatus = {
    configured: options.configured ?? true,
    missingSettings: options.configured === false ? ['BACKUP_S3_BUCKET'] : [],
    startup: 'ready',
    startupError: null,
  };
  const settings = {
    readStored: jest.fn<() => Promise<StoredBackupSettings>>(async () => {
      if (stored.current instanceof Error) throw stored.current;
      return stored.current;
    }),
    // Mirrors BackupSettingsService.update: an invalid save is rejected and nothing is stored.
    update: jest.fn<(...args: unknown[]) => Promise<BackupSettingsValues>>(async (input: unknown) => {
      const validation = validateBackupSettings(input);
      if (!validation.ok || !validation.settings) throw new BadRequestException('Backup settings are invalid');
      stored.current = { state: 'valid', settings: { ...validation.settings } };
      return validation.settings;
    }),
  };
  // A real Backup service harness supplies the start operation, so the scheduled path
  // goes through exactly what "Back up now" runs.
  const backupHarness = await makeReadyHarness();
  const backupStart = jest.fn<(...args: unknown[]) => Promise<unknown>>(async (...args: unknown[]) =>
    backupHarness.service.start(args[0] as any),
  );
  const backups = {
    getStatus: () => ({ ...configuredStatus }),
    start: backupStart,
  };

  const registry = new SchedulerRegistry();
  const schedule = new BackupScheduleService(
    settings as unknown as BackupSettingsService,
    backups as any,
    registry,
    options.enabled ?? true,
  );
  return {
    schedule,
    stored,
    settingsUpdate: settings.update,
    backupStart,
    registry,
    backupHarness,
    configuredStatus,
    errorLog: jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined),
    warnLog: jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined),
  };
}

describe('BackupScheduleService (#2112)', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: START });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('startup with stored settings', () => {
    it('schedules the next wall-clock run from the stored interval and reports it', async () => {
      const h = await makeHarness();
      await h.schedule.onApplicationBootstrap();

      expect(h.schedule.getSchedulingStatus()).toEqual({
        state: 'scheduled',
        intervalMinutes: 30,
        nextRunAt: '2026-11-28T10:30:00.000Z',
      });
      expect(h.registry.doesExist('timeout', BACKUP_SCHEDULE_TIMER)).toBe(true);
    });

    it('starts a scheduled Backup through the same start operation at the boundary, and re-arms', async () => {
      const h = await makeHarness();
      await h.schedule.onApplicationBootstrap();

      await jest.advanceTimersByTimeAsync(22 * MINUTE);
      expect(h.backupStart).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(MINUTE);
      expect(h.backupStart).toHaveBeenCalledTimes(1);
      expect(h.backupStart).toHaveBeenCalledWith({ kind: 'scheduled' });
      expect(h.schedule.getSchedulingStatus()).toMatchObject({ nextRunAt: '2026-11-28T11:00:00.000Z' });
      await h.schedule.onModuleDestroy();
    });

    it('fires once per boundary, never twice for the same boundary', async () => {
      const h = await makeHarness();
      await h.schedule.onApplicationBootstrap();
      await jest.advanceTimersByTimeAsync(23 * MINUTE);
      expect(h.backupStart).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(29 * MINUTE + 59_999);
      expect(h.backupStart).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      expect(h.backupStart).toHaveBeenCalledTimes(2);
      await h.schedule.onModuleDestroy();
    });
  });

  describe('invalid or missing stored settings', () => {
    it('stops scheduling for invalid stored settings, names the fields, and logs an error', async () => {
      const h = await makeHarness({
        stored: {
          state: 'invalid',
          errors: [{ field: 'intervalMinutes', message: 'Interval must be 15 or 30 minutes' }],
          values: { ...BACKUP_SETTINGS_DEFAULTS, intervalMinutes: 5 },
        },
      });
      await h.schedule.onApplicationBootstrap();

      const status = h.schedule.getSchedulingStatus();
      expect(status.state).toBe('unavailable');
      expect(status.state === 'unavailable' && status.reason).toContain('intervalMinutes');
      expect(h.registry.doesExist('timeout', BACKUP_SCHEDULE_TIMER)).toBe(false);
      expect(h.errorLog).toHaveBeenCalledWith(expect.stringContaining('Backup scheduling is unavailable'));

      await jest.advanceTimersByTimeAsync(2 * 60 * MINUTE);
      expect(h.backupStart).not.toHaveBeenCalled();
    });

    it('stops scheduling when the settings row is missing, and never creates defaults', async () => {
      const h = await makeHarness({ stored: { state: 'missing' } });
      await h.schedule.onApplicationBootstrap();

      expect(h.schedule.getSchedulingStatus()).toMatchObject({ state: 'unavailable' });
      expect(h.settingsUpdate).not.toHaveBeenCalled();
      expect(h.registry.doesExist('timeout', BACKUP_SCHEDULE_TIMER)).toBe(false);
    });

    it('stops scheduling when the settings cannot be read, rather than assuming defaults', async () => {
      const h = await makeHarness({ stored: new Error('connection refused') });
      await h.schedule.onApplicationBootstrap();
      expect(h.schedule.getSchedulingStatus()).toMatchObject({ state: 'unavailable' });
      expect(h.registry.doesExist('timeout', BACKUP_SCHEDULE_TIMER)).toBe(false);
    });

    it('does not schedule when the deployment configuration is incomplete, and says why', async () => {
      const h = await makeHarness({ configured: false });
      await h.schedule.onApplicationBootstrap();
      const status = h.schedule.getSchedulingStatus();
      expect(status.state === 'unavailable' && status.reason).toContain('BACKUP_S3_BUCKET');
    });

    it('does not schedule when scheduled runs are disabled for this environment', async () => {
      const h = await makeHarness({ enabled: false });
      await h.schedule.onApplicationBootstrap();
      expect(h.schedule.getSchedulingStatus()).toMatchObject({ state: 'unavailable' });
      expect(h.registry.doesExist('timeout', BACKUP_SCHEDULE_TIMER)).toBe(false);
    });

    it('still starts a manual Backup through the real start operation while the stored settings are invalid', async () => {
      const h = await makeHarness({ stored: { state: 'missing' } });
      await h.schedule.onApplicationBootstrap();

      await expect(
        h.backupStart({ kind: 'manual', userId: 'admin-1', username: 'admin' }),
      ).resolves.toMatchObject({ recoveryPoint: expect.any(String) });
    });
  });

  describe('saving settings', () => {
    it('resumes scheduling on a valid save with no restart, using the new interval', async () => {
      const h = await makeHarness({ stored: { state: 'missing' } });
      await h.schedule.onApplicationBootstrap();
      expect(h.schedule.getSchedulingStatus()).toMatchObject({ state: 'unavailable' });

      await h.schedule.updateSettings(
        { ...BACKUP_SETTINGS_DEFAULTS, intervalMinutes: 15 },
        { userId: 'admin-1', username: 'admin' },
      );

      expect(h.schedule.getSchedulingStatus()).toEqual({
        state: 'scheduled',
        intervalMinutes: 15,
        nextRunAt: '2026-11-28T10:15:00.000Z',
      });
      await jest.advanceTimersByTimeAsync(8 * MINUTE);
      expect(h.backupStart).toHaveBeenCalledTimes(1);
      await h.schedule.onModuleDestroy();
    });

    it('moves an armed schedule to the new interval without a restart', async () => {
      const h = await makeHarness();
      await h.schedule.onApplicationBootstrap();
      await h.schedule.updateSettings({ ...BACKUP_SETTINGS_DEFAULTS, intervalMinutes: 15 }, { userId: 'a' });
      expect(h.registry.doesExist('timeout', BACKUP_SCHEDULE_TIMER)).toBe(true);
      expect(h.schedule.getSchedulingStatus()).toMatchObject({ intervalMinutes: 15, nextRunAt: '2026-11-28T10:15:00.000Z' });
      await h.schedule.onModuleDestroy();
    });

    it('rejects an invalid save and leaves scheduling as it was', async () => {
      const h = await makeHarness();
      await h.schedule.onApplicationBootstrap();
      const before = h.schedule.getSchedulingStatus();

      await expect(
        h.schedule.updateSettings({ ...BACKUP_SETTINGS_DEFAULTS, intervalMinutes: 20 }, { userId: 'a' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(h.schedule.getSchedulingStatus()).toEqual(before);
      await h.schedule.onModuleDestroy();
    });
  });

  describe('overlap', () => {
    it('skips a scheduled run that lands while a manual Backup is still running on the real lock', async () => {
      const h = await makeHarness();
      await h.schedule.onApplicationBootstrap();
      // Start the manual run at 10:25 so its 20-minute hard timeout is not reached before the 10:30 boundary.
      await jest.advanceTimersByTimeAsync(18 * MINUTE);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      h.backupHarness.postgresClient.check.mockImplementation(async () => {
        await gate;
        return { state: 'compatible', clientMajor: 19, serverMajor: 19 };
      });
      await h.backupHarness.service.start({ kind: 'manual', userId: 'admin-1' });

      await jest.advanceTimersByTimeAsync(5 * MINUTE + 1);
      expect(h.warnLog).toHaveBeenCalledWith(expect.stringContaining('already running'));
      expect(h.backupHarness.service.getStatus().running).not.toBeNull();

      release();
      for (let i = 0; i < 200 && h.backupHarness.service.getStatus().running; i += 1) {
        await jest.advanceTimersByTimeAsync(1);
      }
      expect(h.backupHarness.service.getStatus().lastAttempt?.result).toBe('succeeded');
      // The skipped 10:30 run was not queued: the next scheduled start is the 11:00 boundary.
      expect(h.schedule.getSchedulingStatus()).toMatchObject({ nextRunAt: '2026-11-28T11:00:00.000Z' });
      await h.schedule.onModuleDestroy();
    });

    it('skips a scheduled run that would overlap a running Backup, without queueing it', async () => {
      const h = await makeHarness();
      await h.schedule.onApplicationBootstrap();
      h.backupStart.mockImplementationOnce(async () => {
        throw new ConflictException('A Backup is already running');
      });

      await jest.advanceTimersByTimeAsync(23 * MINUTE + 1);
      expect(h.backupStart).toHaveBeenCalledTimes(1);
      expect(h.warnLog).toHaveBeenCalledWith(expect.stringContaining('skipped'));

      // Nothing is queued: the next call comes only at the following boundary.
      await jest.advanceTimersByTimeAsync(29 * MINUTE);
      expect(h.backupStart).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(MINUTE);
      expect(h.backupStart).toHaveBeenCalledTimes(2);
      await h.schedule.onModuleDestroy();
    });

    it('skips a scheduled run while startup is still in progress and keeps the schedule', async () => {
      const h = await makeHarness();
      await h.schedule.onApplicationBootstrap();
      h.backupStart.mockImplementationOnce(async () => {
        throw new ServiceUnavailableException('Backups are starting');
      });
      await jest.advanceTimersByTimeAsync(23 * MINUTE + 1);
      expect(h.schedule.getSchedulingStatus()).toMatchObject({ state: 'scheduled', nextRunAt: '2026-11-28T11:00:00.000Z' });
      await h.schedule.onModuleDestroy();
    });
  });
});
