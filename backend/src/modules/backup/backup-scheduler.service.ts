import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { IRedisClient, Queue } from 'bullmq';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BackupSchedule } from '@database/entities/backup-schedule.entity';
import {
  CreateBackupScheduleDto,
  UpdateBackupScheduleDto,
} from './dto/backup-schedule.dto';
import { BackupService } from './backup.service';

@Injectable()
export class BackupSchedulerService {
  private readonly logger = new Logger(BackupSchedulerService.name);

  constructor(
    @InjectRepository(BackupSchedule)
    private readonly scheduleRepository: Repository<BackupSchedule>,
    @InjectQueue('backup-queue') private readonly backupQueue: Queue,
    private readonly backupService: BackupService,
  ) {}

  async onModuleInit() {
    // Initialize all enabled schedules on startup
    await this.initializeSchedules();
  }

  async createSchedule(
    createDto: CreateBackupScheduleDto,
  ): Promise<BackupSchedule> {
    const schedule = this.scheduleRepository.create({
      ...createDto,
      nextRunAt: this.calculateNextRun(createDto),
    });

    await this.scheduleRepository.save(schedule);

    if (schedule.enabled) {
      await this.addScheduleToQueue(schedule);
    }

    this.logger.log(`Created backup schedule: ${schedule.name}`);
    return schedule;
  }

