import { describe, expect, it } from 'vitest'

import { inventoryApiSlice } from '@/store/api/inventoryApi'

describe('inventoryApiSlice', () => {
  it('defines core inventory endpoints', () => {
    expect(inventoryApiSlice.endpoints.getProducts).toBeDefined()
    expect(inventoryApiSlice.endpoints.createProduct).toBeDefined()
    expect(inventoryApiSlice.endpoints.updateProduct).toBeDefined()
    expect(inventoryApiSlice.endpoints.getCategories).toBeDefined()
    expect(inventoryApiSlice.endpoints.getDashboardStats).toBeDefined()
    expect(inventoryApiSlice.endpoints.getStockMovements).toBeDefined()
    expect(inventoryApiSlice.endpoints.getOutOfStockProducts).toBeDefined()
    expect(inventoryApiSlice.endpoints.getStockAdjustments).toBeDefined()
    expect(inventoryApiSlice.endpoints.createStockAdjustment).toBeDefined()
    expect(inventoryApiSlice.endpoints.updateStockAdjustment).toBeDefined()
    expect(inventoryApiSlice.endpoints.completeStockAdjustment).toBeDefined()
    expect(inventoryApiSlice.endpoints.updateStockAdjustmentNotes).toBeDefined()
    expect(inventoryApiSlice.endpoints.createCategory).toBeDefined()
    expect(inventoryApiSlice.endpoints.updateCategory).toBeDefined()
    expect(inventoryApiSlice.endpoints.getCategoryBySlug).toBeDefined()
    expect(inventoryApiSlice.endpoints.setCategoryEnabled).toBeDefined()
    expect(inventoryApiSlice.endpoints.checkProductDuplicate).toBeDefined()
    expect(inventoryApiSlice.endpoints.checkCategoryDuplicate).toBeDefined()
  })
})
