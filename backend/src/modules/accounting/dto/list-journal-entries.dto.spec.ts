import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListJournalEntriesDto } from './list-journal-entries.dto';

async function check(query: Record<string, string>) {
  const dto = plainToInstance(ListJournalEntriesDto, query, {
    enableImplicitConversion: false,
  });
  const errors = await validate(dto, { skipMissingProperties: true });
  return { dto, errors };
}

describe('ListJournalEntriesDto', () => {
  it('coerces numeric strings to numbers', async () => {
    const { dto, errors } = await check({ page: '2', limit: '50' });
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(50);
  });

  it('rejects a non-numeric page', async () => {
    const { errors } = await check({ page: 'abc' });
    expect(errors.map((e) => e.property)).toContain('page');
  });

  it('rejects page below 1', async () => {
    const { errors } = await check({ page: '0' });
    expect(errors.map((e) => e.property)).toContain('page');
  });

  it('rejects limit below 1', async () => {
    const { errors } = await check({ limit: '0' });
    expect(errors.map((e) => e.property)).toContain('limit');
  });

  it('rejects limit above the 200 ceiling', async () => {
    const { errors } = await check({ limit: '201' });
    expect(errors.map((e) => e.property)).toContain('limit');
  });

  it('rejects an unknown sourceType', async () => {
    const { errors } = await check({ sourceType: 'bogus' });
    expect(errors.map((e) => e.property)).toContain('sourceType');
  });

  it('rejects an unknown status', async () => {
    const { errors } = await check({ status: 'bogus' });
    expect(errors.map((e) => e.property)).toContain('status');
  });

  it('rejects a malformed date', async () => {
    const { errors } = await check({ fromDate: 'abc' });
    expect(errors.map((e) => e.property)).toContain('fromDate');
  });

  it('rejects a real-looking but invalid calendar date', async () => {
    const { errors } = await check({ fromDate: '2026-02-30' });
    expect(errors.map((e) => e.property)).toContain('fromDate');
  });

  it('accepts a fully populated valid query', async () => {
    const { errors } = await check({
      page: '1', limit: '25', search: 'INV', sourceType: 'SALES_ORDER',
      status: 'Posted', fromDate: '2026-01-01', toDate: '2026-01-31',
    });
    expect(errors).toHaveLength(0);
  });
});
