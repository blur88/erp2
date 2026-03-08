import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'

import { patchSalesOrderCaches } from '@/store/api/salesOrderCache'
import { salesApiSlice } from '@/store/api/salesApi'
import type { SalesOrder } from '@/types'

function createOrder(overrides: Partial<SalesOrder> = {}): SalesOrder {
  return {
    id: 'order-1',
    orderNumber: 'SO-000001',
    orderDate: '2026-03-07',
    totalAmount: 100,
    paidAmount: 0,
    balanceDue: 100,
    isPaidInFull: false,
    isFulfilled: false,
    customerId: 'customer-1',
    customer: { id: 'customer-1', name: 'Acme' } as any,
    items: [],
    invoices: [],
    createdAt: '2026-03-07',
    updatedAt: '2026-03-07',
    ...overrides,
  } as SalesOrder
}

describe('patchSalesOrderCaches', () => {
  it('updates matching sales-order list and detail caches', async () => {
    const store = configureStore({
      reducer: {
        [salesApiSlice.reducerPath]: salesApiSlice.reducer,
      },
      middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(salesApiSlice.middleware),
    })

    const initialOrder = createOrder()
    const updatedOrder = createOrder({ paidAmount: 50, balanceDue: 50 })
    const listArgs = { search: 'SO-000001', sortBy: 'orderNumber', sortOrder: 'asc' }

    await store.dispatch(
      salesApiSlice.util.upsertQueryData('getSalesOrders', listArgs, {
        data: [initialOrder],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      }),
    )
    await store.dispatch(salesApiSlice.util.upsertQueryData('getSalesOrder', initialOrder.id, initialOrder))

    patchSalesOrderCaches(store.dispatch, store.getState, updatedOrder)

    const listState = salesApiSlice.endpoints.getSalesOrders.select(listArgs)(store.getState())
    const detailState = salesApiSlice.endpoints.getSalesOrder.select(initialOrder.id)(store.getState())

    expect(listState.data?.data[0]).toMatchObject({ paidAmount: 50, balanceDue: 50 })
    expect(detailState.data).toMatchObject({ paidAmount: 50, balanceDue: 50 })
  })
})
