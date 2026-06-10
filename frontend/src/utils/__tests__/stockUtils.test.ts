import { describe, expect, it } from 'vitest'

import { getStockStatus } from '../stockUtils'

describe('stockUtils.getStockStatus', () => {
  it('returns out_of_stock at or below zero', () => {
    expect(getStockStatus(0, 5)).toBe('out_of_stock')
    expect(getStockStatus(-2, 5)).toBe('out_of_stock')
  })

  it('returns low_stock at or below threshold (but above zero)', () => {
    expect(getStockStatus(5, 5)).toBe('low_stock')
    expect(getStockStatus(3, 5)).toBe('low_stock')
  })

  it('returns in_stock above threshold', () => {
    expect(getStockStatus(6, 5)).toBe('in_stock')
  })
})
