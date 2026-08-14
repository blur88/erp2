import { ValueTransformer } from 'typeorm';

/**
 * Maps Postgres `bigint` to a JavaScript `number`.
 *
 * TypeORM returns `bigint` columns as strings by default. Domain types in the
 * monitoring module are `number | null`, and an unconverted string silently
 * corrupts comparisons — `"5" > "10"` is `true` under string ordering, which
 * would invert counter-increase detection with no error raised.
 *
 * Values beyond `Number.MAX_SAFE_INTEGER` throw rather than truncate: that
 * means the assumption behind the `number`-typed domain model has broken, and
 * reporting a corrupted counter as fact is worse than degrading visibility.
 * Callers wrap reads in a catch, so the throw degrades rather than 500s.
 */
export const safeIntegerTransformer: ValueTransformer = {
  to: (value: number | null | undefined): string | null => {
    if (value === null || value === undefined) {
      return null;
    }
    // Guarded on write too: String(9007199254740993) is "9007199254740992",
    // so an unguarded write persists a silently wrong number that every later
    // read validates cleanly. This is the last point the loss is detectable.
    if (!Number.isSafeInteger(value)) {
      throw new Error(`bigint value ${value} exceeds safe integer range`);
    }
    return String(value);
  },

  from: (value: string | number | null | undefined): number | null => {
    if (value === null || value === undefined) {
      return null;
    }
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isSafeInteger(parsed)) {
      throw new Error(`bigint value ${value} exceeds safe integer range`);
    }
    return parsed;
  },
};
