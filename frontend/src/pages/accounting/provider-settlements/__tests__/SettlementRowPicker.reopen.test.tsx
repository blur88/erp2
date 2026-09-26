import '@testing-library/jest-dom/vitest'
import { configureStore } from '@reduxjs/toolkit'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'

import api from '@/services/api'
import { accountingApiSlice } from '@/store/api/accountingApi'

import SettlementRowPicker from '../SettlementRowPicker'

vi.mock('@/services/api', () => ({
  default: vi.fn(),
}))

/**
 * Closing New Provider Settlement and reopening it with IDENTICAL query
 * arguments must reload the eligible rows. RTK Query keeps an unsubscribed
 * result for 60s, so without refetch-on-mount a payment recorded elsewhere
 * (another tab, another user) stays invisible until a browser refresh (#1296).
 * No mutation runs in this test, so tag invalidation cannot be what passes it.
 */
const ATOME_ROW = {
  salesOrderId: 'so-1', orderNumber: 'SO-26-001', paymentMethodId: 'pm-atome', paymentMethodName: 'Atome',
  netAmount: '100.0000', payments: [],
}

// The picker's own arguments on first open: page 1, default limit, no search.
const ARGS = { settlementDate: '2026-09-26', search: undefined, page: 1, limit: 25 }

function makeStore() {
  return configureStore({
    reducer: { [accountingApiSlice.reducerPath]: accountingApiSlice.reducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(accountingApiSlice.middleware),
  })
}

function Picker({ store }: { store: ReturnType<typeof makeStore> }) {
  return (
    <Provider store={store}>
      <SettlementRowPicker settlementDate="2026-09-26" selected={[]} onChange={() => {}} enteredAmount="" />
    </Provider>
  )
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('SettlementRowPicker reopen', () => {
  it('shows a row that became eligible while the picker was closed', async () => {
    let rows: unknown[] = []
    vi.mocked(api).mockImplementation(async () => ({
      data: { data: rows, meta: { total: rows.length, page: 1, limit: 25 } },
    }))
    const store = makeStore()

    const first = render(<Picker store={store} />)
    // Wait for the first load to SETTLE, not merely start: an unmount while
    // the request is in flight would let the remount join that request.
    await vi.waitFor(() => expect(
      accountingApiSlice.endpoints.getEligibleSettlementRows.select(ARGS)(store.getState() as any).status,
    ).toBe('fulfilled'))
    expect(vi.mocked(api)).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('SO-26-001')).not.toBeInTheDocument()
    first.unmount()

    rows = [ATOME_ROW]
    render(<Picker store={store} />)

    expect(await screen.findByText('SO-26-001')).toBeInTheDocument()
    expect(screen.getByText('Atome')).toBeInTheDocument()
    expect(vi.mocked(api)).toHaveBeenCalledTimes(2)
  })
})
