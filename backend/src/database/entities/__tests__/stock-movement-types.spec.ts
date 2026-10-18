import { StockMovement, StockMovementType } from '../stock-movement.entity';

describe('owner drawing movement types', () => {
  it('uses this enum\'s lowercase persistence convention', () => {
    // Every other member is lowercase snake_case ('adjustment_decrease', …).
    // A SCREAMING_CASE value here would be the only outlier and would not match
    // the migration's ALTER TYPE values.
    expect(StockMovementType.OWNER_DRAWING).toBe('owner_drawing');
    expect(StockMovementType.OWNER_DRAWING_REVERSAL).toBe('owner_drawing_reversal');
  });

  it('appends them to match ALTER TYPE ADD VALUE ordering', () => {
    const values = Object.values(StockMovementType);
    // New enum members are only ever APPENDED (ALTER TYPE … ADD VALUE cannot
    // reorder), so the owner-drawing pair stays contiguous and later additions
    // (#1406 purchase_receipt_reversal) follow it.
    expect(values.slice(-3)).toEqual([
      'owner_drawing',
      'owner_drawing_reversal',
      'purchase_receipt_reversal',
    ]);
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
});
