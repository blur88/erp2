import { describe, expect, it } from 'vitest'

import { dashboardApiSlice } from '@/store/api/dashboardApi'

describe('dashboardApiSlice', () => {
  it('defines dashboard data endpoints', () => {
    expect(dashboardApiSlice.endpoints.getSalesOrders).toBeDefined()
    expect(dashboardApiSlice.endpoints.getPurchaseOrders).toBeDefined()
    expect(dashboardApiSlice.endpoints.getSuppliers).toBeDefined()
    expect(dashboardApiSlice.endpoints.getInventoryStats).toBeDefined()
    expect(dashboardApiSlice.endpoints.getOutOfStockProducts).toBeDefined()
    expect(dashboardApiSlice.endpoints.getPayments).toBeDefined()
  })
})
