import { recoveryPointTime } from './backup-manifest';

export interface RetentionCandidate {
  recoveryPoint: string;
  /** True when the Backup is a Verified Backup (complete, read back, Release known). */
  verified: boolean;
}

export interface RetentionPolicy {
  now: Date;
  windowHours: number;
  dailyCount: number;
  weeklyCount: number;
  monthlyCount: number;
}

export interface RetentionSelection {
  keep: string[];
  expire: string[];
}

const HOUR_MS = 60 * 60 * 1000;

/** ISO week of a recovery point, keyed by the UTC Monday that starts it. */
const weekKey = (recoveryPoint: string): string => {
  const date = recoveryPointTime(recoveryPoint);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - daysSinceMonday * 24 * HOUR_MS).toISOString().slice(0, 10);
};

/** UTC calendar month of a recovery point, as YYYY-MM. */
const monthKey = (recoveryPoint: string): string => dayKey(recoveryPoint).slice(0, 7);

/** UTC calendar day of a recovery point, as YYYY-MM-DD. */
const dayKey = (recoveryPoint: string): string => recoveryPointTime(recoveryPoint).toISOString().slice(0, 10);

/**
 * The newest Backup of each of the `count` most recent periods that hold any
 * Backup. Empty periods are skipped, so a gap never uses up a slot.
 * `newestFirst` must already be sorted newest first.
 */
function newestPerPeriod(newestFirst: readonly string[], periodOf: (rp: string) => string, count: number): string[] {
  const chosen: string[] = [];
  const seen = new Set<string>();
  for (const rp of newestFirst) {
    const period = periodOf(rp);
    if (seen.has(period)) continue;
    if (seen.size >= count) break;
    seen.add(period);
    chosen.push(rp);
  }
  return chosen;
}

/** Pure: decides which candidate Backups to keep under the policy. Performs no I/O. */
export function selectRetention(candidates: readonly RetentionCandidate[], policy: RetentionPolicy): RetentionSelection {
  const cutoff = policy.now.getTime() - policy.windowHours * HOUR_MS;
  const kept = new Set<string>();
  for (const candidate of candidates) {
    if (recoveryPointTime(candidate.recoveryPoint).getTime() >= cutoff) kept.add(candidate.recoveryPoint);
  }
  const newestVerified = candidates
    .filter((candidate) => candidate.verified)
    .map((candidate) => candidate.recoveryPoint)
    .sort()
    .at(-1);
  if (newestVerified !== undefined) kept.add(newestVerified);

  const verifiedNewestFirst = candidates
    .filter((candidate) => candidate.verified)
    .map((candidate) => candidate.recoveryPoint)
    .sort()
    .reverse();
  for (const rp of newestPerPeriod(verifiedNewestFirst, dayKey, policy.dailyCount)) kept.add(rp);
  for (const rp of newestPerPeriod(verifiedNewestFirst, weekKey, policy.weeklyCount)) kept.add(rp);
  for (const rp of newestPerPeriod(verifiedNewestFirst, monthKey, policy.monthlyCount)) kept.add(rp);

  const keep = candidates.map((c) => c.recoveryPoint).filter((rp) => kept.has(rp));
  const expire = candidates.map((c) => c.recoveryPoint).filter((rp) => !kept.has(rp));
  return { keep, expire };
}
