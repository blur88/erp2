import { configureStore } from '@reduxjs/toolkit'
import { afterEach, describe, expect, it, vi } from 'vitest'

import api from '@/services/api'
import { accountingApiSlice } from '@/store/api/accountingApi'
import { purchasingApiSlice } from '@/store/api/purchasingApi'
import { salesApiSlice } from '@/store/api/salesApi'

vi.mock('@/services/api', () => ({
  default: vi.fn(),
}))

function routeApiByUrl() {
  vi.mocked(api).mockImplementation(async (config: any) => {
    if (typeof config.url === 'string' && config.url.includes('/accounting/journal-entries')) {
      return { data: { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } } }
    }
    return { data: { id: 'src-1' } }
  })
}

function countJournalEntryGets(): number {
  return vi
    .mocked(api)
    .mock.calls.filter(([config]: any[]) =>
      typeof config.url === 'string' && config.url.includes('/accounting/journal-entries'),
    ).length
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('cross-slice JournalEntry invalidation', () => {
  it('re-fetches the journal entries list after a PO payment', async () => {
    routeApiByUrl()
    const store = configureStore({
      reducer: {
        [accountingApiSlice.reducerPath]: accountingApiSlice.reducer,
        [purchasingApiSlice.reducerPath]: purchasingApiSlice.reducer,
      },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware()
          .concat(accountingApiSlice.middleware)
          .concat(purchasingApiSlice.middleware),
    })

    const jeSub = store.dispatch(
      accountingApiSlice.endpoints.getJournalEntries.initiate({ page: 1, limit: 20 }),
    )
    await jeSub
    expect(countJournalEntryGets()).toBe(1)

    await store.dispatch(
      purchasingApiSlice.endpoints.recordVendorPayments.initiate({
        purchaseOrderId: 'po-1',
        payments: [{ paymentMethodId: 'pm-1', amount: 10 }],
      }),
    )

    await vi.waitFor(() => expect(countJournalEntryGets()).toBe(2))
    jeSub.unsubscribe()
  })

  it('re-fetches the journal entries list after an SO payment', async () => {
    routeApiByUrl()
    const store = configureStore({
      reducer: {
        [accountingApiSlice.reducerPath]: accountingApiSlice.reducer,
        [salesApiSlice.reducerPath]: salesApiSlice.reducer,
      },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware()
          .concat(accountingApiSlice.middleware)
          .concat(salesApiSlice.middleware),
    })

    const jeSub = store.dispatch(
      accountingApiSlice.endpoints.getJournalEntries.initiate({ page: 1, limit: 20 }),
    )
    await jeSub
    expect(countJournalEntryGets()).toBe(1)

    await store.dispatch(
      salesApiSlice.endpoints.recordOrderPayments.initiate({
        id: 'so-1',
        payments: [{ paymentMethodId: 'pm-1', amount: 10, paymentDate: '2026-07-17' }],
      }),
    )

    await vi.waitFor(() => expect(countJournalEntryGets()).toBe(2))
    jeSub.unsubscribe()
  })
})
