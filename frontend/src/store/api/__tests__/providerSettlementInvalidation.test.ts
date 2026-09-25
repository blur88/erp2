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

const LIST_URL = '/accounting/provider-settlements'
const DETAIL_URL = '/accounting/provider-settlements/ps-1'

/**
 * GET requests to EXACTLY `url`. Queries carry no method (the transport
 * defaults to GET); mutations set one. Matching by prefix, or counting every
 * method, would let the mutation's own PATCH stand in for a missing refetch.
 */
function countGets(url: string): number {
  return vi
    .mocked(api)
    .mock.calls.filter(([config]: any[]) =>
      config.url === url && (config.method ?? 'GET').toUpperCase() === 'GET',
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

    // Each subscription fetched exactly once before the mutation.
    expect(countGets(LIST_URL)).toBe(1)
    expect(countGets(DETAIL_URL)).toBe(1)

    await mutate(store)

    // …and each refetches exactly once after it.
    await vi.waitFor(() => {
      expect(countGets(LIST_URL)).toBe(2)
      expect(countGets(DETAIL_URL)).toBe(2)
    })

    list.unsubscribe()
    detail.unsubscribe()
  })
})
