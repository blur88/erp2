import { StockMovement, StockMovementType } from '../stock-movement.entity';

describe('owner drawing movement types', () => {
  it('uses this enum\'s lowercase persistence convention', () => {
    // Every other member is lowercase snake_case ('adjustment_decrease', …).
    // A SCREAMING_CASE value here would be the only outlier and would not match
    // the migration's ALTER TYPE values.
    expect(StockMovementType.OWNER_DRAWING).toBe('owner_drawing');
    expect(StockMovementType.OWNER_DRAWING_REVERSAL).toBe('owner_drawing_reversal');
  });

  it('appends them last to match ALTER TYPE ADD VALUE ordering', () => {
    const values = Object.values(StockMovementType);
    expect(values.slice(-2)).toEqual(['owner_drawing', 'owner_drawing_reversal']);
  });

  it('classifies the drawing as outward and its reversal as inward', () => {
    const out = new StockMovement();
    out.movementType = StockMovementType.OWNER_DRAWING;
    expect(out.isOutward).toBe(true);
    expect(out.isInward).toBe(false);

    const back = new StockMovement();
    back.movementType = StockMovementType.OWNER_DRAWING_REVERSAL;
    expect(back.isInward).toBe(true);
    expect(back.isOutward).toBe(false);
  });

  it('maps each owner drawing type to its counterpart for reversal', () => {
    const out = new StockMovement();
    out.movementType = StockMovementType.OWNER_DRAWING;
    out.quantity = -2; out.previousBalance = 10; out.newBalance = 8;
    expect(out.reverse('test').movementType).toBe(StockMovementType.OWNER_DRAWING_REVERSAL);
  });
});
