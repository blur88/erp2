import { describe, expect, it } from 'vitest'

import { inventoryApiSlice } from '@/store/api/inventoryApi'

describe('inventoryApiSlice', () => {
  it('defines core inventory endpoints', () => {
    expect(inventoryApiSlice.endpoints.getProducts).toBeDefined()
    expect(inventoryApiSlice.endpoints.getCategories).toBeDefined()
    expect(inventoryApiSlice.endpoints.getStockAdjustments).toBeDefined()
    expect(inventoryApiSlice.endpoints.createCategory).toBeDefined()
    expect(inventoryApiSlice.endpoints.updateCategory).toBeDefined()
    expect(inventoryApiSlice.endpoints.deleteCategory).toBeDefined()
    expect(inventoryApiSlice.endpoints.checkProductDuplicate).toBeDefined()
    expect(inventoryApiSlice.endpoints.checkCategoryDuplicate).toBeDefined()
  })
})
