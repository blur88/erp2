import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import { Readable } from 'node:stream';
import * as path from 'node:path';
import type { DataSource, QueryRunner } from 'typeorm';
import { CompanySettings } from '../../database/entities/company-settings.entity';
import { PrintSettings } from '../../database/entities/print-settings.entity';
import { PostgresClientStatus } from '../postgres-client/postgres-client-status.service';
import { BackupConfig } from './backup.config';
import {
  ARCHIVE_NAME,
  archiveKeyFor,
  buildManifest,
  BackupManifest,
  manifestKeyFor,
  MANIFEST_NAME,
} from './backup-manifest';
import { BackupStorage } from './backup-storage';
import { ProcessRunner } from './backup-process-runner';
import { BackupStep, BackupStepError } from './backup.types';

export interface BackupAttemptDeps {
  dataSource: Pick<DataSource, 'createQueryRunner'>;
  /** Re-runs the PostgreSQL major-version check and returns its status (#2110). */
  versionCheck: () => Promise<PostgresClientStatus>;
  runner: ProcessRunner;
  storage: BackupStorage;
  config: BackupConfig;
  /** Environment for pg_dump, pg_dumpall and pg_restore. */
  toolEnv: NodeJS.ProcessEnv;
  /** The application database role, which must appear in the globals. */
  appRole: string;
  /** Directory served at /uploads/, read at the time of the attempt. */
  uploadsDir: string;
  release: string;
}

export interface BackupAttemptResult {
  recoveryPoint: string;
  manifest: BackupManifest;
}

const LOCAL_UPLOAD_PREFIX = '/uploads/';
const SNAPSHOT_ID = /^[0-9A-F]+-[0-9A-F]+-\d+$/;

/**
 * Runs one Backup attempt in the spec's order (#2111). Every awaited operation
 * settles before this function returns or throws, so a caller that releases the
 * lock afterwards knows no child process or storage request is still running.
 * On failure no manifest has been published.
 */
