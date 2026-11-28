import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import {
  archiveKeyFor,
  ARCHIVE_NAME,
  BACKUPS_PREFIX,
  isRecoveryPoint,
  MANIFEST_NAME,
  manifestKeyFor,
  recoveryPointTime,
  UNRELEASED,
} from './backup-manifest';
import { listStoredBackups, StorageListing } from './backup-listing';
import { RetentionCandidate, selectRetention } from './backup-retention';
import type { StoredBackupSettings } from './backup-settings.service';
import { BackupStorage, StoredObject } from './backup-storage';
import { BackupStorageUnavailableError, RetentionRecord, RetentionStep } from './backup.types';

/** Archives with no manifest for longer than this are deleted, judged by LastModified (#2114). */
export const ORPHAN_ARCHIVE_AGE_MS = 24 * 60 * 60 * 1000;
/** Local copies older than this, judged by their recovery point, are pruned (#2114). */
export const LOCAL_COPY_AGE_MS = 24 * 60 * 60 * 1000;

export interface RetentionPassDeps {
  storage: BackupStorage;
  localCopyDir: string;
  /** Reads the stored settings. Retention runs only when they are valid. */
  readSettings: () => Promise<StoredBackupSettings>;
  now: () => Date;
}

/**
 * One retention pass. It never throws: every outcome is in the returned record.
 * Storage deletions stop at the first failure, which leaves a state the next pass
 * can finish: an expired Backup's manifest goes first, so a half-deleted Backup is
 * an orphan archive, never a listed Backup without its archive.
 */
export async function runRetentionPass(deps: RetentionPassDeps, signal: AbortSignal): Promise<RetentionRecord> {
  const startedAt = deps.now();
  const counts = { expiredBackups: 0, orphanArchives: 0, prunedLocalCopies: 0 };
  let failure: { step: RetentionStep; message: string } | null = null;
  const finish = (result: RetentionRecord['result'], message: string | null = null): RetentionRecord => ({
    startedAt: startedAt.toISOString(),
    endedAt: deps.now().toISOString(),
    result,
    ...counts,
    failedStep: failure?.step ?? null,
    message: failure?.message ?? message,
  });

  let stored: StoredBackupSettings;
  try {
    stored = await deps.readSettings();
  } catch {
    failure = { step: 'settings', message: 'Backup settings could not be read' };
    return finish('failed');
  }
  if (stored.state !== 'valid') {
    return finish('skipped', 'Backup settings are missing or invalid, so retention was skipped');
  }
  const settings = stored.settings;
  const now = deps.now();

  // Local copies need no network, so a storage failure below does not stop them.
  try {
    counts.prunedLocalCopies = await pruneLocalCopies(deps.localCopyDir, now);
  } catch {
    failure ??= { step: 'local-copy', message: 'Local copies could not be pruned' };
  }

  let listing: StorageListing | null = null;
  try {
    listing = await listStoredBackups(deps.storage, signal);
  } catch (error) {
    failure ??= { step: 'list', message: storageMessage(error, signal) };
  }
  if (!listing) return finish(failure ? 'failed' : 'succeeded');

  const candidates: RetentionCandidate[] = listing.backups.map((backup) => ({
    recoveryPoint: backup.recoveryPoint,
    verified: backup.release !== UNRELEASED,
  }));
  const { expire } = selectRetention(candidates, {
    now,
    windowHours: settings.retentionWindowHours,
    dailyCount: settings.retentionDailyCount,
    weeklyCount: settings.retentionWeeklyCount,
    monthlyCount: settings.retentionMonthlyCount,
  });

  try {
    for (const recoveryPoint of [...expire].sort()) {
      throwIfAborted(signal);
      // Manifest first: once it is gone the Backup is no longer listed.
      await deps.storage.delete(manifestKeyFor(recoveryPoint), signal);
      await deps.storage.delete(archiveKeyFor(recoveryPoint), signal);
      counts.expiredBackups += 1;
    }
  } catch (error) {
    failure ??= { step: 'expire', message: storageMessage(error, signal, 'Expired Backups could not be deleted') };
    return finish('failed');
  }

  try {
    counts.orphanArchives = await deleteOrphanArchives(deps.storage, listing.objects, now, signal);
  } catch (error) {
    failure ??= { step: 'orphans', message: storageMessage(error, signal, 'Abandoned archives could not be deleted') };
  }
  return finish(failure ? 'failed' : 'succeeded');
}

/**
 * Deletes archives whose prefix has no manifest and whose LastModified is more than
 * 24 hours old. Only exact `backups/<recovery point>/backup.tar.age` keys qualify. A
 * manifest that is present but malformed still counts as present. Before each delete,
 * the manifest is checked again with HEAD, which fails closed on any error.
 */
async function deleteOrphanArchives(
  storage: BackupStorage,
  objects: readonly StoredObject[],
  now: Date,
  signal: AbortSignal,
): Promise<number> {
  const manifests = new Set<string>();
  const archives = new Map<string, StoredObject>();
  for (const object of objects) {
    const parts = object.key.slice(BACKUPS_PREFIX.length).split('/');
    if (parts.length !== 2 || !isRecoveryPoint(parts[0])) continue;
    if (parts[1] === MANIFEST_NAME) manifests.add(parts[0]);
    if (parts[1] === ARCHIVE_NAME) archives.set(parts[0], object);
  }

  let deleted = 0;
  for (const recoveryPoint of [...archives.keys()].sort()) {
    if (manifests.has(recoveryPoint)) continue;
    const archive = archives.get(recoveryPoint)!;
    if (archive.lastModified === null) continue; // no age, no deletion
    if (now.getTime() - archive.lastModified.getTime() <= ORPHAN_ARCHIVE_AGE_MS) continue;
    throwIfAborted(signal);
    if ((await storage.head(manifestKeyFor(recoveryPoint), signal)) !== null) continue;
    await storage.delete(archiveKeyFor(recoveryPoint), signal);
    deleted += 1;
  }
  return deleted;
}

/**
 * Removes local copies whose recovery point is older than 24 hours. The name must be a
 * recovery point and the resolved path must be a direct child of the local copy
 * directory; symlinks and non-directories are skipped, and `.tmp` never matches.
 */
export async function pruneLocalCopies(localCopyDir: string, now: Date): Promise<number> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fsp.readdir(localCopyDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return 0;
    throw error;
  }
  const cutoff = now.getTime() - LOCAL_COPY_AGE_MS;
  let pruned = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || !isRecoveryPoint(entry.name)) continue;
    if (recoveryPointTime(entry.name).getTime() >= cutoff) continue;
    await fsp.rm(localCopyPathFor(localCopyDir, entry.name), { recursive: true, force: true });
    pruned += 1;
  }
  return pruned;
}

/** The only path that pruning may remove: `<localCopyDir>/<recovery point>`. Throws for anything else. */
export function localCopyPathFor(localCopyDir: string, name: string): string {
  if (!isRecoveryPoint(name)) throw new Error('refusing to prune a name that is not a recovery point');
  const root = path.resolve(localCopyDir);
  const target = path.join(root, name);
  if (path.dirname(target) !== root || path.basename(target) !== name) {
    throw new Error('refusing to prune outside the local copy directory');
  }
  return target;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason ?? new Error('Retention was cancelled');
}

/** Storage errors keep only their fixed phrases. A cancelled pass reports the timeout instead. */
function storageMessage(error: unknown, signal: AbortSignal, fallback = 'Backup storage could not be read'): string {
  if (signal.aborted) return 'Retention timed out or was cancelled';
  if (error instanceof BackupStorageUnavailableError) return 'Backup storage is unavailable';
  return fallback;
}
