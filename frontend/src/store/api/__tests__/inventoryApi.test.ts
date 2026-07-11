import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it, vi } from 'vitest'

import api from '@/services/api'
import { inventoryApiSlice } from '@/store/api/inventoryApi'

vi.mock('@/services/api', () => ({
  default: vi.fn(),
}))

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
    expect(inventoryApiSlice.endpoints.revertStockAdjustment).toBeDefined()
    expect(inventoryApiSlice.endpoints.createCategory).toBeDefined()
    expect(inventoryApiSlice.endpoints.updateCategory).toBeDefined()
    expect(inventoryApiSlice.endpoints.getCategoryBySlug).toBeDefined()
    expect(inventoryApiSlice.endpoints.setCategoryEnabled).toBeDefined()
    expect(inventoryApiSlice.endpoints.checkProductDuplicate).toBeDefined()
    expect(inventoryApiSlice.endpoints.checkCategoryDuplicate).toBeDefined()
  })
})

describe('getProducts params', () => {
  it('sends uppercase sortOrder ASC by default', async () => {
    vi.mocked(api).mockResolvedValue({ data: { data: [], meta: { total: 0 } } })

    const store = configureStore({
      reducer: { [inventoryApiSlice.reducerPath]: inventoryApiSlice.reducer },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().concat(inventoryApiSlice.middleware),
    })

    await store.dispatch(
      inventoryApiSlice.endpoints.getProducts.initiate(undefined),
    )

    expect(api).toHaveBeenCalledTimes(1)
    const sentConfig = vi.mocked(api).mock.calls[0][0] as { params: Record<string, unknown> }
    expect(sentConfig.params.sortOrder).toBe('ASC')
    expect(sentConfig.params.isActive).toBe(true)
    expect(sentConfig.params.sortBy).toBe('name')
  })
})
