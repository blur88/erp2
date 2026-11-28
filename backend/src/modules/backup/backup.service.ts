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
import {
  archiveKeyFor,
  BACKUPS_PREFIX,
  formatRecoveryPoint,
  isRecoveryPoint,
  manifestKeyFor,
  parseManifest,
  ARCHIVE_NAME,
} from './backup-manifest';
import { ProcessRunner } from './backup-process-runner';
import { BackupStorage, readText } from './backup-storage';
import {
  BackupAttemptRecord,
  BackupListResult,
  BackupStepError,
  BackupStorageUnavailableError,
  BackupTimeoutError,
  BACKUP_TIMEOUT_MS,
  MalformedBackupItem,
  BackupListItem,
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
  now?: () => Date;
}

export interface BackupStartAccepted {
  recoveryPoint: string;
  startedAt: string;
}

export interface BackupStatusView {
  configured: boolean;
  /** Names of missing or invalid deployment settings. Never their values. */
  missingSettings: string[];
  running: BackupStartAccepted | null;
  /** Null means "no attempt since restart". */
  lastAttempt: BackupAttemptRecord | null;
  noAttemptSinceRestart: boolean;
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
  private startup: 'starting' | 'ready' | 'failed' = 'starting';
  private startupError: string | null = null;

  constructor(
    @Inject(BACKUP_OPTIONS) private readonly options: BackupServiceOptions,
    private readonly dataSource: DataSource,
    private readonly postgresClient: PostgresClientStatusService,
    private readonly auditLog: AuditLogService,
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
   * await, so two requests cannot both be accepted. Only an accepted manual
   * start is audited.
   */
  async start(actor: { userId: string; username?: string }): Promise<BackupStartAccepted> {
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

    await this.audit(actor, accepted.recoveryPoint);
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
    const storage = this.options.storage;
    try {
      const objects = await storage.listAll(BACKUPS_PREFIX);
      const sizes = new Map<string, number>();
      const recoveryPoints = new Set<string>();
      for (const object of objects) {
        sizes.set(object.key, object.size);
        const rest = object.key.slice(BACKUPS_PREFIX.length);
        const [segment] = rest.split('/');
        if (segment) recoveryPoints.add(segment);
      }

      const backups: BackupListItem[] = [];
      const malformed: MalformedBackupItem[] = [];
      for (const recoveryPoint of [...recoveryPoints].sort().reverse()) {
        const manifestKey = manifestKeyFor(recoveryPoint);
        if (!sizes.has(manifestKey)) continue; // incomplete attempt: never listed

        if (!isRecoveryPoint(recoveryPoint)) {
          malformed.push({ recoveryPoint, reason: 'prefix is not a recovery point' });
          continue;
        }
        const parsed = parseManifest(await readText(storage, manifestKey), recoveryPoint);
        if (!parsed.manifest) {
          malformed.push({ recoveryPoint, reason: parsed.reason });
          continue;
        }
        const manifest = parsed.manifest;
        const archiveKey = archiveKeyFor(recoveryPoint);
        const archiveSize = sizes.get(archiveKey);
        if (archiveSize === undefined) {
          malformed.push({ recoveryPoint, reason: `${ARCHIVE_NAME} is missing` });
          continue;
        }
        if (archiveSize !== manifest.archive.size) {
          malformed.push({ recoveryPoint, reason: 'archive size does not match the manifest' });
          continue;
        }
        backups.push({
          recoveryPoint,
          release: manifest.release,
          archiveSize,
          postgres: {
            serverMajor: manifest.postgres.server_major,
            clientMajor: manifest.postgres.client_major,
          },
        });
      }
      return { state: 'ok', backups, malformed };
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
      this.running = null;
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
        entityId: recoveryPoint,
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
