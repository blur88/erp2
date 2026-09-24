import { configureStore } from '@reduxjs/toolkit'
import { afterEach, describe, expect, it, vi } from 'vitest'

import api from '@/services/api'
import { accountingApiSlice } from '@/store/api/accountingApi'

vi.mock('@/services/api', () => ({
  default: vi.fn(),
}))

function routeApiByUrl() {
  vi.mocked(api).mockImplementation(async (config: any) => {
    const url = typeof config.url === 'string' ? config.url : ''
    if (url === '/accounting/provider-settlements') {
      return { data: { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } } }
    }
    if (url.startsWith('/accounting/provider-settlements/')) {
      return { data: { id: 'ps-1', referenceNumber: 'PS-1', status: 'DRAFT' } }
    }
    return { data: { id: 'x' } }
  })
}

function countGets(urlPart: string): number {
  return vi
    .mocked(api)
    .mock.calls.filter(([config]: any[]) =>
      typeof config.url === 'string' && config.url.includes(urlPart),
    ).length
}

afterEach(() => {
  vi.clearAllMocks()
})

// #1285: the list/detail warning is a pure function of the fetched payload, so
// both the draft's own edit and a change to the account's flag must refetch
// both subscriptions. The account case only passes while updateAccount carries
// the 'ProviderSettlement' tag.
describe('ProviderSettlement invalidation', () => {
  it.each([
    ['a draft edit', (s: any) => s.dispatch(
      accountingApiSlice.endpoints.updateProviderSettlement.initiate({
        id: 'ps-1',
        body: { rows: [], bankAccountId: 'b' },
      } as any),
    )],
    ['an account flag change', (s: any) => s.dispatch(
      accountingApiSlice.endpoints.updateAccount.initiate({
        id: 'acc-1',
        data: { isProviderClearing: false },
      }),
    )],
  ])('re-fetches the settlement list and detail after %s', async (_n, mutate) => {
    routeApiByUrl()
    const store = configureStore({
      reducer: { [accountingApiSlice.reducerPath]: accountingApiSlice.reducer },
      middleware: (g) => g().concat(accountingApiSlice.middleware),
    })

    const list = store.dispatch(
      accountingApiSlice.endpoints.getProviderSettlements.initiate({ page: 1, limit: 20 } as any),
    )
    const detail = store.dispatch(
      accountingApiSlice.endpoints.getProviderSettlement.initiate('ps-1'),
    )
    await list
    await detail

    const before = countGets('/accounting/provider-settlements')
    await mutate(store)

    await vi.waitFor(() =>
      expect(countGets('/accounting/provider-settlements')).toBeGreaterThanOrEqual(before + 2),
    )

    list.unsubscribe()
    detail.unsubscribe()
  })
})
