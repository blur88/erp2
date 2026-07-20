import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePriceListDto } from './create-price-list.dto';

describe('CreatePriceListDto effective dates', () => {
  const base = { code: 'RETAIL', name: 'Retail' };

  it('accepts YYYY-MM-DD strings', async () => {
    const dto = plainToInstance(CreatePriceListDto, { ...base, effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.effectiveFrom).toBe('2026-01-01');
  });

  it('rejects a full timestamp', async () => {
    const dto = plainToInstance(CreatePriceListDto, { ...base, effectiveFrom: '2026-01-01T00:00:00Z' });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('allows omitted effective dates', async () => {
    const dto = plainToInstance(CreatePriceListDto, { ...base });
    expect(await validate(dto)).toHaveLength(0);
  });
});
