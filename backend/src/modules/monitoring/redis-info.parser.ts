export interface RedisMemoryReading {
  usedBytes: number;
  /** null when Redis runs uncapped (`maxmemory:0`). */
  maxBytes: number | null;
  /** null when no cap makes utilization undefined. */
  utilizationPercent: number | null;
}

/**
 * Read a decimal value from an `INFO` payload line of the form
 * `field:<digits>` (or `field=<digits>` for errorstats lines). The pattern is
 * anchored so a prefix like `used_memory` cannot match `used_memory_peak`.
 * Returns null for non-string input, absent fields, or non-safe-integer values.
 */
const readDecimalField = (
  info: unknown,
  field: string,
  separator: ':' | '=' = ':',
): number | null => {
  if (typeof info !== 'string') {
    return null;
  }
  const match = info.match(new RegExp(`^${field}${separator}(\\d+)$`, 'm'));
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : null;
};

/**
 * Parse `used_memory` / `maxmemory` out of an `INFO memory` payload.
 *
 * `maxmemory:0` is a valid reading meaning Redis is uncapped — utilization is
 * undefined, not zero, so it is reported as null rather than 0%. Returns null
 * when the fields are absent, non-numeric, or not safe integers.
 */
export function parseRedisMemory(info: unknown): RedisMemoryReading | null {
  const usedBytes = readDecimalField(info, 'used_memory');
  const maxBytes = readDecimalField(info, 'maxmemory');
  if (usedBytes === null || maxBytes === null) {
    return null;
  }
  if (maxBytes === 0) {
    return { usedBytes, maxBytes: null, utilizationPercent: null };
  }
  return {
    usedBytes,
    maxBytes,
    utilizationPercent: Math.round((usedBytes / maxBytes) * 100),
  };
}

/**
 * Parse the cumulative OOM counter out of an `INFO errorstats` payload.
 *
 * Returns null when the section is missing or disabled (the counter is
 * unavailable, not zero); returns 0 when the section parsed successfully but
 * has no `errorstat_OOM` line, which is the healthy steady state.
 */
export function parseOomErrors(info: unknown): number | null {
  if (typeof info !== 'string' || !info.includes('# Errorstats')) {
    return null;
  }
  if (info.includes('ERRORSTATS_DISABLED')) {
    return null;
  }
  return readDecimalField(info, 'errorstat_OOM:count', '=') ?? 0;
}

/**
 * Parse the cumulative `evicted_keys` counter out of an `INFO stats` payload.
 * Returns null when the counter is missing or malformed.
 */
export function parseEvictedKeys(info: unknown): number | null {
  return readDecimalField(info, 'evicted_keys');
}

/**
 * Parse `run_id` out of an `INFO server` payload. It identifies the Redis
 * instance across sampler restarts; a restarted Redis presents a new run_id.
 * Returns null when the field is missing or the payload is not a string.
 */
export function parseRunId(info: unknown): string | null {
  if (typeof info !== 'string') {
    return null;
  }
  const match = info.match(/^run_id:(\S+)$/m);
  return match ? match[1] : null;
}
