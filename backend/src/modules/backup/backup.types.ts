import type { LocalCopyStatus, RpoStatus } from './backup-protection';

/** Every step of a Backup attempt, in the order it runs (#2111). */
export const BACKUP_STEPS = [
  'prepare',
  'version-check',
  'snapshot',
  'dump',
  'globals',
  'uploads-archive',
  'checks',
  'encrypt',
  'local-copy',
  'upload',
  'read-back',
  'manifest',
  'publish',
] as const;

export type BackupStep = (typeof BACKUP_STEPS)[number];

/** Hard limit for one attempt, from start to the lock being released. */
export const BACKUP_TIMEOUT_MS = 20 * 60 * 1000;

/**
 * A failure at one step. `safeMessage` is the only error text that may leave
 * the module: API responses, status, and logs all use it, never the raw cause.
 */
export class BackupStepError extends Error {
  constructor(
    readonly step: BackupStep,
    readonly safeMessage: string,
    readonly cause?: unknown,
  ) {
    super(safeMessage);
    this.name = 'BackupStepError';
  }
}

/** Thrown inside the storage adapter when the bucket cannot be reached or refuses a request. */
export class BackupStorageUnavailableError extends Error {
  constructor(message = 'Backup storage is unavailable') {
    super(message);
    this.name = 'BackupStorageUnavailableError';
  }
}

/** The reason an attempt's AbortController was aborted by the hard timeout. */
export class BackupTimeoutError extends Error {
  constructor() {
    super('Timed out after 20 minutes');
    this.name = 'BackupTimeoutError';
  }
}

export interface BackupAttemptRecord {
  recoveryPoint: string;
  startedAt: string;
  endedAt: string | null;
  result: 'succeeded' | 'failed';
  failedStep: BackupStep | null;
  /** Sanitised: a fixed phrase per step, never raw tool or SDK output. */
  error: string | null;
}

export interface BackupListItem {
  recoveryPoint: string;
  release: string;
  archiveSize: number;
  postgres: { serverMajor: number; clientMajor: number };
}

export interface MalformedBackupItem {
  recoveryPoint: string;
  reason: string;
}

/**
 * The storage view. `rpo` and `localCopy` are on both variants: when storage is
 * unreachable the RPO is "unknown", and the Local copy is still reported (#2115).
 */
export type BackupListResult =
  | {
      state: 'ok';
      backups: BackupListItem[];
      malformed: MalformedBackupItem[];
      /** Backups listed but not counted as Verified (unreleased). They never count towards the RPO. */
      unreleasedCount: number;
      rpo: RpoStatus;
      localCopy: LocalCopyStatus;
    }
  | { state: 'unavailable'; reason: string; rpo: RpoStatus; localCopy: LocalCopyStatus };

/** Hard limit for one retention pass, under the same lock as the Backup that triggered it (#2114). */
export const BACKUP_RETENTION_TIMEOUT_MS = 10 * 60 * 1000;

/** The part of a retention pass that failed. Each part is independent except the storage steps, which run in order. */
export type RetentionStep = 'settings' | 'local-copy' | 'list' | 'expire' | 'orphans' | 'unexpected';

/** The last retention pass. Shown separately from Backup results; a failure here never changes an attempt. */
export interface RetentionRecord {
  startedAt: string;
  endedAt: string;
  result: 'succeeded' | 'failed' | 'skipped';
  expiredBackups: number;
  orphanArchives: number;
  prunedLocalCopies: number;
  failedStep: RetentionStep | null;
  /** A fixed, safe phrase: never raw SDK or filesystem text. */
  message: string | null;
}

/** The last heartbeat round, sent after a Verified Backup (#2115). Never holds a URL. */
export interface HeartbeatRecord {
  recoveryPoint: string;
  sentAt: string;
  result: 'sent' | 'failed';
  /** A fixed phrase naming the failing variable and HTTP status or error name. Null when sent. */
  message: string | null;
}

/** Hard limit for one heartbeat ping. A ping is not part of the Backup result. */
export const HEARTBEAT_TIMEOUT_MS = 10 * 1000;
