import { ConflictException, Injectable } from '@nestjs/common';
import { RedisPressureState } from './redis-memory.types';
import {
  OomAlert,
  PressureEpisode,
  REDIS_ALERT_EPISODE_CAPACITY,
  RedisAlertSeverity,
  RedisAlertView,
  RedisOomCounterEvent,
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
  private oomBaselineValue: number | null = null;
  private oomObservedValue: number | null = null;
  private oomAcknowledgedValue: number | null = null;
  private oomIncidentStartedAt: string | null = null;
  private oomLastIncreaseAt: string | null = null;
  private oomUnacknowledgedDelta = 0;
  private oomLastAcknowledgedAt: string | null = null;
  private oomLastAcknowledgedBy: string | null = null;
  private oomLastAcknowledgedByLabel: string | null = null;

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

  /**
   * Both directions matter. An increase-only stream cannot implement the
   * reset guard: a watermark from before a Redis restart or `CONFIG RESETSTAT`
   * would exceed every post-restart value and suppress all future alerts.
   */
  onOomCounter(event: RedisOomCounterEvent): void {
    this.oomObservedValue = event.value;

    if (event.kind === 'baseline') {
      // A counter already non-zero at startup predates this process and is
      // not attributable to the current run, so it must not alert.
      this.oomBaselineValue = event.value;
      return;
    }

    if (event.kind === 'reset') {
      this.oomBaselineValue = event.value;
      this.oomAcknowledgedValue = null;
      this.oomIncidentStartedAt = null;
      this.oomLastIncreaseAt = null;
      this.oomUnacknowledgedDelta = 0;
      this.oomLastAcknowledgedAt = null;
      this.oomLastAcknowledgedBy = null;
      this.oomLastAcknowledgedByLabel = null;
      return;
    }

    if (this.oomIncidentStartedAt === null) {
      // A new incident supersedes any resolved acknowledgement, which must not
      // render beside a live alert.
      this.oomIncidentStartedAt = event.at;
      this.oomUnacknowledgedDelta = event.delta;
      this.oomLastAcknowledgedAt = null;
      this.oomLastAcknowledgedBy = null;
      this.oomLastAcknowledgedByLabel = null;
    } else {
      this.oomUnacknowledgedDelta += event.delta;
    }
    this.oomLastIncreaseAt = event.at;
  }

  acknowledgeOom(
    observedValue: number,
    userId: string,
    userLabel: string | null,
    now: string = new Date().toISOString(),
  ): RedisAlertView {
    if (!this.isOomActive()) {
      throw new ConflictException('No active Redis OOM alert to acknowledge');
    }
    if (observedValue !== this.oomObservedValue) {
      // The counter moved between render and click; acknowledging blind here
      // would mark a newer, unseen OOM as handled.
      throw new ConflictException(
        'Redis OOM counter changed since it was read; re-read before acknowledging',
      );
    }

    this.oomAcknowledgedValue = observedValue;
    this.oomLastAcknowledgedAt = now;
    this.oomLastAcknowledgedBy = userId;
    this.oomLastAcknowledgedByLabel = userLabel;
    this.oomUnacknowledgedDelta = 0;
    this.oomIncidentStartedAt = null;
    return this.getView(now);
  }

  private isOomActive(): boolean {
    if (this.oomObservedValue === null) {
      return false;
    }
    const watermark = this.oomAcknowledgedValue ?? this.oomBaselineValue ?? 0;
    return this.oomObservedValue > watermark;
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
      oom: this.buildOomAlert(),
      severity: this.severity(active),
      generatedAt: now,
    };
  }

  private severity(pressureActive: boolean): RedisAlertSeverity {
    if (this.isOomActive()) {
      return 'critical';
    }
    return pressureActive ? 'warning' : 'none';
  }

  private buildOomAlert(): OomAlert {
    return {
      active: this.isOomActive(),
      observedValue: this.oomObservedValue,
      acknowledgedValue: this.oomAcknowledgedValue,
      incidentStartedAt: this.oomIncidentStartedAt,
      lastIncreaseAt: this.oomLastIncreaseAt,
      unacknowledgedDelta: this.oomUnacknowledgedDelta,
      lastAcknowledgedAt: this.oomLastAcknowledgedAt,
      lastAcknowledgedBy: this.oomLastAcknowledgedBy,
      lastAcknowledgedByLabel: this.oomLastAcknowledgedByLabel,
    };
  }
}
