import type { SampleQuery } from './redis-memory-history.store';
import { REDIS_DETAIL_MAX_ROWS } from './redis-memory.types';

/** A `SampleQuery` with the limit resolved and `allInstances` made explicit. */
export interface NormalizedSampleQuery {
  instanceId?: string;
  allInstances: boolean;
  from?: Date;
  to?: Date;
  limit: number;
}

/**
 * The single normalization both the sample read and the aggregate read consume.
 *
 * Sharing it is the point: the resolved bounds reported as `windowStats.from` /
 * `windowStats.to` must be provably the bounds both queries actually ran under,
 * which duplicated inline clamping cannot guarantee.
 */
export function normalizeSampleQuery(query?: SampleQuery | number): NormalizedSampleQuery {
  const source: SampleQuery = typeof query === 'number' ? { limit: query } : (query ?? {});
  return {
    instanceId: source.instanceId,
    allInstances: source.allInstances === true,
    from: source.from,
    to: source.to,
    limit: clampLimit(source.limit),
  };
}

function clampLimit(limit?: number): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return REDIS_DETAIL_MAX_ROWS;
  }
  const truncated = Math.trunc(limit);
  if (truncated < 1) {
    // Anything below 1 is meaningless; fall back rather than erroring, matching
    // the DTO's clamp-never-reject contract.
    return REDIS_DETAIL_MAX_ROWS;
  }
  return Math.min(truncated, REDIS_DETAIL_MAX_ROWS);
}
