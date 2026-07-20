import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateStockAdjustmentDto, QueryStockAdjustmentsDto } from './stock-adjustment.dto';

describe('CreateStockAdjustmentDto.adjustmentDate', () => {
  const base = {
    items: [{
      productId: '11111111-1111-4111-8111-111111111111',
      oldQuantity: 0,
      newQuantity: 1,
      difference: 1,
    }],
  };

  it('accepts a YYYY-MM-DD string and keeps it as a string', async () => {
    const dto = plainToInstance(CreateStockAdjustmentDto, { ...base, adjustmentDate: '2026-07-20' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.adjustmentDate).toBe('2026-07-20');
    expect(typeof dto.adjustmentDate).toBe('string');
  });

  it('rejects a full timestamp', async () => {
    const dto = plainToInstance(CreateStockAdjustmentDto, { ...base, adjustmentDate: '2026-07-20T00:00:00Z' });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('rejects a missing adjustmentDate (required, no fallback)', async () => {
    const dto = plainToInstance(CreateStockAdjustmentDto, { ...base });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});

describe('QueryStockAdjustmentsDto date filters', () => {
  it('keeps fromDate/toDate as strings', async () => {
    const dto = plainToInstance(QueryStockAdjustmentsDto, { fromDate: '2026-07-01', toDate: '2026-07-20' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.fromDate).toBe('2026-07-01');
    expect(dto.toDate).toBe('2026-07-20');
  });
});
