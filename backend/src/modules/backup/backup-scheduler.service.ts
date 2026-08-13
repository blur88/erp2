import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In } from 'typeorm';
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

    // Last, so the schedulers we just upserted are fully written before the
    // diagnostic reads them back — otherwise a live schedule could be read
    // mid-write and reported as an orphan.
    await this.reportOrphanedSchedulers();
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
    //
    // zscan is NOT in BullMQ's IRedisClient and NOT in the ioredis proxy's
    // override table — IRedisClient deliberately declares scan/hscan/sscan
    // with structured options ({ MATCH, COUNT }) so non-ioredis adapters can
    // map them, and omits zscan entirely. This call therefore falls through
    // the proxy to the raw ioredis client's positional-arg zscan, which makes
    // it ioredis-only. If this project ever adopts one of v6's other backends
    // (node-redis, bun-redis, valkey-glide), rewrite this using scan-style
    // structured options or zrange(repeatKey, 0, -1).
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

    // Sequential and non-atomic across members by design: if a removal throws
    // partway, init fails and the next boot retries. That is safe because each
    // removal is idempotent (an already-removed member simply won't appear in
    // the next ZSCAN) and Postgres holds the durable schedule state. Correct
    // by recovery rather than by atomicity — don't "fix" it into a pipeline
    // that could mask a mid-run failure.
    for (const member of stale) {
      await this.backupQueue.removeJobScheduler(member);
      this.logger.log(`Removed legacy repeatable entry: ${member}`);
    }

    if (stale.length) {
      this.logger.log(`Removed ${stale.length} legacy repeatable entries`);
    }
  }

  /**
   * Reports repeat entries whose backing `backup_schedules` row no longer
   * exists (issue #1035). Such an entry keeps enqueuing `create-backup`
   * against a schedule the operator believes they deleted, and no code path
   * removes it: `removeLegacyRepeatables()` skips it (it has `ic`),
   * `initializeSchedules()` never reaches it (no DB row), and
   * `removeScheduleFromQueue()` needs an entity that is gone.
   *
   * REPORT-ONLY, deliberately. This must never delete queue state: doing so
   * would make Redis contents depend on a DB read, so a transient read
   * failure or a partially-migrated deploy could destroy live schedulers.
   * Auto-reconciliation is explicitly deferred to its own design discussion.
   * Keep this method free of any mutating call.
   *
   * Unlike `removeLegacyRepeatables()`, whose throw is a deliberate deploy
   * gate, a diagnostic must never be able to fail boot — hence the catch-all.
   * This also survives the eventual retirement of the v5→v6 machinery in
   * #1033, which is why it is a sibling method and not folded into that scan.
   */
  private async reportOrphanedSchedulers(): Promise<void> {
    try {
      const client = (await this.backupQueue.getBackend()
        .client) as IRedisClient & {
        zscan(key: string, cursor: string): Promise<[string, string[]]>;
      };
      const repeatKey = this.backupQueue.toKey('repeat');

      // A Set because ZSCAN may return the same member more than once across
      // pages — the cursor guarantees every member is seen at least once, not
      // exactly once.
      const members = new Set<string>();
      let cursor = '0';
      do {
        const [next, flat] = await client.zscan(repeatKey, cursor);
        cursor = next;
        for (let i = 0; i < flat.length; i += 2) {
          members.add(flat[i]);
        }
      } while (cursor !== '0');

      // Collected, not emitted: a failure anywhere below must produce one
      // diagnostic error rather than a partial orphan report that reads as
      // complete.
      const unclassifiable: string[] = [];
      const byScheduleId = new Map<string, string[]>();

      for (const member of members) {
        const raw = await client.hget(`${repeatKey}:${member}`, 'data');
        const scheduleId = this.extractScheduleId(raw);
        if (!scheduleId) {
          unclassifiable.push(member);
          continue;
        }
        const existing = byScheduleId.get(scheduleId);
        if (existing) {
          existing.push(member);
        } else {
          byScheduleId.set(scheduleId, [member]);
        }
      }

      // Deduplicated by the Map; skip the query entirely when nothing is
      // classifiable, so an empty In([]) never reaches the database.
      const scheduleIds = [...byScheduleId.keys()];
      const live = new Set<string>();
      if (scheduleIds.length) {
        const rows = await this.scheduleRepository.find({
          where: { id: In(scheduleIds) },
          select: { id: true },
        });
        for (const row of rows) {
          live.add(row.id);
        }
      }

      let orphanCount = 0;
      for (const [scheduleId, orphanMembers] of byScheduleId) {
        if (live.has(scheduleId)) {
          continue;
        }
        for (const member of orphanMembers) {
          orphanCount++;
          this.logger.warn(
            `Orphaned backup-queue repeat entry "${member}": no ` +
              `backup_schedules row for scheduleId ${scheduleId}. It will ` +
              `keep enqueuing create-backup. Remove it with ` +
              `queue.removeJobScheduler("${member}") — never ZREM, which ` +
              `would orphan the delayed occurrence and its job hash. ` +
              `That call returns true when removed, false if already absent.`,
          );
        }
      }

      for (const member of unclassifiable) {
        this.logger.warn(
          `Backup-queue repeat entry "${member}" has no usable scheduleId in ` +
            `its data field; skipped by the orphan check (not an orphan).`,
        );
      }

      // Only when nonzero — a clean stack should not warn on every boot.
      if (orphanCount) {
        this.logger.warn(
          `Found ${orphanCount} orphaned backup-queue repeat entries`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Orphaned-scheduler diagnostic failed: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Returns the scheduleId only when it is a non-empty string. Anything else
   * — absent hash field, unparseable JSON, non-object payload, or a
   * non-string/empty scheduleId — is unclassifiable, never an orphan.
   */
  private extractScheduleId(raw: string | null): string | null {
    if (!raw) {
      return null;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    const scheduleId = (parsed as { scheduleId?: unknown } | null)?.scheduleId;
    return typeof scheduleId === 'string' && scheduleId.length
      ? scheduleId
      : null;
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
