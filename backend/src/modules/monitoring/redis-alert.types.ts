import { RedisPressureState } from './redis-memory.types';

/** Bounded episode history. Oldest evicted first. */
export const REDIS_ALERT_EPISODE_CAPACITY = 20;

export type RedisAlertSeverity = 'none' | 'warning' | 'critical';

export interface PressureEpisode {
  startedAt: string;
  recoveredAt: string | null;
  /** Max non-null utilization observed during the episode; null if none was. */
  peakUtilizationPercent: number | null;
}

/**
 * An OOM incident is one unacknowledged run of counter increases. It opens on
 * the first increase above the current watermark, accumulates further
 * increases, and closes on acknowledgement. A later increase opens a NEW
 * incident with a fresh `incidentStartedAt`.
 */
export interface OomAlert {
  active: boolean;
  observedValue: number | null;
  acknowledgedValue: number | null;
  incidentStartedAt: string | null;
  lastIncreaseAt: string | null;
  /** Errors above the current watermark only — never includes acknowledged ones. */
  unacknowledgedDelta: number;
  lastAcknowledgedAt: string | null;
  /** Stable user ID — attribution of record. */
  lastAcknowledgedBy: string | null;
  /** Display name captured at ack time; avoids a user lookup at render. */
  lastAcknowledgedByLabel: string | null;
}

export interface RedisAlertView {
  pressure: {
    active: boolean;
    /**
     * Active episode, but state is `unknown` OR `insufficient-samples` — no
     * live confirmation of the current reading.
     */
    stale: boolean;
    currentEpisode: PressureEpisode | null;
    recentEpisodes: PressureEpisode[];
    state: RedisPressureState;
  };
  oom: OomAlert;
  severity: RedisAlertSeverity;
  generatedAt: string;
}

export interface RedisPressureStateEvent {
  state: RedisPressureState;
  /** null for failed or uncapped samples. */
  utilizationPercent: number | null;
  at: string;
}

export interface RedisOomCounterEvent {
  previousValue: number | null;
  value: number;
  /** 0 for 'baseline' and 'reset'. */
  delta: number;
  kind: 'baseline' | 'increase' | 'reset';
  at: string;
}
