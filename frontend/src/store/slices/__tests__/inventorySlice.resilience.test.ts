import { describe, expect, it } from 'vitest'

import {
  selectSelectedProduct,
  selectSelectedCategory,
  selectSelectedStockAdjustment,
  selectCategoryFilters,
} from '../inventorySlice'

describe('inventorySlice selectors - undefined state resilience', () => {
  const stateWithoutInventory = {} as any

  it('selectSelectedProduct returns undefined when inventory slice is absent', () => {
    expect(() => selectSelectedProduct(stateWithoutInventory)).not.toThrow()
    expect(selectSelectedProduct(stateWithoutInventory)).toBeUndefined()
  })

  it('selectSelectedCategory returns undefined when inventory slice is absent', () => {
    expect(() => selectSelectedCategory(stateWithoutInventory)).not.toThrow()
    expect(selectSelectedCategory(stateWithoutInventory)).toBeUndefined()
  })

  it('selectSelectedStockAdjustment returns undefined when inventory slice is absent', () => {
    expect(() => selectSelectedStockAdjustment(stateWithoutInventory)).not.toThrow()
    expect(selectSelectedStockAdjustment(stateWithoutInventory)).toBeUndefined()
  })

  it('selectCategoryFilters returns undefined when inventory slice is absent', () => {
    expect(() => selectCategoryFilters(stateWithoutInventory)).not.toThrow()
    expect(selectCategoryFilters(stateWithoutInventory)).toBeUndefined()
  })
})
