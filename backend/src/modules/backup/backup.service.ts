import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { DataSource } from 'typeorm';
import { AuditLogService } from '../audit-logs/services/audit-log.service';
import { PostgresClientStatus, PostgresClientStatusService } from '../postgres-client/postgres-client-status.service';
import { AppRelease } from '../../config/app-release.factory';
import { BackupConfigResult } from './backup.config';
import { runBackupAttempt, BackupAttemptDeps } from './backup-attempt';
import { formatRecoveryPoint } from './backup-manifest';
import { ProcessRunner } from './backup-process-runner';
import { BackupStorage } from './backup-storage';
import { listStoredBackups } from './backup-listing';
import { runRetentionPass } from './backup-retention-pass';
import { BackupSettingsService } from './backup-settings.service';
import {
  BackupAttemptRecord,
  BackupListResult,
  BackupStepError,
  BackupStorageUnavailableError,
  BackupTimeoutError,
  BACKUP_RETENTION_TIMEOUT_MS,
  BACKUP_TIMEOUT_MS,
  RetentionRecord,
} from './backup.types';

export const BACKUP_OPTIONS = Symbol('BACKUP_OPTIONS');

export interface BackupServiceOptions {
  config: BackupConfigResult;
  /** Null when configuration is incomplete. */
  storage: BackupStorage | null;
  runner: ProcessRunner;
  toolEnv: NodeJS.ProcessEnv;
  appRole: string;
  uploadsDir: string;
  release: AppRelease;
  timeoutMs?: number;
  retentionTimeoutMs?: number;
  now?: () => Date;
}

export interface BackupStartAccepted {
  recoveryPoint: string;
  startedAt: string;
}

/** Who asked for a Backup. Only a manual start is audited; scheduled runs are not (#2112). */
export type BackupTrigger = { kind: 'manual'; userId: string; username?: string } | { kind: 'scheduled' };

export interface BackupStatusView {
  configured: boolean;
  /** Names of missing or invalid deployment settings. Never their values. */
  missingSettings: string[];
  running: BackupStartAccepted | null;
  /** Null means "no attempt since restart". */
  lastAttempt: BackupAttemptRecord | null;
  noAttemptSinceRestart: boolean;
  /** The last retention pass, shown apart from Backup results (#2114). Null means none since restart. */
  lastRetention: RetentionRecord | null;
  postgresClient: PostgresClientView;
  release: { version: string; status: AppRelease['status']; configurationError: string | null };
  startup: 'starting' | 'ready' | 'failed';
  startupError: string | null;
}

export type PostgresClientView =
  | { state: 'unchecked' }
  | { state: 'compatible'; clientMajor: number; serverMajor: number }
  | { state: 'mismatch'; clientMajor: number; serverMajor: number }
  | { state: 'unavailable'; reason: string };

/**
 * Owns Backup behaviour for this ticket: starting an attempt under one
 * in-process lock, in-memory status, listing from storage, and the audit entry
 * for accepted manual starts (#2111). Scheduling, retention and heartbeats come
 * later, and must call start() and this same lock.
 */
