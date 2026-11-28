import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { ARCHIVE_NAME, isRecoveryPoint, recoveryPointTime } from './backup-manifest';

/** Age at which the RPO state moves from Healthy to Warning (#2115). */
export const RPO_WARNING_MINUTES = 45;
/** Age at which the RPO state becomes an RPO breach (#2115). */
export const RPO_BREACH_MINUTES = 60;

export type RpoState = 'healthy' | 'warning' | 'breach' | 'unknown';

export interface RpoStatus {
  state: RpoState;
  /** Whole minutes since the newest Verified Backup's Recovery point. Null when unknown. */
  ageMinutes: number | null;
  /** The Recovery point the RPO is measured from. Null when no Verified Backup exists. */
  recoveryPoint: string | null;
}

const MINUTE_MS = 60_000;

/**
 * Pure: the RPO state from the newest Verified Backup's Recovery point, read on
 * the backend's clock (the same clock the lockout rules use). A missing
 * Verified Backup, or a Recovery point in the future, gives "unknown", because
 * no age can be established from it.
 */
export function computeRpo(newestVerifiedRecoveryPoint: string | null, now: Date): RpoStatus {
  if (newestVerifiedRecoveryPoint === null) {
    return { state: 'unknown', ageMinutes: null, recoveryPoint: null };
  }
  const ageMs = now.getTime() - recoveryPointTime(newestVerifiedRecoveryPoint).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) {
    return { state: 'unknown', ageMinutes: null, recoveryPoint: newestVerifiedRecoveryPoint };
  }
  const ageMinutes = Math.floor(ageMs / MINUTE_MS);
  let state: RpoState;
  if (ageMs < RPO_WARNING_MINUTES * MINUTE_MS) state = 'healthy';
  else if (ageMs < RPO_BREACH_MINUTES * MINUTE_MS) state = 'warning';
  else state = 'breach';
  return { state, ageMinutes, recoveryPoint: newestVerifiedRecoveryPoint };
}

/** The Local copy, which never counts as an off-host Backup. `unconfigured` is decided by the service. */
export type LocalCopyStatus =
  | { state: 'unconfigured' }
  | { state: 'present'; recoveryPoint: string }
  | { state: 'absent'; recoveryPoint: null }
  | { state: 'unavailable'; recoveryPoint: null };

/**
 * Reads the local copy directory. A complete local copy is a recovery-point
 * directory holding an archive. A missing directory is "absent"; any other read
 * failure is "unavailable", never silently absent.
 */
export async function readLocalCopy(localCopyDir: string): Promise<Exclude<LocalCopyStatus, { state: 'unconfigured' }>> {
  let entries;
  try {
    entries = await fsp.readdir(localCopyDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return { state: 'absent', recoveryPoint: null };
    return { state: 'unavailable', recoveryPoint: null };
  }
  const complete: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !isRecoveryPoint(entry.name)) continue;
    try {
      await fsp.access(path.join(localCopyDir, entry.name, ARCHIVE_NAME));
      complete.push(entry.name);
    } catch {
      // Not a complete local copy.
    }
  }
  const newest = complete.sort().at(-1);
  return newest === undefined ? { state: 'absent', recoveryPoint: null } : { state: 'present', recoveryPoint: newest };
}