export async function runBackupAttempt(
  deps: BackupAttemptDeps,
  recoveryPoint: string,
  signal: AbortSignal,
): Promise<BackupAttemptResult> {
  const { config, runner, storage, toolEnv } = deps;
  const localDir = path.join(config.localCopyDir, recoveryPoint);
  let localDirCreated = false;
  let currentStep: BackupStep = 'prepare';
  let attemptDir = '';

  /** Runs one step. Errors leave as BackupStepError with a fixed, safe message. */
  const enter = async <T>(step: BackupStep, safeMessage: string, work: () => Promise<T>): Promise<T> => {
    currentStep = step;
    if (signal.aborted) throw abortFailure(step, signal);
    try {
      return await work();
    } catch (error) {
      if (error instanceof BackupStepError) throw error;
      if (signal.aborted) throw abortFailure(step, signal, error);
      throw new BackupStepError(step, safeMessage, error);
    }
  };

  try {
    attemptDir = await enter('prepare', 'Could not create the temporary directory', () =>
      prepareAttemptDir(config.localCopyDir, recoveryPoint),
    );

    // 1. Version check, before any dump.
    const status = await enter('version-check', 'The PostgreSQL version check could not complete', () =>
      deps.versionCheck(),
    );
    if (status.state === 'mismatch') {
      throw new BackupStepError('version-check', 'The PostgreSQL client and server major versions do not match');
    }
    if (status.state !== 'compatible') {
      throw new BackupStepError('version-check', 'The PostgreSQL version check could not complete');
    }

    // 2 and 3. Snapshot transaction, references, and the dump inside it.
    const queryRunner = deps.dataSource.createQueryRunner();
    let references: string[] = [];
    const dumpPath = path.join(attemptDir, 'erp_db.dump');
    try {
      const snapshotId = await enter('snapshot', 'Could not export a consistent database snapshot', async () => {
        await queryRunner.connect();
        await queryRunner.startTransaction('REPEATABLE READ');
        const rows = await queryRunner.query('SELECT pg_export_snapshot() AS id');
        const id = String(rows?.[0]?.id ?? '');
        if (!SNAPSHOT_ID.test(id)) throw new Error('unexpected snapshot identifier');
        return id;
      });

      references = await enter('snapshot', 'Could not read the upload references', () =>
        readUploadReferences(queryRunner),
      );

      await enter('dump', 'pg_dump failed', () =>
        runner.run(
          {
            command: 'pg_dump',
            args: ['--format=custom', `--snapshot=${snapshotId}`],
            env: toolEnv,
            stdoutPath: dumpPath,
          },
          signal,
        ),
      );

      await enter('snapshot', 'Could not close the snapshot transaction', () => queryRunner.commitTransaction());
    } finally {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction().catch(() => undefined);
      }
      await queryRunner.release().catch(() => undefined);
    }

    // 4. Globals.
    const globalsPath = path.join(attemptDir, 'globals.sql');
    await enter('globals', 'pg_dumpall --globals-only failed', () =>
      runner.run({ command: 'pg_dumpall', args: ['--globals-only'], env: toolEnv, stdoutPath: globalsPath }, signal),
    );

    // 5. Uploads archive. A missing uploads directory is an empty archive.
    const uploadsTarPath = path.join(attemptDir, 'uploads.tar');
    const uploadsSource = (await isDirectory(deps.uploadsDir))
      ? deps.uploadsDir
      : await makeEmptyDir(attemptDir);
    await enter('uploads-archive', 'Could not archive the uploads directory', () =>
      runner.run(
        { command: 'tar', args: ['-cf', '-', '-C', uploadsSource, '.'], stdoutPath: uploadsTarPath },
        signal,
      ),
    );

    // 6, 7, 8. Checks.
    await enter('checks', 'A referenced upload is missing from the uploads archive', async () => {
      const listing = await runner.run(
        { command: 'tar', args: ['-tf', uploadsTarPath], captureStdout: true },
        signal,
      );
      const entries = new Set(
        listing.stdout
          .split('\n')
          .map(normaliseTarEntry)
          .filter((entry) => entry.length > 0),
      );
      const missing = references.filter((entry) => !entries.has(entry));
      if (missing.length > 0) throw new Error('reference missing from archive');
    });

    await enter('checks', 'The database dump could not be read by pg_restore', () =>
      runner.run(
        { command: 'pg_restore', args: ['--exit-on-error', '--file=/dev/null', dumpPath], env: toolEnv },
        signal,
      ),
    );

    await enter('checks', 'The application role is missing from the globals', async () => {
      const globals = await fsp.readFile(globalsPath, 'utf8');
      if (!hasRoleStatement(globals, deps.appRole)) throw new Error('role missing from globals');
    });

    // 9. Package the three parts once, then encrypt. The plaintext is removed here.
    const tarPath = path.join(attemptDir, 'backup.tar');
    await enter('encrypt', 'Could not package the backup', () =>
      runner.run(
        {
          command: 'tar',
          args: ['-cf', '-', '-C', attemptDir, 'erp_db.dump', 'globals.sql', 'uploads.tar'],
          stdoutPath: tarPath,
        },
        signal,
      ),
    );
    const archivePath = path.join(attemptDir, ARCHIVE_NAME);
    await enter('encrypt', 'Encryption with age failed', () =>
      runner.run(
        { command: 'age', args: ['-r', config.ageRecipient, '-o', archivePath, tarPath] },
        signal,
      ),
    );
    await removeFiles(attemptDir, ['erp_db.dump', 'globals.sql', 'uploads.tar', 'backup.tar']);

    const archive = await enter('encrypt', 'Could not read the encrypted archive', () => hashFile(archivePath));

    // 10. Local copy, outside .tmp/.
    await enter('local-copy', 'Could not move the encrypted archive into the local copy', async () => {
      await fsp.mkdir(localDir, { recursive: true, mode: 0o700 });
      localDirCreated = true;
      await fsp.rename(archivePath, path.join(localDir, ARCHIVE_NAME));
    });
    const localArchive = path.join(localDir, ARCHIVE_NAME);

    // 11. Upload. An existing prefix is never overwritten.
    const archiveKey = archiveKeyFor(recoveryPoint);
    const manifestKey = manifestKeyFor(recoveryPoint);
    await enter('upload', 'Upload to storage failed', async () => {
      const existing = (await storage.head(archiveKey, signal)) ?? (await storage.head(manifestKey, signal));
      if (existing) throw new BackupStepError('upload', 'The backup prefix already exists in storage');
      await storage.put(archiveKey, fs.createReadStream(localArchive), archive.size, signal);
    });

    // 12. Read back and compare.
    await enter('read-back', 'Read-back from storage failed', async () => {
      const body = await storage.get(archiveKey, signal);
      const hash = createHash('sha256');
      let size = 0;
      for await (const chunk of body) {
        hash.update(chunk as Buffer);
        size += (chunk as Buffer).length;
      }
      if (size !== archive.size || hash.digest('hex') !== archive.sha256) {
        throw new BackupStepError('read-back', 'Read-back did not match the encrypted archive');
      }
    });

    // 13. Manifest, uploaded last.
    const manifest = buildManifest({
      recoveryPoint,
      release: deps.release,
      serverMajor: status.serverMajor,
      clientMajor: status.clientMajor,
      archiveSize: archive.size,
      archiveSha256: archive.sha256,
      ageRecipient: config.ageRecipient,
    });
    const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
    const manifestBytes = Buffer.byteLength(manifestText, 'utf8');
    await enter('manifest', 'Writing the manifest failed', async () => {
      await fsp.writeFile(path.join(localDir, MANIFEST_NAME), manifestText, { mode: 0o600 });
      await storage.put(manifestKey, Readable.from([Buffer.from(manifestText, 'utf8')]), manifestBytes, signal);
    });

    // 14. The manifest must be visible in storage.
    await enter('publish', 'The manifest could not be confirmed in storage', async () => {
      const head = await storage.head(manifestKey, signal);
      if (!head || head.size !== manifestBytes) {
        throw new BackupStepError('publish', 'The manifest could not be confirmed in storage');
      }
    });

    return { recoveryPoint, manifest };
  } catch (error) {
    if (localDirCreated) {
      // Best effort: a failed attempt keeps no local copy. Any failure to
      // remove it is left for the retention pass, which is not in this ticket.
      await fsp.rm(localDir, { recursive: true, force: true }).catch(() => undefined);
    }
    if (error instanceof BackupStepError) throw error;
    throw new BackupStepError(currentStep, 'Unexpected error during the Backup', error);
  } finally {
    if (attemptDir) await fsp.rm(attemptDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Upload references from the snapshot: every company and print logo that is a
 * local /uploads/ path, including soft-deleted rows, as archive entries.
 */
export async function readUploadReferences(queryRunner: QueryRunner): Promise<string[]> {
  const companies = await queryRunner.manager.find(CompanySettings, { withDeleted: true });
  const prints = await queryRunner.manager.find(PrintSettings, { withDeleted: true });
  const entries = new Set<string>();
  for (const row of [...companies, ...prints] as Array<{ logoUrl?: string | null }>) {
    const entry = referenceToEntry(row.logoUrl ?? '');
    if (entry) entries.add(entry);
  }
  return [...entries];
}

/** `/uploads/logos/a.png` -> `logos/a.png`. Null for empty or external values. */
export function referenceToEntry(logoUrl: string): string | null {
  if (!logoUrl || !logoUrl.startsWith(LOCAL_UPLOAD_PREFIX)) return null;
  const segments = logoUrl.slice(LOCAL_UPLOAD_PREFIX.length).split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new BackupStepError('snapshot', 'An upload reference is not a valid path');
  }
  return segments.join('/');
}

/** `tar -tf` prints `./logos/a.png`, and directories end in `/`. */
export function normaliseTarEntry(line: string): string {
  return line.trim().replace(/^\.\//, '').replace(/\/$/, '');
}

/** Whether pg_dumpall's globals create the role, quoted the way pg_dumpall quotes it. */
export function hasRoleStatement(globals: string, role: string): boolean {
  if (!role) return false;
  const name = /^[a-z_][a-z0-9_]*$/.test(role) ? role : `"${role.replace(/"/g, '""')}"`;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^CREATE ROLE ${escaped};$`, 'm').test(globals);
}

async function prepareAttemptDir(localCopyDir: string, recoveryPoint: string): Promise<string> {
  const tmpRoot = path.join(localCopyDir, '.tmp');
  await fsp.mkdir(tmpRoot, { recursive: true, mode: 0o700 });
  const attemptDir = path.join(tmpRoot, recoveryPoint);
  await fsp.mkdir(attemptDir, { mode: 0o700 });
  await fsp.chmod(attemptDir, 0o700);
  return attemptDir;
}

async function makeEmptyDir(parent: string): Promise<string> {
  const dir = path.join(parent, 'empty-uploads');
  await fsp.mkdir(dir, { mode: 0o700 });
  return dir;
}

async function isDirectory(dir: string): Promise<boolean> {
  try {
    return (await fsp.stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

async function hashFile(filePath: string): Promise<{ size: number; sha256: string }> {
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of fs.createReadStream(filePath)) {
    hash.update(chunk as Buffer);
    size += (chunk as Buffer).length;
  }
  return { size, sha256: hash.digest('hex') };
}

async function removeFiles(dir: string, names: string[]): Promise<void> {
  await Promise.all(names.map((name) => fsp.rm(path.join(dir, name), { force: true })));
}

function abortFailure(step: BackupStep, signal: AbortSignal, cause?: unknown): BackupStepError {
  const reason = signal.reason instanceof Error ? signal.reason.message : 'Backup was cancelled';
  return new BackupStepError(step, reason, cause);
}
