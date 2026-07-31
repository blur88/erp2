import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { createGlobalValidationPipe } from '../../../common/validation/global-validation-pipe';
import { CreateStockAdjustmentDto, QueryStockAdjustmentsDto, StockAdjustmentItemDto } from './stock-adjustment.dto';

describe('CreateStockAdjustmentDto.adjustmentDate', () => {
  const base = {
    items: [{
      productId: '11111111-1111-4111-8111-111111111111',
      oldQuantity: 0,
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

describe('StockAdjustmentItemDto through the global validation pipe', () => {
  const pipe = createGlobalValidationPipe();
  const meta = { type: 'body' as const, metatype: CreateStockAdjustmentDto };

  const item = {
    productId: '11111111-1111-4111-8111-111111111111',
    oldQuantity: 100,
    difference: 10,
  };

  it('strips a client-supplied newQuantity instead of rejecting it', async () => {
    const result: any = await pipe.transform(
      { adjustmentDate: '2026-07-31', items: [{ ...item, newQuantity: 999 }] },
      meta,
    );

    expect(result.items[0]).not.toHaveProperty('newQuantity');
    expect(result.items[0].difference).toBe(10);
  });

  it('accepts an item without newQuantity', async () => {
    const result: any = await pipe.transform(
      { adjustmentDate: '2026-07-31', items: [item] },
      meta,
    );

    expect(result.items[0].oldQuantity).toBe(100);
  });

  it('still requires difference', async () => {
    const { difference, ...withoutDifference } = item;
    await expect(
      pipe.transform({ adjustmentDate: '2026-07-31', items: [withoutDifference] }, meta),
    ).rejects.toThrow(/difference/);
  });
});
