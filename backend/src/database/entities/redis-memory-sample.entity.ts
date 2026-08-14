import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { safeIntegerTransformer } from '../transformers/safe-integer.transformer';

/**
 * One Redis memory sample. Append-only operational telemetry, pruned by
 * `DELETE` at the retention boundary.
 *
 * Deliberately does NOT extend BaseEntity: soft-delete semantics are wrong for
 * append-only rows that are hard-deleted by the pruner.
 */
@Entity('redis_memory_samples')
@Index(['instanceId', 'sampledAt'])
@Index(['sampledAt'])
export class RedisMemorySampleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  instanceId: string;

  @Column({ type: 'timestamptz' })
  sampledAt: Date;

  @Column({ type: 'boolean' })
  ok: boolean;

  @Column({ type: 'varchar', length: 32, nullable: true })
  failureReason: string | null;

  @Column({ type: 'bigint', nullable: true, transformer: safeIntegerTransformer })
  usedBytes: number | null;

  @Column({ type: 'bigint', nullable: true, transformer: safeIntegerTransformer })
  maxBytes: number | null;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true })
  utilizationPercent: number | null;

  @Column({ type: 'bigint', nullable: true, transformer: safeIntegerTransformer })
  evictedKeys: number | null;

  @Column({ type: 'bigint', nullable: true, transformer: safeIntegerTransformer })
  oomErrors: number | null;
}