import { configureStore } from '@reduxjs/toolkit'
import { afterEach, describe, expect, it, vi } from 'vitest'

import api from '@/services/api'
import { accountingApiSlice } from '@/store/api/accountingApi'
import { salesApiSlice } from '@/store/api/salesApi'

vi.mock('@/services/api', () => ({
  default: vi.fn(),
}))

/**
 * A sales payment, refund or unpay changes which rows New Provider Settlement
 * may offer (eligibility = a payment with an unreversed posting journal).
 * salesApi and accountingApi are separate createApi instances, so the sales
 * mutations must invalidate `ProviderSettlement` cross-slice, or the picker
 * keeps serving pre-payment rows until a browser refresh (issue #1296).
 */
const ATOME_ROW = {
  salesOrderId: 'so-1', orderNumber: 'SO-26-001', paymentMethodId: 'pm-atome', paymentMethodName: 'Atome',
  netAmount: '100.0000', payments: [{ id: 'p-1', paymentDate: '2026-09-20', amount: '100.0000', referenceNumber: null }],
}

const ELIGIBLE_URL = '/accounting/provider-settlements/eligible-rows'

function routeApiByUrl(eligible: () => unknown[]) {
  vi.mocked(api).mockImplementation(async (config: any) => {
    if (config.url === ELIGIBLE_URL) {
      const rows = eligible()
      return { data: { data: rows, meta: { total: rows.length, page: 1, limit: 25 } } }
    }
    return { data: { id: 'so-1' } }
  })
}

/** GET requests to exactly the eligible-rows URL; the mutations' own POSTs never count. */
function countEligibleGets(): number {
  return vi
    .mocked(api)
    .mock.calls.filter(([config]: any[]) =>
      config.url === ELIGIBLE_URL && (config.method ?? 'GET').toUpperCase() === 'GET',
    ).length
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

const ARGS = { settlementDate: '2026-09-26', page: 1, limit: 25 }
const selectRows = (store: ReturnType<typeof makeStore>) =>
  accountingApiSlice.endpoints.getEligibleSettlementRows.select(ARGS)(store.getState() as any).data?.data

const MUTATIONS = {
  recordOrderPayments: () => salesApiSlice.endpoints.recordOrderPayments.initiate({
    id: 'so-1', payments: [{ paymentMethodId: 'pm-atome', amount: '100', paymentDate: '2026-09-20' }],
  }),
  recordOrderRefunds: () => salesApiSlice.endpoints.recordOrderRefunds.initiate({
    id: 'so-1', refunds: [{ paymentMethodId: 'pm-atome', amount: '100', paymentDate: '2026-09-20' }],
  }),
  unpaySalesOrder: () => salesApiSlice.endpoints.unpaySalesOrder.initiate('so-1'),
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('Provider settlement eligible rows cross-slice invalidation', () => {
  it.each(Object.keys(MUTATIONS) as (keyof typeof MUTATIONS)[])(
    're-fetches the eligible rows after %s',
    async (name) => {
      let rows: unknown[] = []
      routeApiByUrl(() => rows)
      const store = makeStore()

      const sub = store.dispatch(accountingApiSlice.endpoints.getEligibleSettlementRows.initiate(ARGS))
      await sub
      expect(countEligibleGets()).toBe(1)
      expect(selectRows(store)).toEqual([])

      rows = [ATOME_ROW]
      await store.dispatch(MUTATIONS[name]())

      await vi.waitFor(() => expect(countEligibleGets()).toBe(2))
      await vi.waitFor(() => expect(selectRows(store)).toEqual([ATOME_ROW]))
      sub.unsubscribe()
    },
  )

  it('does not re-fetch the eligible rows when the mutation fails', async () => {
    vi.mocked(api).mockImplementation(async (config: any) => {
      if (config.url === ELIGIBLE_URL) return { data: { data: [], meta: { total: 0, page: 1, limit: 25 } } }
      throw Object.assign(new Error('boom'), { response: { status: 500, data: { message: 'boom' } } })
    })
    const store = makeStore()

    const sub = store.dispatch(accountingApiSlice.endpoints.getEligibleSettlementRows.initiate(ARGS))
    await sub
    await store.dispatch(MUTATIONS.recordOrderPayments())

    expect(countEligibleGets()).toBe(1)
    sub.unsubscribe()
  })
})
