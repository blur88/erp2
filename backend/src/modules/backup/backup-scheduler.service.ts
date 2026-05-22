import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
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
    const schedules = await this.scheduleRepository.find({
      where: { enabled: true },
    });

    for (const schedule of schedules) {
      await this.addScheduleToQueue(schedule);
    }

    this.logger.log(`Initialized ${schedules.length} backup schedules`);
  }

  private async addScheduleToQueue(schedule: BackupSchedule): Promise<void> {
    const cronExpression =
      schedule.cronExpression || this.buildCronExpression(schedule);

    await this.backupQueue.add(
      'create-backup',
      {
        scheduleId: schedule.id,
        backupDto: {
          backupType: 'scheduled',
          databases: schedule.databases,
          includeSettings: schedule.includeSettings,
          createdBy: 'scheduler',
          description: `Scheduled backup: ${schedule.name}`,
        },
      },
      {
        repeat: {
          pattern: cronExpression,
        },
        jobId: `schedule-${schedule.id}`,
      },
    );

    this.logger.log(
      `Added schedule to queue: ${schedule.name} (${cronExpression})`,
    );
  }

  private async removeScheduleFromQueue(
    schedule: BackupSchedule,
  ): Promise<void> {
    const jobId = `schedule-${schedule.id}`;
    const repeatableJobs = await this.backupQueue.getRepeatableJobs();
    const job = repeatableJobs.find((j) => j.id === jobId);

    if (job) {
      await this.backupQueue.removeRepeatableByKey(job.key);
      this.logger.log(`Removed schedule from queue: ${schedule.name}`);
    }
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
