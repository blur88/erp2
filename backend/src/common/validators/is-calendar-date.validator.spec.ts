import { validate } from 'class-validator';
import { IsCalendarDate } from './is-calendar-date.validator';

class Sample {
  @IsCalendarDate()
  date!: string;
}

async function firstErrorCount(value: unknown): Promise<number> {
  const s = new Sample();
  (s as any).date = value;
  return (await validate(s)).length;
}

describe('IsCalendarDate', () => {
  it('accepts a valid YYYY-MM-DD', async () => {
    expect(await firstErrorCount('2026-07-20')).toBe(0);
  });
  it('rejects a full timestamp', async () => {
    expect(await firstErrorCount('2026-07-20T00:00:00Z')).toBe(1);
  });
  it('rejects an impossible calendar date', async () => {
    expect(await firstErrorCount('2026-02-30')).toBe(1);
  });
  it('rejects a non-date string', async () => {
    expect(await firstErrorCount('not-a-date')).toBe(1);
  });
  it('rejects a non-string', async () => {
    expect(await firstErrorCount(20260720)).toBe(1);
  });
});
