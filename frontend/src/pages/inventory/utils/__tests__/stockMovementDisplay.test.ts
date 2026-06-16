import { describe, expect, it } from 'vitest'

import { StockMovementType } from '@/types'

import { getMovementLabel, getMovementNavTarget } from '../stockMovementDisplay'

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
})

describe('getMovementNavTarget', () => {
  it('returns sales_order target for sales_order referenceType', () => {
    expect(getMovementNavTarget('sales_order')).toBe('sales_order')
  })

  it('returns purchase_order target for purchase_order referenceType', () => {
    expect(getMovementNavTarget('purchase_order')).toBe('purchase_order')
  })

  it('returns null for non-navigable referenceTypes', () => {
    expect(getMovementNavTarget('stock_movement_reversal')).toBeNull()
    expect(getMovementNavTarget(undefined)).toBeNull()
  })
})
