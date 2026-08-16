import { configureStore } from '@reduxjs/toolkit'
import { afterEach, describe, expect, it, vi } from 'vitest'

import api from '@/services/api'
import { accountingApiSlice } from '@/store/api/accountingApi'
import { inventoryApiSlice } from '@/store/api/inventoryApi'

vi.mock('@/services/api', () => ({
  default: vi.fn(),
}))

const DOC = {
  id: 'doc-1',
  referenceNumber: 'EQ-26-001',
  equityDate: '2026-08-16',
  type: 'STOCK_DRAWING',
  description: 'Owner took stock',
  notes: null,
  documentStatus: 'COMPLETED',
  settlementStatus: null,
  totalAmount: null,
  settledAmount: null,
  balance: null,
  productId: 'prod-1',
  quantity: '2.0000',
  unitCost: '10.0000',
  totalCost: '20.0000',
  completedAt: '2026-08-16T00:00:00.000Z',
  completedBy: 'owner',
  createdAt: '2026-08-16T00:00:00.000Z',
  updatedAt: '2026-08-16T00:00:00.000Z',
}

function routeApiByUrl() {
  vi.mocked(api).mockImplementation(async (config: any) => {
    if (
      typeof config.url === 'string' &&
      config.url.includes('/accounting/owner-equity')
    ) {
      return { data: { data: DOC } }
    }
    return { data: { data: DOC } }
  })
}

function makeStore() {
  return configureStore({
    reducer: {
      [accountingApiSlice.reducerPath]: accountingApiSlice.reducer,
      [inventoryApiSlice.reducerPath]: inventoryApiSlice.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware()
        .concat(accountingApiSlice.middleware)
        .concat(inventoryApiSlice.middleware),
  })
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('owner equity API', () => {
  it('defines all ten owner equity endpoints', () => {
    expect(accountingApiSlice.endpoints.getOwnerEquityList).toBeDefined()
    expect(accountingApiSlice.endpoints.getOwnerEquity).toBeDefined()
    expect(accountingApiSlice.endpoints.createOwnerEquity).toBeDefined()
    expect(accountingApiSlice.endpoints.updateOwnerEquity).toBeDefined()
    expect(accountingApiSlice.endpoints.settleOwnerEquity).toBeDefined()
    expect(accountingApiSlice.endpoints.refundOwnerEquity).toBeDefined()
    expect(accountingApiSlice.endpoints.completeOwnerEquity).toBeDefined()
    expect(accountingApiSlice.endpoints.uncompleteOwnerEquity).toBeDefined()
    expect(accountingApiSlice.endpoints.cancelOwnerEquity).toBeDefined()
    expect(accountingApiSlice.endpoints.uncancelOwnerEquity).toBeDefined()
  })

  it('invalidates inventory Product and StockMovement tags after stock complete', async () => {
    routeApiByUrl()
    const store = makeStore()
    const invalidateTags = vi.spyOn(inventoryApiSlice.util, 'invalidateTags')
    await store.dispatch(
      accountingApiSlice.endpoints.completeOwnerEquity.initiate({ referenceNumber: 'EQ-26-001' }),
    )
    expect(invalidateTags).toHaveBeenCalledWith(['Product', 'StockMovement'])
  })

  it('invalidates inventory Product and StockMovement tags after stock uncomplete', async () => {
    routeApiByUrl()
    const store = makeStore()
    const invalidateTags = vi.spyOn(inventoryApiSlice.util, 'invalidateTags')
    await store.dispatch(
      accountingApiSlice.endpoints.uncompleteOwnerEquity.initiate({ referenceNumber: 'EQ-26-001' }),
    )
    expect(invalidateTags).toHaveBeenCalledWith(['Product', 'StockMovement'])
  })
})
