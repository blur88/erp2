import { ValidationPipe } from '@nestjs/common';
import { createGlobalValidationPipe } from './global-validation-pipe';
import {
  StockAdjustmentItemDto,
  UpdateStockAdjustmentDto,
} from '../../modules/inventory/dto/stock-adjustment.dto';

describe('createGlobalValidationPipe', () => {
  it('returns a ValidationPipe', () => {
    expect(createGlobalValidationPipe()).toBeInstanceOf(ValidationPipe);
  });

  it('returns a new instance on every call so apps never share pipe state', () => {
    expect(createGlobalValidationPipe()).not.toBe(createGlobalValidationPipe());
  });

  it('leaves omitted partial-update fields absent as own properties (#1922)', async () => {
    const dto = await createGlobalValidationPipe().transform(
      { notes: 'Recount requested' },
      { type: 'body', metatype: UpdateStockAdjustmentDto },
    );

    expect(dto).toBeInstanceOf(UpdateStockAdjustmentDto);
    expect(dto.notes).toBe('Recount requested');
    expect(Object.hasOwn(dto, 'adjustmentDate')).toBe(false);
    expect(Object.hasOwn(dto, 'items')).toBe(false);
  });

  it('keeps supplied values and transforms nested update items', async () => {
    const dto = await createGlobalValidationPipe().transform(
      {
        adjustmentDate: '2026-07-20',
        notes: null,
        items: [
          {
            productId: '11111111-1111-4111-8111-111111111111',
            oldQuantity: 10,
            difference: -2,
            unitCost: 0,
          },
        ],
      },
      { type: 'body', metatype: UpdateStockAdjustmentDto },
    );

    expect(dto.adjustmentDate).toBe('2026-07-20');
    expect(Object.hasOwn(dto, 'notes')).toBe(true);
    expect(dto.notes).toBeNull();
    expect(dto.items[0]).toBeInstanceOf(StockAdjustmentItemDto);
    expect(dto.items[0]).toMatchObject({
      oldQuantity: 10,
      difference: -2,
      unitCost: 0,
    });
  });

  it.each([
    [{ notes: 42 }, /notes/],
    [{ adjustmentDate: '2026-07-20T00:00:00Z' }, /adjustmentDate/],
    [
      {
        items: [
          {
            productId: '11111111-1111-4111-8111-111111111111',
            oldQuantity: 10,
            difference: -2,
            unitCost: -1,
          },
        ],
      },
      /unitCost/,
    ],
  ])('rejects invalid supplied update values: %j', async (body, message) => {
    await expect(
      createGlobalValidationPipe().transform(body, {
        type: 'body',
        metatype: UpdateStockAdjustmentDto,
      }),
    ).rejects.toThrow(message);
  });
});