  async findAll(): Promise<BackupSchedule[]> {
    return this.scheduleRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<BackupSchedule> {
    const schedule = await this.scheduleRepository.findOne({ where: { id } });
    if (!schedule) {
      throw new NotFoundException(`Schedule with ID ${id} not found`);
    }
    return schedule;
  }

  async update(
    id: string,
    updateDto: UpdateBackupScheduleDto,
  ): Promise<BackupSchedule> {
    const schedule = await this.findOne(id);

    Object.assign(schedule, updateDto);

    if (updateDto.frequency || updateDto.time || updateDto.cronExpression) {
      schedule.nextRunAt = this.calculateNextRun(schedule as any);
    }

    await this.scheduleRepository.save(schedule);

    // Remove old job and add new one
    await this.removeScheduleFromQueue(schedule);
    if (schedule.enabled) {
      await this.addScheduleToQueue(schedule);
    }

    this.logger.log(`Updated backup schedule: ${schedule.name}`);
    return schedule;
  }

  async remove(id: string): Promise<void> {
    const schedule = await this.findOne(id);
    await this.removeScheduleFromQueue(schedule);
    await this.scheduleRepository.remove(schedule);
    this.logger.log(`Deleted backup schedule: ${schedule.name}`);
  }

  async toggleSchedule(id: string, enabled: boolean): Promise<BackupSchedule> {
    const schedule = await this.findOne(id);
    schedule.enabled = enabled;

    if (enabled) {
      schedule.nextRunAt = this.calculateNextRun(schedule as any);
      await this.addScheduleToQueue(schedule);
    } else {
      await this.removeScheduleFromQueue(schedule);
    }

    await this.scheduleRepository.save(schedule);

    this.logger.log(
      `${enabled ? 'Enabled' : 'Disabled'} backup schedule: ${schedule.name}`,
    );
    return schedule;
  }

  async triggerSchedule(id: string): Promise<void> {
    const schedule = await this.findOne(id);

    await this.backupQueue.add('create-backup', {
      scheduleId: schedule.id,
      backupDto: {
        backupType: 'scheduled',
        databases: schedule.databases,
        includeSettings: schedule.includeSettings,
        createdBy: 'scheduler',
        description: `Scheduled backup: ${schedule.name}`,
      },
    });

    schedule.lastRunAt = new Date();
    schedule.nextRunAt = this.calculateNextRun(schedule as any);
    await this.scheduleRepository.save(schedule);

    this.logger.log(`Manually triggered schedule: ${schedule.name}`);
  }

  private async initializeSchedules(): Promise<void> {
    // Must precede every upsertJobScheduler call: a surviving v5 entry would
    // run alongside the scheduler we are about to register.
    await this.removeLegacyRepeatables();

    const schedules = await this.scheduleRepository.find({
      where: { enabled: true },
    });

    for (const schedule of schedules) {
      await this.addScheduleToQueue(schedule);
    }

    this.logger.log(`Initialized ${schedules.length} backup schedules`);
  }

  /**
   * Matches the md5 hex digest BullMQ 5.81.3 stores as the repeat ZSET member
   * (see repeat.js:46 — `this.hash(legacyRepeatKey)`).
   */
  private static readonly HASHED_MEMBER = /^[0-9a-f]{32}$/;

  /**
   * Removes BullMQ v5 repeatable entries left in Redis so they cannot run
   * alongside the v6 job schedulers we register below.
   *
   * `ic` marks a scheduler-format entry (written by both v5's and v6's
   * scheduler path); only the old repeatable API omits it.
   */
  private async removeLegacyRepeatables(): Promise<void> {
    // Queue types getBackend() as RedisQueueBackend, so .client needs no cast.
    // BullMQ's IRedisClient omits zscan, so extend just that one method.
    const client = (await this.backupQueue.getBackend()
      .client) as IRedisClient & {
      zscan(key: string, cursor: string): Promise<[string, string[]]>;
    };
    const repeatKey = this.backupQueue.toKey('repeat');

    // Snapshot the whole ZSET first: Redis does not guarantee stable SCAN
    // iteration if members are removed while the cursor is open.
    const members: string[] = [];
    let cursor = '0';
    do {
      const [next, flat] = await client.zscan(repeatKey, cursor);
      cursor = next;
      for (let i = 0; i < flat.length; i += 2) {
        members.push(flat[i]);
      }
    } while (cursor !== '0');

    const stale: string[] = [];
    for (const member of members) {
      // hexists is the discriminator BullMQ itself uses — field presence,
      // not value. A scheduler whose ic is "0" must still be preserved.
      const isScheduler = await client.hexists(`${repeatKey}:${member}`, 'ic');
      if (isScheduler) {
        continue; // scheduler-format entry — leave it alone
      }
      if (!BackupSchedulerService.HASHED_MEMBER.test(member)) {
        throw new Error(
          `Unsupported legacy repeatable entry in backup-queue: "${member}". ` +
            `BullMQ 6 cannot safely remove pre-hashing repeatable jobs — ` +
            `removeJobScheduler would delete its metadata but leave the ` +
            `delayed occurrence live. Remove this entry with BullMQ 5 ` +
            `(queue.removeRepeatableByKey) before deploying v6.`,
        );
      }
      stale.push(member);
    }

    for (const member of stale) {
      await this.backupQueue.removeJobScheduler(member);
      this.logger.log(`Removed legacy repeatable entry: ${member}`);
    }

    if (stale.length) {
      this.logger.log(`Removed ${stale.length} legacy repeatable entries`);
    }
  }

  private async addScheduleToQueue(schedule: BackupSchedule): Promise<void> {
    const cronExpression =
      schedule.cronExpression || this.buildCronExpression(schedule);

    await this.backupQueue.upsertJobScheduler(
      this.getSchedulerId(schedule),
      { pattern: cronExpression },
      {
        name: 'create-backup',
        data: {
          scheduleId: schedule.id,
          backupDto: {
            backupType: 'scheduled',
            databases: schedule.databases,
            includeSettings: schedule.includeSettings,
            createdBy: 'scheduler',
            description: `Scheduled backup: ${schedule.name}`,
          },
        },
      },
    );

    this.logger.log(
      `Added schedule to queue: ${schedule.name} (${cronExpression})`,
    );
  }

  private async removeScheduleFromQueue(
    schedule: BackupSchedule,
  ): Promise<void> {
    await this.backupQueue.removeJobScheduler(this.getSchedulerId(schedule));

    this.logger.log(`Removed schedule from queue: ${schedule.name}`);
  }

  private getSchedulerId(schedule: BackupSchedule): string {
    return `schedule-${schedule.id}`;
  }

  private buildCronExpression(schedule: BackupSchedule): string {
    const [hour, minute] = schedule.time.split(':');

    switch (schedule.frequency) {
      case 'hourly':
        return `${minute} * * * *`; // Every hour at specified minute

      case 'daily':
        return `${minute} ${hour} * * *`; // Every day at specified time

      case 'weekly':
        const dayOfWeek = schedule.dayOfWeek ?? 0;
        return `${minute} ${hour} * * ${dayOfWeek}`; // Specific day of week

      case 'monthly':
        const dayOfMonth = schedule.dayOfMonth ?? 1;
        return `${minute} ${hour} ${dayOfMonth} * *`; // Specific day of month

      default:
        return `${minute} ${hour} * * *`; // Default to daily
    }
  }

  private calculateNextRun(
    schedule: CreateBackupScheduleDto | BackupSchedule,
  ): Date {
    const now = new Date();
    const [hour, minute] = schedule.time.split(':').map(Number);

    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);

    // If the time has already passed today, move to next occurrence
    if (next <= now) {
      switch (schedule.frequency) {
        case 'hourly':
          next.setHours(next.getHours() + 1);
          break;
        case 'daily':
          next.setDate(next.getDate() + 1);
          break;
        case 'weekly':
          next.setDate(next.getDate() + 7);
          break;
        case 'monthly':
          next.setMonth(next.getMonth() + 1);
          break;
      }
    }

    return next;
  }

  /**
   * Scheduled cleanup job - runs based on configured cleanup time
   * Checks every hour and triggers cleanup if time matches
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleScheduledCleanup() {
    try {
      const settings = await this.backupService.getBackupSettings();

      if (!settings.autoCleanupEnabled) {
        return; // Skip if auto-cleanup is disabled
      }

      // Check if current time matches the configured cleanup time
      const now = new Date();
      const [cleanupHour, cleanupMinute] = settings.cleanupTime.split(':').map(Number);

      // Run cleanup if we're within the cleanup hour
      if (now.getHours() === cleanupHour) {
        this.logger.log('Running scheduled backup cleanup job');

        await this.backupQueue.add('cleanup-with-settings', {});

        this.logger.log('Backup cleanup job added to queue');
      }
    } catch (error) {
      this.logger.error(`Failed to schedule cleanup job: ${error.message}`, error.stack);
    }
  }
}
