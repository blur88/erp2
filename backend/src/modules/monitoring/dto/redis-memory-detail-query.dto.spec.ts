import { plainToInstance } from 'class-transformer';
import { RedisMemoryDetailQueryDto } from './redis-memory-detail-query.dto';

describe('RedisMemoryDetailQueryDto', () => {
  const parse = (raw: Record<string, unknown>) =>
    plainToInstance(RedisMemoryDetailQueryDto, raw);

  it('drops an unparseable date instead of rejecting it', () => {
    expect(parse({ from: 'not-a-date' }).from).toBeUndefined();
  });

  it('parses a valid ISO date', () => {
    expect(parse({ from: '2026-08-01T00:00:00.000Z' }).from).toEqual(
      new Date('2026-08-01T00:00:00.000Z'),
    );
  });

  it('drops a non-numeric limit', () => {
    expect(parse({ limit: 'abc' }).limit).toBeUndefined();
  });

  it('drops a zero or negative limit', () => {
    expect(parse({ limit: '0' }).limit).toBeUndefined();
    expect(parse({ limit: '-5' }).limit).toBeUndefined();
  });

  it('truncates a fractional limit', () => {
    expect(parse({ limit: '10.9' }).limit).toBe(10);
  });

  it('coerces allInstances from a query string', () => {
    expect(parse({ allInstances: 'true' }).allInstances).toBe(true);
    expect(parse({ allInstances: 'false' }).allInstances).toBe(false);
  });
});
