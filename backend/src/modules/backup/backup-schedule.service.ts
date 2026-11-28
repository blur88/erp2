import { ConflictException, Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { BackupService } from './backup.service';
import { BackupSettingsService } from './backup-settings.service';
import { BackupSettingsValues, nextScheduledRun } from './backup-settings';

/** Injection token: whether scheduled runs are enabled in this process (see createScheduleOptions). */
export const BACKUP_SCHEDULING_ENABLED = Symbol('BACKUP_SCHEDULING_ENABLED');

/** The single timer that drives scheduled Backups. */
export const BACKUP_SCHEDULE_TIMER = 'backup-scheduled-run';

export type BackupSchedulingStatus =
  | { state: 'scheduled'; intervalMinutes: number; nextRunAt: string }
  | { state: 'unavailable'; reason: string };

/** Flat on purpose: the project compiles with strict off, which does not narrow a discriminated union. */
interface Decision {
  intervalMinutes: number | null;
  reason: string | null;
  logLevel: 'error' | 'warn';
}

/**
 * Drives scheduled Backups from the stored interval (#2112). Scheduled runs call
 * the same start operation as "Back up now", and an overlapping run is skipped,
 * not queued. Runs align to wall-clock boundaries of the interval.
 *
 * Scheduling stops, with a reason, whenever the stored settings are missing or
 * invalid, or the deployment configuration is incomplete. Saving valid settings
 * resumes it without a restart.
 */
@Injectable()
export class BackupScheduleService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BackupScheduleService.name);
  private status: BackupSchedulingStatus = { state: 'unavailable', reason: 'Scheduling is starting' };
  /** Bumped on every re-arm or disarm, so a run that was already in flight cannot re-arm a stale schedule. */
  private generation = 0;
  /** Serialises reconciliations so two saves cannot both arm a timer. */
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly settings: BackupSettingsService,
    private readonly backups: BackupService,
    private readonly registry: SchedulerRegistry,
    @Inject(BACKUP_SCHEDULING_ENABLED) private readonly enabled: boolean,
  ) {}

  onApplicationBootstrap(): Promise<void> {
    return this.reconcile();
  }

  onModuleDestroy(): void {
    this.disarm();
  }

  getSchedulingStatus(): BackupSchedulingStatus {
    return this.status;
  }

  /**
   * Saves valid settings, then resumes or re-times scheduling from the stored row.
   * An invalid save throws before anything is written and leaves scheduling alone.
   */
  async updateSettings(input: unknown, actor: { userId: string; username?: string }): Promise<BackupSettingsValues> {
    const saved = await this.settings.update(input, actor);
    await this.reconcile();
    return saved;
  }

  /** Re-reads the stored settings and re-arms or stops scheduling. Also used after a restore. */
  reconcile(): Promise<void> {
    const run = this.queue.then(() => this.reconcileNow());
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async reconcileNow(): Promise<void> {
    this.disarm();
    const decision = await this.decide();
    if (decision.reason !== null) {
      this.status = { state: 'unavailable', reason: decision.reason };
      if (decision.logLevel === 'error') this.logger.error(`Backup scheduling is unavailable: ${decision.reason}`);
      else this.logger.warn(`Backup scheduling is unavailable: ${decision.reason}`);
      return;
    }
    this.arm(decision.intervalMinutes, new Date(), this.generation);
  }

  private async decide(): Promise<Decision> {
    if (!this.enabled) {
      return keepOff('warn', 'scheduled Backups are turned off in this environment');
    }

    // Checked before any settings are read: a recovery environment changes nothing on the bucket (#2113).
    const health = this.backups.getStatus();
    if (health.recoveryHold.held) {
      return keepOff('warn', health.recoveryHold.reason ?? 'scheduled Backups are held in this recovery environment');
    }

    let stored;
    try {
      stored = await this.settings.readStored();
    } catch {
      return keepOff('error', 'Backup settings could not be read from the database. Scheduling is stopped until they can be.');
    }
    if (stored.state === 'missing') {
      return keepOff('error', 'Backup settings are missing from the database. Save valid settings to resume scheduling.');
    }
    if (stored.state === 'invalid') {
      const fields = stored.errors.map((error) => error.field).join(', ');
      return keepOff('error', `Stored Backup settings are invalid (${fields || 'unknown field'}). Save valid settings to resume scheduling.`);
    }

    if (!health.configured) {
      return keepOff('warn', `Backup deployment configuration is incomplete: ${health.missingSettings.join(', ')}`);
    }
    return { intervalMinutes: stored.settings.intervalMinutes, reason: null, logLevel: 'warn' };
  }

  private arm(intervalMinutes: number, from: Date, generation: number): void {
    this.schedule(intervalMinutes, nextScheduledRun(from, intervalMinutes), generation);
  }

  private schedule(intervalMinutes: number, target: Date, generation: number): void {
    const delay = Math.max(0, target.getTime() - Date.now());
    this.registry.addTimeout(
      BACKUP_SCHEDULE_TIMER,
      setTimeout(() => void this.fire(intervalMinutes, target, generation), delay),
    );
    this.status = { state: 'scheduled', intervalMinutes, nextRunAt: target.toISOString() };
  }

  private async fire(intervalMinutes: number, target: Date, generation: number): Promise<void> {
    if (generation !== this.generation) return;
    if (this.registry.doesExist('timeout', BACKUP_SCHEDULE_TIMER)) this.registry.deleteTimeout(BACKUP_SCHEDULE_TIMER);

    try {
      await this.backups.start({ kind: 'scheduled' });
      this.logger.log(`Scheduled Backup started for ${target.toISOString()}`);
    } catch (error) {
      // Skipped, never queued: the next run is the next boundary.
      if (error instanceof ConflictException) {
        this.logger.warn(`Scheduled Backup for ${target.toISOString()} skipped: a Backup is already running`);
      } else {
        this.logger.warn(`Scheduled Backup for ${target.toISOString()} skipped: ${(error as Error)?.message ?? 'unknown error'}`);
      }
    }

    if (generation !== this.generation) return;
    this.schedule(intervalMinutes, nextScheduledRun(target, intervalMinutes), generation);
  }

  private disarm(): void {
    this.generation += 1;
    if (this.registry.doesExist('timeout', BACKUP_SCHEDULE_TIMER)) this.registry.deleteTimeout(BACKUP_SCHEDULE_TIMER);
  }
}

function keepOff(logLevel: 'error' | 'warn', reason: string): Decision {
  return { intervalMinutes: null, reason, logLevel };
}
