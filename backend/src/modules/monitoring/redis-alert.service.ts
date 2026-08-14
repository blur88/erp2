import { ConflictException, Injectable } from '@nestjs/common';
import {
  OomAlert,
  RedisAlertUnavailableReason,
  RedisAlertView,
  RedisPressureStateEvent,
} from './redis-alert.types';
import { RedisAlertStateRepository } from './redis-alert-state.repository';
import {
  AlertState,
  applyOomCounter,
  applyPressureState,
  isOomActive,
  severityFor,
} from './redis-alert.transitions';

/** One tick's worth of state, applied under a single lock. */
export interface ApplySampleInput {
  pressure: RedisPressureStateEvent;
  /** Raw cumulative OOM counter; null when the read failed or the sample failed. */
  rawOomCounter: number | null;
  at: string;
}

/**
 * Alert state lives in Postgres, not in this process.
 *
 * A `null` runId means Redis identity could not be read: no durable state can
 * be safely keyed or rebased, so the transition is skipped and reads report
 * `unavailable` rather than serving a row we cannot confirm belongs to the
 * Redis we are talking to.
 */
@Injectable()
export class RedisAlertService {
  constructor(private readonly repository: RedisAlertStateRepository) {}

  /**
   * Applies one tick's pressure state and counter reading in ONE locked
   * read-modify-write cycle.
   *
   * Deliberately a single method rather than two: separate calls would open
   * two transactions per tick, so a failure between them leaves the row with
   * the pressure transition applied and the counter transition not — a
   * partial update of state that is meant to describe one instant. It also
   * doubles the lock acquisitions for no benefit.
   */
  async applySample(input: ApplySampleInput, runId: string | null): Promise<void> {
    if (runId === null) {
      // No identity: no durable state can be safely keyed or rebased.
      return;
    }
    await this.repository.mutate(runId, (state, isNewIdentity) => {
      let next = applyPressureState(state, input.pressure);
      if (input.rawOomCounter !== null) {
        next = applyOomCounter(next, input.rawOomCounter, input.at, isNewIdentity);
      }
      return next;
    });
  }

  async acknowledgeOom(
    observedValue: number,
    userId: string,
    userLabel: string | null,
    runId: string | null,
    now: string = new Date().toISOString(),
  ): Promise<RedisAlertView> {
    if (runId === null) {
      // Acknowledging an alert whose current value cannot be confirmed is
      // exactly the blind acknowledgement the mismatch check prevents.
      throw new ConflictException('Redis identity unavailable; cannot acknowledge');
    }

    const next = await this.repository.mutate(runId, (state) => {
      if (!isOomActive(state)) {
        throw new ConflictException('No active Redis OOM alert to acknowledge');
      }
      if (observedValue !== state.oomObservedValue) {
        // The counter moved between render and click; acknowledging blind
        // here would mark a newer, unseen OOM as handled.
        throw new ConflictException(
          'Redis OOM counter changed since it was read; re-read before acknowledging',
        );
      }
      return {
        ...state,
        oomAcknowledgedValue: observedValue,
        oomLastAcknowledgedAt: now,
        oomLastAcknowledgedBy: userId,
        oomLastAcknowledgedByLabel: userLabel,
        oomUnacknowledgedDelta: 0,
        oomIncidentStartedAt: null,
      };
    });

    return this.viewOf(next, now);
  }

  async getView(
    runId: string | null,
    unavailableReason: RedisAlertUnavailableReason | null,
    now: string = new Date().toISOString(),
  ): Promise<RedisAlertView> {
    if (runId === null) {
      return this.unavailableView(unavailableReason ?? 'redis-identity-unknown', now);
    }
    try {
      const state = await this.repository.read(runId);
      if (state === null) {
        return this.unavailableView('storage-unavailable', now);
      }
      return this.viewOf(state, now);
    } catch {
      return this.unavailableView('storage-unavailable', now);
    }
  }

  private unavailableView(
    reason: RedisAlertUnavailableReason,
    now: string,
  ): RedisAlertView {
    return {
      pressure: null,
      oom: null,
      severity: 'unavailable',
      unavailableReason: reason,
      generatedAt: now,
    };
  }

  private viewOf(state: AlertState, now: string): RedisAlertView {
    const active = state.activeEpisode !== null;
    return {
      pressure: {
        active,
        stale:
          active &&
          (state.pressureState === 'unknown' ||
            state.pressureState === 'insufficient-samples'),
        currentEpisode: state.activeEpisode ? { ...state.activeEpisode } : null,
        recentEpisodes: state.recentEpisodes.map((episode) => ({ ...episode })),
        state: state.pressureState,
      },
      oom: this.oomAlert(state),
      severity: severityFor(state),
      unavailableReason: null,
      generatedAt: now,
    };
  }

  private oomAlert(state: AlertState): OomAlert {
    return {
      active: isOomActive(state),
      observedValue: state.oomObservedValue,
      acknowledgedValue: state.oomAcknowledgedValue,
      incidentStartedAt: state.oomIncidentStartedAt,
      lastIncreaseAt: state.oomLastIncreaseAt,
      unacknowledgedDelta: state.oomUnacknowledgedDelta,
      lastAcknowledgedAt: state.oomLastAcknowledgedAt,
      lastAcknowledgedBy: state.oomLastAcknowledgedBy,
      lastAcknowledgedByLabel: state.oomLastAcknowledgedByLabel,
    };
  }
}