import { describe, expect, it } from 'vitest'

import { StockMovementType, type StockMovement } from '@/types'

import {
  getMovementLabel,
  getMovementNavTarget,
  getReferenceLabel,
  isMovementNavigable,
} from '../stockMovementDisplay'

function movement(overrides: Partial<StockMovement>): StockMovement {
  return { id: 'm1', ...overrides } as StockMovement
}

describe('getMovementLabel', () => {
  it('labels inward types', () => {
    expect(getMovementLabel(StockMovementType.PURCHASE_RECEIPT)).toBe('Purchase Receipt')
    expect(getMovementLabel(StockMovementType.INITIAL_STOCK)).toBe('Initial Stock')
    expect(getMovementLabel(StockMovementType.ADJUSTMENT_INCREASE)).toBe('Stock Adjustment')
  })

  it('labels outward types', () => {
    expect(getMovementLabel(StockMovementType.SALE)).toBe('Sale')
    expect(getMovementLabel(StockMovementType.ADJUSTMENT_DECREASE)).toBe('Stock Adjustment')
    expect(getMovementLabel(StockMovementType.DAMAGE)).toBe('Damage')
  })

  it('labels owner equity types instead of falling through to the raw enum', () => {
    expect(getMovementLabel(StockMovementType.OWNER_DRAWING)).toBe('Owner Drawing')
    expect(getMovementLabel(StockMovementType.OWNER_DRAWING_REVERSAL)).toBe(
      'Owner Drawing Reversal',
    )
  })
})

describe('getMovementNavTarget', () => {
  it('returns sales_order target for sales_order referenceType', () => {
    expect(getMovementNavTarget('sales_order')).toBe('sales_order')
  })

  it('returns purchase_order target for purchase_order referenceType', () => {
    expect(getMovementNavTarget('purchase_order')).toBe('purchase_order')
  })

  it('returns owner_equity target for owner_equity referenceType', () => {
    expect(getMovementNavTarget('owner_equity')).toBe('owner_equity')
  })

  it('returns null for non-navigable referenceTypes', () => {
    expect(getMovementNavTarget('stock_movement_reversal')).toBeNull()
    expect(getMovementNavTarget(undefined)).toBeNull()
  })
})

describe('isMovementNavigable', () => {
  it('requires referenceId for order targets', () => {
    expect(
      isMovementNavigable(movement({ referenceType: 'sales_order', referenceId: 'so-uuid' })),
    ).toBe(true)
    expect(
      isMovementNavigable(movement({ referenceType: 'purchase_order', referenceId: 'po-uuid' })),
    ).toBe(true)
    expect(
      isMovementNavigable(movement({ referenceType: 'sales_order', referenceId: undefined })),
    ).toBe(false)
  })

  it('requires the resolved referenceNumber for owner_equity, not referenceId', () => {
    expect(
      isMovementNavigable(
        movement({ referenceType: 'owner_equity', referenceId: 'oe-uuid', referenceNumber: 'OE-5' }),
      ),
    ).toBe(true)
    expect(
      isMovementNavigable(
        movement({ referenceType: 'owner_equity', referenceId: 'oe-uuid', referenceNumber: undefined }),
      ),
    ).toBe(false)
  })

  it('keys off referenceType, so a drawing and its reversal behave alike', () => {
    for (const movementType of [
      StockMovementType.OWNER_DRAWING,
      StockMovementType.OWNER_DRAWING_REVERSAL,
    ]) {
      expect(
        isMovementNavigable(
          movement({ movementType, referenceType: 'owner_equity', referenceNumber: 'OE-5' }),
        ),
      ).toBe(true)
    }
  })

  it('is false for unknown targets regardless of reference fields', () => {
    expect(
      isMovementNavigable(
        movement({
          referenceType: 'stock_movement_reversal',
          referenceId: 'x',
          referenceNumber: 'Y',
        }),
      ),
    ).toBe(false)
    expect(isMovementNavigable(movement({ referenceType: undefined }))).toBe(false)
  })
})

describe('getReferenceLabel', () => {
  it('maps known referenceTypes to friendly labels', () => {
    expect(getReferenceLabel('sales_order')).toBe('Sales Order')
    expect(getReferenceLabel('purchase_order')).toBe('Purchase Order')
    expect(getReferenceLabel('stock_movement_reversal')).toBe('Reversal')
    expect(getReferenceLabel('owner_equity')).toBe('Owner Equity')
  })

  it('title-cases unknown snake_case referenceTypes', () => {
    expect(getReferenceLabel('some_other_ref')).toBe('Some Other Ref')
  })

  it('returns an em dash for missing referenceType', () => {
    expect(getReferenceLabel(undefined)).toBe('—')
  })
})
