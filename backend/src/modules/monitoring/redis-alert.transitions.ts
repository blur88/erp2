import { PersistedPressureEpisode } from '@/database/entities/redis-alert-state.entity';
import {
  REDIS_ALERT_EPISODE_CAPACITY,
  RedisAlertSeverity,
  RedisPressureStateEvent,
} from './redis-alert.types';
import { RedisPressureState } from './redis-memory.types';

/** The mutable fields of a persisted alert row, as a plain value. */
export interface AlertState {
  pressureState: RedisPressureState;
  activeEpisode: PersistedPressureEpisode | null;
  recentEpisodes: PersistedPressureEpisode[];
  oomBaselineValue: number | null;
  oomObservedValue: number | null;
  oomAcknowledgedValue: number | null;
  oomIncidentStartedAt: string | null;
  oomLastIncreaseAt: string | null;
  oomUnacknowledgedDelta: number;
  oomLastAcknowledgedAt: string | null;
  oomLastAcknowledgedBy: string | null;
  oomLastAcknowledgedByLabel: string | null;
}

export function emptyAlertState(): AlertState {
  return {
    pressureState: 'insufficient-samples',
    activeEpisode: null,
    recentEpisodes: [],
    oomBaselineValue: null,
    oomObservedValue: null,
    oomAcknowledgedValue: null,
    oomIncidentStartedAt: null,
    oomLastIncreaseAt: null,
    oomUnacknowledgedDelta: 0,
    oomLastAcknowledgedAt: null,
    oomLastAcknowledgedBy: null,
    oomLastAcknowledgedByLabel: null,
  };
}

/**
 * Idempotent by construction: an episode opens only when none is active and
 * recovers only on `healthy`, so `sustained-pressure -> unknown ->
 * sustained-pressure` continues one episode instead of duplicating it.
 * Losing visibility is not recovery.
 */
export function applyPressureState(
  state: AlertState,
  event: RedisPressureStateEvent,
): AlertState {
  const next: AlertState = { ...state, pressureState: event.state };

  if (event.state === 'sustained-pressure' && next.activeEpisode === null) {
    next.activeEpisode = {
      startedAt: event.at,
      recoveredAt: null,
      peakUtilizationPercent: event.utilizationPercent,
    };
    return next;
  }

  if (event.state === 'healthy' && next.activeEpisode !== null) {
    const closed = { ...next.activeEpisode, recoveredAt: event.at };
    const episodes = [...next.recentEpisodes, closed];
    next.recentEpisodes =
      episodes.length > REDIS_ALERT_EPISODE_CAPACITY
        ? episodes.slice(episodes.length - REDIS_ALERT_EPISODE_CAPACITY)
        : episodes;
    next.activeEpisode = null;
    return next;
  }

  if (next.activeEpisode !== null && event.utilizationPercent !== null) {
    const peak = next.activeEpisode.peakUtilizationPercent;
    if (peak === null || event.utilizationPercent > peak) {
      next.activeEpisode = {
        ...next.activeEpisode,
        peakUtilizationPercent: event.utilizationPercent,
      };
    }
  }
  return next;
}

/**
 * Applies a raw cumulative counter reading.
 *
 * Takes the RAW counter, never a process-local `kind`/`delta`: after a restart
 * the sampler's tracker emits `kind: 'baseline'` with `delta: 0` even when the
 * counter climbed during downtime, and a `RESETSTAT` during downtime also
 * arrives as `baseline`. Identity decides whether to baseline; this comparison
 * decides direction and magnitude.
 *
 * `isNewIdentity` comes from the INSERT's affected-row count inside the
 * transaction — never from an in-process cache.
 */
export function applyOomCounter(
  state: AlertState,
  rawCounter: number,
  at: string,
  isNewIdentity: boolean,
): AlertState {
  if (isNewIdentity || state.oomObservedValue === null) {
    // A counter belonging to a Redis we have never observed is not
    // attributable to this deployment.
    return { ...state, oomBaselineValue: rawCounter, oomObservedValue: rawCounter };
  }

  const previous = state.oomObservedValue;

  if (rawCounter === previous) {
    return state;
  }

  if (rawCounter < previous) {
    // CONFIG RESETSTAT (run_id is unchanged across it) or an unobserved
    // restart under the same identity. A stale-high watermark left in place
    // would suppress every later OOM until the counter climbed past it.
    return {
      ...state,
      oomBaselineValue: rawCounter,
      oomObservedValue: rawCounter,
      oomAcknowledgedValue: null,
      oomIncidentStartedAt: null,
      oomLastIncreaseAt: null,
      oomUnacknowledgedDelta: 0,
      oomLastAcknowledgedAt: null,
      oomLastAcknowledgedBy: null,
      oomLastAcknowledgedByLabel: null,
    };
  }

  const delta = rawCounter - previous;
  const opening = state.oomIncidentStartedAt === null;
  return {
    ...state,
    oomObservedValue: rawCounter,
    oomLastIncreaseAt: at,
    oomIncidentStartedAt: opening ? at : state.oomIncidentStartedAt,
    oomUnacknowledgedDelta: opening ? delta : state.oomUnacknowledgedDelta + delta,
    // A new incident supersedes a resolved acknowledgement, which must not
    // render beside a live alert.
    oomLastAcknowledgedAt: opening ? null : state.oomLastAcknowledgedAt,
    oomLastAcknowledgedBy: opening ? null : state.oomLastAcknowledgedBy,
    oomLastAcknowledgedByLabel: opening ? null : state.oomLastAcknowledgedByLabel,
  };
}

export function isOomActive(state: AlertState): boolean {
  if (state.oomObservedValue === null) {
    return false;
  }
  const watermark = state.oomAcknowledgedValue ?? state.oomBaselineValue ?? 0;
  return state.oomObservedValue > watermark;
}

export function severityFor(state: AlertState): RedisAlertSeverity {
  if (isOomActive(state)) {
    return 'critical';
  }
  return state.activeEpisode !== null ? 'warning' : 'none';
}