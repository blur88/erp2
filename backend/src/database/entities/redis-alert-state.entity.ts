import { Column, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { safeIntegerTransformer } from '../transformers/safe-integer.transformer';

/** Bounded episode history entry, stored as jsonb. */
export interface PersistedPressureEpisode {
  startedAt: string;
  recoveredAt: string | null;
  peakUtilizationPercent: number | null;
}

/**
 * Alert state for one Redis identity (`run_id`).
 *
 * Deliberately has NO instance_id: the watermark is a fact about Redis, not
 * about the backend. An OOM acknowledged on one instance must stay
 * acknowledged on every other.
 *
 * A restarted Redis presents a new run_id and therefore gets a NEW row; the
 * old row is retained and never consulted again. Nothing is ever "cleared".
 */
@Entity('redis_alert_state')
@Unique(['redisRunId'])
export class RedisAlertStateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  redisRunId: string;

  @Column({ type: 'varchar', length: 32, default: 'insufficient-samples' })
  pressureState: string;

  @Column({ type: 'jsonb', nullable: true })
  activeEpisode: PersistedPressureEpisode | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  recentEpisodes: PersistedPressureEpisode[];

  @Column({ type: 'bigint', nullable: true, transformer: safeIntegerTransformer })
  oomBaselineValue: number | null;

  @Column({ type: 'bigint', nullable: true, transformer: safeIntegerTransformer })
  oomObservedValue: number | null;

  @Column({ type: 'bigint', nullable: true, transformer: safeIntegerTransformer })
  oomAcknowledgedValue: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  oomIncidentStartedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  oomLastIncreaseAt: Date | null;

  @Column({ type: 'bigint', default: 0, transformer: safeIntegerTransformer })
  oomUnacknowledgedDelta: number;

  @Column({ type: 'timestamptz', nullable: true })
  oomLastAcknowledgedAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  oomLastAcknowledgedBy: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  oomLastAcknowledgedByLabel: string | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}