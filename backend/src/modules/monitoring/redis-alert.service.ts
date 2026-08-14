import { Injectable } from '@nestjs/common';
import { RedisPressureState } from './redis-memory.types';
import {
  OomAlert,
  PressureEpisode,
  REDIS_ALERT_EPISODE_CAPACITY,
  RedisAlertSeverity,
  RedisAlertView,
  RedisPressureStateEvent,
} from './redis-alert.types';

/**
 * Owns operator-visible alert state derived from sampler events.
 *
 * Holds state in process memory only — it never writes a Redis key, honouring
 * the diagnostic-only precedent set by `reportOrphanedSchedulers`. All state
 * resets on restart; durable retention is a separate slice.
 */
@Injectable()
export class RedisAlertService {
  private activeEpisode: PressureEpisode | null = null;
  private readonly episodes: PressureEpisode[] = [];
  private pressureState: RedisPressureState = 'insufficient-samples';

  /**
   * Called on every sample, not only on transitions: this service decides what
   * constitutes a change, keeping transition logic in one place.
   *
   * Idempotent by construction — an episode starts only when none is active
   * and recovers only on `healthy`, so `sustained-pressure -> unknown ->
   * sustained-pressure` continues one episode instead of duplicating it.
   */
  onPressureState(event: RedisPressureStateEvent): void {
    this.pressureState = event.state;

    if (event.state === 'sustained-pressure' && this.activeEpisode === null) {
      this.activeEpisode = {
        startedAt: event.at,
        recoveredAt: null,
        peakUtilizationPercent: event.utilizationPercent,
      };
      return;
    }

    if (event.state === 'healthy' && this.activeEpisode !== null) {
      this.activeEpisode.recoveredAt = event.at;
      this.episodes.push(this.activeEpisode);
      if (this.episodes.length > REDIS_ALERT_EPISODE_CAPACITY) {
        this.episodes.shift();
      }
      this.activeEpisode = null;
      return;
    }

    // `unknown` and `insufficient-samples` never start or recover an episode;
    // losing visibility is not recovery. Peak still updates from valid reads.
    if (this.activeEpisode !== null && event.utilizationPercent !== null) {
      const peak = this.activeEpisode.peakUtilizationPercent;
      if (peak === null || event.utilizationPercent > peak) {
        this.activeEpisode.peakUtilizationPercent = event.utilizationPercent;
      }
    }
  }

  getView(now: string = new Date().toISOString()): RedisAlertView {
    const active = this.activeEpisode !== null;
    const stale =
      active &&
      (this.pressureState === 'unknown' ||
        this.pressureState === 'insufficient-samples');

    return {
      pressure: {
        active,
        stale,
        currentEpisode: this.activeEpisode ? { ...this.activeEpisode } : null,
        recentEpisodes: this.episodes.map((episode) => ({ ...episode })),
        state: this.pressureState,
      },
      oom: this.emptyOomAlert(),
      severity: this.severity(active),
      generatedAt: now,
    };
  }

  private severity(pressureActive: boolean): RedisAlertSeverity {
    return pressureActive ? 'warning' : 'none';
  }

  private emptyOomAlert(): OomAlert {
    return {
      active: false,
      observedValue: null,
      acknowledgedValue: null,
      incidentStartedAt: null,
      lastIncreaseAt: null,
      unacknowledgedDelta: 0,
      lastAcknowledgedAt: null,
      lastAcknowledgedBy: null,
      lastAcknowledgedByLabel: null,
    };
  }
}
