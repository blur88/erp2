import { parseOomErrors, parseEvictedKeys, parseRedisMemory, parseRunId } from './redis-info.parser';

describe('parseRedisMemory', () => {
  it.each([
    ['used_memory:80\r\nmaxmemory:100\r\n', { usedBytes: 80, maxBytes: 100, utilizationPercent: 80 }],
    ['used_memory:5\r\nmaxmemory:0\r\n', { usedBytes: 5, maxBytes: null, utilizationPercent: null }],
  ])('parses %s', (payload, expected) => expect(parseRedisMemory(payload)).toEqual(expected));

  it.each([undefined, '# Memory\r\nused_memory:x\r\nmaxmemory:100\r\n'])(
    'rejects malformed payload %#',
    (payload) => expect(parseRedisMemory(payload)).toBeNull(),
  );
});

describe('parseOomErrors', () => {
  it('returns a count when errorstat_OOM exists', () => {
    expect(parseOomErrors('# Errorstats\r\nerrorstat_OOM:count=3\r\n')).toBe(3);
  });
  it('returns zero when the parsed section has no OOM line', () => {
    expect(parseOomErrors('# Errorstats\r\nerrorstat_ERR:count=2\r\n')).toBe(0);
  });
  it.each(['', '# Stats\r\nevicted_keys:0\r\n', '# Errorstats\r\nERRORSTATS_DISABLED'])(
    'returns null when errorstats is unavailable: %s',
    (payload) => expect(parseOomErrors(payload)).toBeNull(),
  );
});

describe('parseEvictedKeys', () => {
  it('parses the cumulative counter', () => {
    expect(parseEvictedKeys('# Stats\r\nevicted_keys:7\r\n')).toBe(7);
  });
  it('returns null for a missing or malformed counter', () => {
    expect(parseEvictedKeys('# Stats\r\n')).toBeNull();
  });
});

describe('parseRunId', () => {
  it('parses run_id from an INFO server payload', () => {
    expect(parseRunId('# Server\r\nrun_id:abc123\r\nredis_version:8.6.2\r\n')).toBe(
      'abc123',
    );
  });
  it('returns null when run_id is missing', () => {
    expect(parseRunId('# Server\r\nredis_version:8.6.2\r\n')).toBeNull();
  });
  it('returns null for non-string input', () => {
    expect(parseRunId(undefined)).toBeNull();
  });
});
