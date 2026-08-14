import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, LessThan } from 'typeorm';
import { RedisMemorySampleEntity } from '@/database/entities/redis-memory-sample.entity';
import {
  REDIS_PRUNE_BATCH_SIZE,
  REDIS_PRUNE_MAX_BATCHES,
  REDIS_SAMPLE_RETENTION_DAYS,
} from './redis-memory.types';

/**
 * Deletes samples past the retention boundary in bounded batches.
 *
 * Each batch commits independently. One transaction around the whole loop
 * would hold locks and accumulate dead tuples for the entire run, and a
 * failure at the end would discard all completed work; independent commits let
 * a long-neglected table drain incrementally and keep progress on failure.
 */
@Injectable()
export class RedisMemorySamplePruneService {
  constructor(
    private readonly dataSource: DataSource,
    @Optional()
    private readonly logger: Logger = new Logger(RedisMemorySamplePruneService.name),
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async prune(): Promise<{ deleted: number; remaining: number; hitCeiling: boolean }> {
    const cutoff = new Date(Date.now() - REDIS_SAMPLE_RETENTION_DAYS * 86_400_000);
    let deleted = 0;

    try {
      for (let batch = 0; batch < REDIS_PRUNE_MAX_BATCHES; batch++) {
        const result = await this.dataSource
          .createQueryBuilder()
          .delete()
          .from(RedisMemorySampleEntity)
          .where(
            `id IN (SELECT id FROM redis_memory_samples WHERE sampled_at < :cutoff LIMIT :limit)`,
            { cutoff, limit: REDIS_PRUNE_BATCH_SIZE },
          )
          .execute();

        const affected = result.affected ?? 0;
        deleted += affected;
        if (affected === 0) {
          return { deleted, remaining: 0, hitCeiling: false };
        }
      }
    } catch (error) {
      // A diagnostic must never disrupt the app; retry tomorrow. Remaining is
      // UNKNOWN, not zero — a failed delete is not evidence that nothing is
      // left, and reporting an all-clear here would hide a table that is
      // failing to drain.
      this.logger.warn(`Redis sample prune failed after ${deleted} rows: ${error.message}`);
      return { deleted, remaining: -1, hitCeiling: false };
    }

    // Exhausting the batch budget is NOT itself proof that work remains: the
    // final full batch may have removed the last expired rows exactly. Probe
    // before warning, or every maximally-efficient run reports a false
    // backlog and the warning stops meaning anything.
    let remaining: number;
    try {
      remaining = await this.dataSource
        .getRepository(RedisMemorySampleEntity)
        .count({ where: { sampledAt: LessThan(cutoff) } });
    } catch (error) {
      // Unknown, never a false all-clear.
      this.logger.warn(`Redis sample prune could not count remaining rows: ${error.message}`);
      return { deleted, remaining: -1, hitCeiling: true };
    }

    if (remaining === 0) {
      return { deleted, remaining: 0, hitCeiling: false };
    }

    // Sustained ceiling hits mean growth is outpacing the prune.
    this.logger.warn(
      `Redis sample prune hit the ${REDIS_PRUNE_MAX_BATCHES}-batch ceiling ` +
        `(${deleted} rows removed, ${remaining} expired rows remain); ` +
        `they will be pruned tomorrow.`,
    );
    return { deleted, remaining, hitCeiling: true };
  }
}
