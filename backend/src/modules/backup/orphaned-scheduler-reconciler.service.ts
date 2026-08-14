import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { In, Repository } from 'typeorm';
import { IRedisClient, Queue } from 'bullmq';
import { BackupSchedule } from '@database/entities/backup-schedule.entity';

export interface OrphanCandidate {
  member: string;
  scheduleId: string;
}

export interface OrphanScanResult {
  orphans: OrphanCandidate[];
  unclassifiable: string[];
  legacySkipped: string[];
  scanned: number;
  classified: number;
  liveCount: number;
}

export interface ReconcileOptions {
  dryRun: boolean;
  allowEmpty: boolean;
}

export interface RemovalOutcome {
  member: string;
  scheduleId: string;
  removed: boolean;
}

export interface ReconcileResult {
  mode: 'dry-run' | 'execute';
  scan: OrphanScanResult;
  candidates: OrphanCandidate[];
  removals: RemovalOutcome[];
  emptyGuard: 'not-triggered' | 'reported' | 'overridden';
}

/** Execution stopped partway. Carries what was already removed. */
export class ReconcileExecutionError extends Error {
  constructor(
    readonly failed: OrphanCandidate,
    readonly completed: RemovalOutcome[],
    readonly remaining: OrphanCandidate[],
    readonly cause: unknown,
  ) {
    super(
      `Removal failed for "${failed.member}" after ${completed.length} ` +
        `successful removal(s); ${remaining.length} not attempted. ` +
        `No rollback was performed — re-run to finish.`,
    );
    this.name = 'ReconcileExecutionError';
  }
}

/** Every classifiable candidate looked orphaned — treated as a broken DB read. */
export class EmptyResultGuardError extends Error {
  constructor(readonly candidates: OrphanCandidate[]) {
    super(
      `Refusing to remove ${candidates.length} entries: the database ` +
        `confirmed zero live schedules, which is indistinguishable from a ` +
        `failed read. Re-run with --allow-empty only if you intend to remove ` +
        `every remaining scheduler.`,
    );
    this.name = 'EmptyResultGuardError';
  }
}

type ScanClient = IRedisClient & {
  zscan(key: string, cursor: string): Promise<[string, string[]]>;
};

/**
 * Owns discovery and removal of orphaned scheduler-format repeat entries
 * (issue #1045). Standalone rather than a BackupSchedulerService method so the
 * CLI can wire it without that service's mutating onModuleInit.
 */
@Injectable()
export class OrphanedSchedulerReconciler {
  // No Logger: this class returns structured results and lets its callers
  // decide how to report. BackupSchedulerService logs warnings; the CLI prints.
  constructor(
    @InjectRepository(BackupSchedule)
    private readonly scheduleRepository: Repository<BackupSchedule>,
    @InjectQueue('backup-queue') private readonly backupQueue: Queue,
  ) {}

  /**
   * Pure discovery. Deliberately does NOT catch: a DB failure must propagate
   * so no caller can mistake "the query threw" for "no rows matched".
   */
  async scanOrphanedSchedulers(): Promise<OrphanScanResult> {
    const client = (await this.backupQueue.getBackend().client) as ScanClient;
    const repeatKey = this.backupQueue.toKey('repeat');

    // A Set because ZSCAN may return the same member more than once across
    // pages — the cursor guarantees at least once, not exactly once.
    const members = new Set<string>();
    let cursor = '0';
    do {
      const [next, flat] = await client.zscan(repeatKey, cursor);
      cursor = next;
      for (let i = 0; i < flat.length; i += 2) {
        members.add(flat[i]);
      }
    } while (cursor !== '0');

    const unclassifiable: string[] = [];
    const legacySkipped: string[] = [];
    const byScheduleId = new Map<string, string[]>();

    for (const member of members) {
      // MANDATORY: nothing clears non-ic entries before this runs. A legacy
      // repeatable whose data carries a scheduleId would otherwise be
      // classified as an orphan and passed to removeJobScheduler, which for a
      // non-ic entry deletes metadata but leaves the delayed occurrence live.
      // Field presence is the discriminator, never member hex shape.
      const isScheduler = await client.hexists(`${repeatKey}:${member}`, 'ic');
      if (!isScheduler) {
        legacySkipped.push(member);
        continue;
      }

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

    const orphans: OrphanCandidate[] = [];
    for (const [scheduleId, orphanMembers] of byScheduleId) {
      if (live.has(scheduleId)) {
        continue;
      }
      for (const member of orphanMembers) {
        orphans.push({ member, scheduleId });
      }
    }

    return {
      orphans,
      unclassifiable,
      legacySkipped,
      scanned: members.size,
      classified: scheduleIds.length,
      liveCount: live.size,
    };
  }

  async reconcileOrphanedSchedulers(
    opts: ReconcileOptions,
  ): Promise<ReconcileResult> {
    const scan = await this.scanOrphanedSchedulers();
    const candidates = scan.orphans;

    // Uncertainty ⇒ keep the entry. A reconciler that wants to delete
    // EVERYTHING is diagnosing its own broken DB read, not a fleet of orphans.
    const suspicious = candidates.length > 0 && scan.liveCount === 0;

    let emptyGuard: ReconcileResult['emptyGuard'] = 'not-triggered';
    if (suspicious) {
      if (opts.dryRun) {
        // Reported, never aborted: aborting the dry-run would make
        // --allow-empty undiscoverable.
        emptyGuard = 'reported';
      } else if (opts.allowEmpty) {
        emptyGuard = 'overridden';
      } else {
        throw new EmptyResultGuardError(candidates);
      }
    }

    if (opts.dryRun) {
      return {
        mode: 'dry-run',
        scan,
        candidates,
        removals: [],
        emptyGuard,
      };
    }

    // Sequential and non-atomic by design: each removal is idempotent and
    // Postgres holds the durable state, so a partial run is fixed by re-running
    // rather than by rollback.
    const removals: RemovalOutcome[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      try {
        const removed = await this.backupQueue.removeJobScheduler(
          candidate.member,
        );
        removals.push({ ...candidate, removed });
      } catch (error) {
        throw new ReconcileExecutionError(
          candidate,
          removals,
          candidates.slice(i + 1),
          error,
        );
      }
    }

    return { mode: 'execute', scan, candidates, removals, emptyGuard };
  }

  /**
   * Returns the scheduleId only when it is a non-empty string. Anything else —
   * absent field, unparseable JSON, non-object payload, or a non-string/empty
   * scheduleId — is unclassifiable, never an orphan.
   */
  extractScheduleId(raw: string | null): string | null {
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
}