import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RedisAlertStateEntity } from '@/database/entities/redis-alert-state.entity';
import { AlertState, emptyAlertState } from './redis-alert.transitions';

@Injectable()
export class RedisAlertStateRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Runs `mutator` against the row for `runId` under a row lock.
   *
   * Sequence is BEGIN -> INSERT ... ON CONFLICT DO NOTHING -> SELECT ... FOR
   * UPDATE -> UPDATE -> COMMIT. The insert is inside the transaction so that
   * insert and transition succeed or fail together: a pre-BEGIN insert would
   * commit a bare default row that a later tick reads as an established
   * baseline, silently suppressing an OOM.
   *
   * `isNewIdentity` is the insert's affected-row count, never an in-process
   * cache — that is what keeps the rule correct under concurrency and across
   * restarts alike.
   */
  async mutate(
    runId: string,
    mutator: (state: AlertState, isNewIdentity: boolean) => AlertState,
  ): Promise<AlertState> {
    return this.dataSource.transaction(async (manager) => {
      const inserted = await manager
        .createQueryBuilder()
        .insert()
        .into(RedisAlertStateEntity)
        .values({ redisRunId: runId, recentEpisodes: [], oomUnacknowledgedDelta: 0 })
        .orIgnore()
        .execute();

      const isNewIdentity = (inserted.raw?.length ?? 0) > 0;

      const row = await manager
        .createQueryBuilder(RedisAlertStateEntity, 'state')
        .setLock('pessimistic_write')
        .where('state.redisRunId = :runId', { runId })
        .getOne();

      if (row === null) {
        // Unreachable: the insert above guarantees the row exists.
        throw new Error(`Alert state row missing for run_id ${runId}`);
      }

      const next = mutator(toAlertState(row), isNewIdentity);
      await manager.update(RedisAlertStateEntity, { id: row.id }, toEntityColumns(next));
      return next;
    });
  }

  async read(runId: string): Promise<AlertState | null> {
    const row = await this.dataSource
      .getRepository(RedisAlertStateEntity)
      .findOne({ where: { redisRunId: runId } });
    return row === null ? null : toAlertState(row);
  }
}

const iso = (value: Date | null): string | null => value?.toISOString() ?? null;
const date = (value: string | null): Date | null => (value === null ? null : new Date(value));

function toAlertState(row: RedisAlertStateEntity): AlertState {
  return {
    ...emptyAlertState(),
    pressureState: row.pressureState as AlertState['pressureState'],
    activeEpisode: row.activeEpisode,
    recentEpisodes: row.recentEpisodes ?? [],
    oomBaselineValue: row.oomBaselineValue,
    oomObservedValue: row.oomObservedValue,
    oomAcknowledgedValue: row.oomAcknowledgedValue,
    oomIncidentStartedAt: iso(row.oomIncidentStartedAt),
    oomLastIncreaseAt: iso(row.oomLastIncreaseAt),
    oomUnacknowledgedDelta: row.oomUnacknowledgedDelta ?? 0,
    oomLastAcknowledgedAt: iso(row.oomLastAcknowledgedAt),
    oomLastAcknowledgedBy: row.oomLastAcknowledgedBy,
    oomLastAcknowledgedByLabel: row.oomLastAcknowledgedByLabel,
  };
}

function toEntityColumns(state: AlertState): Partial<RedisAlertStateEntity> {
  return {
    pressureState: state.pressureState,
    activeEpisode: state.activeEpisode,
    recentEpisodes: state.recentEpisodes,
    oomBaselineValue: state.oomBaselineValue,
    oomObservedValue: state.oomObservedValue,
    oomAcknowledgedValue: state.oomAcknowledgedValue,
    oomIncidentStartedAt: date(state.oomIncidentStartedAt),
    oomLastIncreaseAt: date(state.oomLastIncreaseAt),
    oomUnacknowledgedDelta: state.oomUnacknowledgedDelta,
    oomLastAcknowledgedAt: date(state.oomLastAcknowledgedAt),
    oomLastAcknowledgedBy: state.oomLastAcknowledgedBy,
    oomLastAcknowledgedByLabel: state.oomLastAcknowledgedByLabel,
  };
}