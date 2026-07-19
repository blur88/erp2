import { configureStore } from '@reduxjs/toolkit'
import { afterEach, describe, expect, it, vi } from 'vitest'

import api from '@/services/api'
import { accountingApiSlice } from '@/store/api/accountingApi'
import { salesApiSlice } from '@/store/api/salesApi'

vi.mock('@/services/api', () => ({
  default: vi.fn(),
}))

function routeApiByUrl() {
  vi.mocked(api).mockImplementation(async (config: any) => {
    if (typeof config.url === 'string' && config.url.includes('/accounting/journal-entries')) {
      return { data: { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } } }
    }
    if (typeof config.url === 'string' && config.url.includes('/accounting/trial-balance')) {
      return { data: { rows: [], totalDebit: '0.0000', totalCredit: '0.0000', difference: '0.0000', balanced: true } }
    }
    if (typeof config.url === 'string' && config.url.includes('/accounting/accounts')) {
      return { data: { id: 'acc-1', code: '1000', name: 'Cash' } }
    }
    return { data: { id: 'src-1' } }
  })
}

function countByUrl(fragment: string): number {
  return vi
    .mocked(api)
    .mock.calls.filter(([config]: any[]) =>
      typeof config.url === 'string' && config.url.includes(fragment),
    ).length
}

function countTrialBalanceGets(): number {
  return countByUrl('/accounting/trial-balance')
}

function makeStore() {
  return configureStore({
    reducer: {
      [accountingApiSlice.reducerPath]: accountingApiSlice.reducer,
      [salesApiSlice.reducerPath]: salesApiSlice.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware()
        .concat(accountingApiSlice.middleware)
        .concat(salesApiSlice.middleware),
  })
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('Trial Balance cross-slice invalidation', () => {
  it('re-fetches Trial Balance after a sales payment', async () => {
    routeApiByUrl()
    const store = makeStore()

    const tbSub = store.dispatch(
      accountingApiSlice.endpoints.getTrialBalance.initiate({ asOfDate: '2026-01-01' }),
    )
    await tbSub
    expect(countTrialBalanceGets()).toBe(1)

    await store.dispatch(
      salesApiSlice.endpoints.recordOrderPayments.initiate({
        id: 'so-1',
        payments: [{ paymentMethodId: 'pm-1', amount: 10, paymentDate: '2026-07-17' }],
      }),
    )

    await vi.waitFor(() => expect(countTrialBalanceGets()).toBe(2))
    tbSub.unsubscribe()
  })

  it('re-fetches Trial Balance and Journal Entries after createAccount', async () => {
    routeApiByUrl()
    const store = makeStore()

    const tbSub = store.dispatch(
      accountingApiSlice.endpoints.getTrialBalance.initiate({ asOfDate: '2026-01-01' }),
    )
    const jeSub = store.dispatch(
      accountingApiSlice.endpoints.getJournalEntries.initiate({ page: 1, limit: 20 }),
    )
    await Promise.all([tbSub, jeSub])
    expect(countTrialBalanceGets()).toBe(1)
    expect(countByUrl('/accounting/journal-entries')).toBe(1)

    await store.dispatch(
      accountingApiSlice.endpoints.createAccount.initiate({ code: '1000', name: 'Cash' }),
    )

    await vi.waitFor(() => expect(countTrialBalanceGets()).toBe(2))
    await vi.waitFor(() => expect(countByUrl('/accounting/journal-entries')).toBe(2))
    tbSub.unsubscribe()
    jeSub.unsubscribe()
  })

  it('does NOT re-fetch Trial Balance after updateAccount', async () => {
    routeApiByUrl()
    const store = makeStore()

    const tbSub = store.dispatch(
      accountingApiSlice.endpoints.getTrialBalance.initiate({ asOfDate: '2026-01-01' }),
    )
    await tbSub
    expect(countTrialBalanceGets()).toBe(1)

    await store.dispatch(
      accountingApiSlice.endpoints.updateAccount.initiate({ id: 'acc-1', data: { name: 'Renamed' } }),
    )

    await new Promise((r) => setTimeout(r, 50))
    expect(countTrialBalanceGets()).toBe(1)
    tbSub.unsubscribe()
  })
})