@Injectable()
export class BackupService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BackupService.name);
  private running: BackupStartAccepted | null = null;
  private lastAttempt: BackupAttemptRecord | null = null;
  private lastRetention: RetentionRecord | null = null;
  private startup: 'starting' | 'ready' | 'failed' = 'starting';
  private startupError: string | null = null;

  constructor(
    @Inject(BACKUP_OPTIONS) private readonly options: BackupServiceOptions,
    private readonly dataSource: DataSource,
    private readonly postgresClient: PostgresClientStatusService,
    private readonly auditLog: AuditLogService,
    private readonly settings: BackupSettingsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.prepareStartup();
  }

  /**
   * Clears `.tmp/` before any Backup can start. Completed Backups live beside
   * it, not inside it, so they are never touched.
   */
  async prepareStartup(): Promise<void> {
    if (!this.options.config.configured) {
      this.startup = 'ready';
      return;
    }
    try {
      await clearTemporaryFiles(this.options.config.config.localCopyDir);
      this.startup = 'ready';
    } catch (error) {
      this.startup = 'failed';
      this.startupError = 'Temporary Backup files could not be cleared at startup';
      this.logger.error(`${this.startupError} (${(error as Error)?.name ?? 'error'})`);
    }
  }

  /**
   * Accepts one Backup or throws. The lock is taken synchronously, before any
   * await, so two requests cannot both be accepted. Manual and scheduled starts
   * share this path (#2112). Only an accepted manual start is audited.
   */
  async start(trigger: BackupTrigger): Promise<BackupStartAccepted> {
    if (!this.options.config.configured) {
      throw new ServiceUnavailableException('Backups are not configured');
    }
    if (this.startup === 'starting') throw new ServiceUnavailableException('Backups are starting');
    if (this.startup === 'failed') {
      throw new ServiceUnavailableException('Backups are disabled until temporary files can be cleared');
    }
    if (this.running) throw new ConflictException('A Backup is already running');

    const now = this.now();
    const accepted: BackupStartAccepted = {
      recoveryPoint: formatRecoveryPoint(now),
      startedAt: now.toISOString(),
    };
    this.running = accepted;
    void this.execute(accepted);

    if (trigger.kind === 'manual') await this.audit(trigger, accepted.recoveryPoint);
    return accepted;
  }

  getStatus(): BackupStatusView {
    const config = this.options.config;
    const client = this.postgresClient.getStatus();
    return {
      configured: config.configured,
      missingSettings: missingSettingNames(config),
      running: this.running,
      lastAttempt: this.lastAttempt,
      noAttemptSinceRestart: this.lastAttempt === null,
      lastRetention: this.lastRetention,
      postgresClient: toClientView(client),
      release: {
        version: this.options.release.version,
        status: this.options.release.status,
        configurationError: this.options.release.configurationError,
      },
      startup: this.startup,
      startupError: this.startupError,
    };
  }

  /**
   * Lists complete Backups straight from storage. A prefix counts only when its
   * manifest and archive both exist and the manifest parses. Any storage failure
   * is "unavailable", never an empty list.
   */
  async listBackups(): Promise<BackupListResult> {
    if (!this.options.config.configured || !this.options.storage) {
      return { state: 'unavailable', reason: 'Backup storage is not configured' };
    }
    try {
      const listing = await listStoredBackups(this.options.storage);
      return { state: 'ok', backups: listing.backups, malformed: listing.malformed };
    } catch (error) {
      if (error instanceof BackupStorageUnavailableError) {
        return { state: 'unavailable', reason: 'Backup storage is unavailable' };
      }
      throw error;
    }
  }

  /**
   * Runs one attempt under the hard timeout. The lock is released only after
   * the attempt has settled, and the attempt settles only after its child
   * processes and storage requests have stopped (#2111).
   */
  private async execute(accepted: BackupStartAccepted): Promise<void> {
    try {
      await this.runAttempt(accepted);
      // Retention runs after every attempt, success or failure, still under the same lock (#2114).
      await this.runRetention();
    } finally {
      this.running = null;
    }
  }

  private async runAttempt(accepted: BackupStartAccepted): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new BackupTimeoutError()),
      this.options.timeoutMs ?? BACKUP_TIMEOUT_MS,
    );
    try {
      let failure: unknown = null;
      let failed = false;
      try {
        await this.attempt(accepted.recoveryPoint, controller.signal);
      } catch (error) {
        failed = true;
        failure = error;
      }
      const endedAt = this.now().toISOString();
      this.lastAttempt = failed
        ? this.failureRecord(accepted, endedAt, failure)
        : {
            recoveryPoint: accepted.recoveryPoint,
            startedAt: accepted.startedAt,
            endedAt,
            result: 'succeeded',
            failedStep: null,
            error: null,
          };
      if (failed) this.logger.warn(`Backup ${accepted.recoveryPoint} failed at ${this.lastAttempt.failedStep}`);
      else this.logger.log(`Backup ${accepted.recoveryPoint} published`);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Never throws: a failed pass is recorded in lastRetention and changes nothing else. */
  private async runRetention(): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error('Retention timed out')),
      this.options.retentionTimeoutMs ?? BACKUP_RETENTION_TIMEOUT_MS,
    );
    try {
      const { config, storage } = this.options;
      if (!config.configured || !storage) {
        const now = this.now().toISOString();
        this.lastRetention = skippedRetention(now, 'Backup storage is not configured, so retention was skipped');
        return;
      }
      this.lastRetention = await runRetentionPass(
        {
          storage,
          localCopyDir: config.config.localCopyDir,
          readSettings: () => this.settings.readStored(),
          now: () => this.now(),
        },
        controller.signal,
      );
      if (this.lastRetention.result === 'failed') {
        this.logger.warn(`Retention failed at ${this.lastRetention.failedStep}`);
      }
    } catch {
      const now = this.now().toISOString();
      this.lastRetention = {
        startedAt: now,
        endedAt: now,
        result: 'failed',
        expiredBackups: 0,
        orphanArchives: 0,
        prunedLocalCopies: 0,
        failedStep: 'unexpected',
        message: 'Retention could not complete',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private async attempt(recoveryPoint: string, signal: AbortSignal): Promise<void> {
    const { config, storage } = this.options;
    if (!config.configured || !storage) throw new Error('Backup storage is not configured');
    const deps: BackupAttemptDeps = {
      dataSource: this.dataSource,
      versionCheck: () => this.postgresClient.check(),
      runner: this.options.runner,
      storage,
      config: config.config,
      toolEnv: this.options.toolEnv,
      appRole: this.options.appRole,
      uploadsDir: this.options.uploadsDir,
      release: this.options.release.version,
    };
    await runBackupAttempt(deps, recoveryPoint, signal);
  }

  private failureRecord(accepted: BackupStartAccepted, endedAt: string, error: unknown): BackupAttemptRecord {
    const stepError =
      error instanceof BackupStepError
        ? error
        : new BackupStepError('prepare', 'Unexpected error during the Backup', error);
    return {
      recoveryPoint: accepted.recoveryPoint,
      startedAt: accepted.startedAt,
      endedAt,
      result: 'failed',
      failedStep: stepError.step,
      error: stepError.safeMessage,
    };
  }

  /** Audit failures never block a Backup. The entry holds no secrets. */
  private async audit(actor: { userId: string; username?: string }, recoveryPoint: string): Promise<void> {
    try {
      await this.auditLog.log('BACKUP_INITIATED', 'Backup', 'Backup initiated manually', {
        // entityId is a uuid column; the recovery point is not one, so it lives in metadata.
        userId: actor.userId,
        username: actor.username,
        metadata: { recoveryPoint, trigger: 'manual' },
      });
    } catch {
      // Audit must not block the Backup.
    }
  }

  private now(): Date {
    return this.options.now ? this.options.now() : new Date();
  }
}

function skippedRetention(now: string, message: string): RetentionRecord {
  return {
    startedAt: now,
    endedAt: now,
    result: 'skipped',
    expiredBackups: 0,
    orphanArchives: 0,
    prunedLocalCopies: 0,
    failedStep: null,
    message,
  };
}

function missingSettingNames(config: BackupConfigResult): string[] {
  return config.configured ? [] : [...config.missing, ...config.invalid];
}

function toClientView(status: PostgresClientStatus): PostgresClientView {
  if (status.state === 'compatible' || status.state === 'mismatch') {
    return { state: status.state, clientMajor: status.clientMajor, serverMajor: status.serverMajor };
  }
  if (status.state === 'unavailable') return { state: 'unavailable', reason: status.reason };
  return { state: 'unchecked' };
}

/**
 * Removes `<localCopyDir>/.tmp` and nothing else. The path is built from a
 * fixed name, so it cannot reach a completed Backup directory.
 */
export async function clearTemporaryFiles(localCopyDir: string): Promise<void> {
  const tmpRoot = path.join(path.resolve(localCopyDir), '.tmp');
  if (path.dirname(tmpRoot) !== path.resolve(localCopyDir) || path.basename(tmpRoot) !== '.tmp') {
    throw new Error('refusing to clear an unexpected path');
  }
  await fsp.rm(tmpRoot, { recursive: true, force: true });
}
