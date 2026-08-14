import { normalizeSampleQuery } from './normalize-sample-query';
import { REDIS_DETAIL_MAX_ROWS } from './redis-memory.types';

describe('normalizeSampleQuery', () => {
  it('defaults to the row cap when no limit is given', () => {
    expect(normalizeSampleQuery().limit).toBe(REDIS_DETAIL_MAX_ROWS);
  });

  it('accepts a bare number as a limit, preserving the legacy call shape', () => {
    expect(normalizeSampleQuery(10).limit).toBe(10);
  });

  it('clamps a limit above the cap', () => {
    expect(normalizeSampleQuery({ limit: 999_999 }).limit).toBe(REDIS_DETAIL_MAX_ROWS);
  });

  it('falls back to the cap for a limit below 1', () => {
    expect(normalizeSampleQuery({ limit: 0 }).limit).toBe(REDIS_DETAIL_MAX_ROWS);
  });

  it('truncates a fractional limit', () => {
    expect(normalizeSampleQuery({ limit: 12.9 }).limit).toBe(12);
  });

  it('falls back to the cap for a non-finite limit', () => {
    expect(normalizeSampleQuery({ limit: Number.NaN }).limit).toBe(REDIS_DETAIL_MAX_ROWS);
  });

  it('preserves the range bounds it was given', () => {
    const from = new Date('2026-08-01T00:00:00.000Z');
    const to = new Date('2026-08-08T00:00:00.000Z');
    const result = normalizeSampleQuery({ from, to });
    expect(result.from).toEqual(from);
    expect(result.to).toEqual(to);
  });

  it('defaults allInstances to false', () => {
    expect(normalizeSampleQuery({}).allInstances).toBe(false);
  });

  it('keeps instanceId alongside allInstances so the caller decides precedence', () => {
    const result = normalizeSampleQuery({ instanceId: 'other', allInstances: true });
    expect(result.allInstances).toBe(true);
    expect(result.instanceId).toBe('other');
  });
});
