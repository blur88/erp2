import { act, renderHook, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useInvoicesWorkspace, type InvoiceListItem } from './useInvoicesWorkspace'

import salesReducer, { selectSelectedInvoice } from '@/store/slices/salesSlice'

const navigateSpy = vi.fn()
const fetchJournalEntries = vi.fn(() => ({
  unwrap: vi.fn().mockResolvedValue({ data: [] }),
}))
const triggerGetSalesOrder = vi.fn((id: string) => ({
  unwrap: vi.fn().mockResolvedValue({
    id,
    orderNumber: `SO-${id}`,
    isFulfilled: true,
    payments: [
      { id: `pay-${id}`, paymentNumber: 'PAY-001', amount: 100, paymentDate: '2026-04-01' },
    ],
    invoices: [],
  }),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')

  return {
    ...actual,
    useNavigate: () => navigateSpy,
  }
})

vi.mock('@/store/api/accountingApi', () => ({
  useLazyGetJournalEntriesQuery: () => [fetchJournalEntries],
}))

vi.mock('@/store/api/salesApi', () => ({
  useLazyGetSalesOrderQuery: () => [triggerGetSalesOrder],
}))

const makeInvoice = (id: string): InvoiceListItem => ({
  id,
  invoiceNumber: `INV-${id}`,
  customerName: `Customer ${id}`,
  paidAmount: 0,
  status: 'draft',
  salesOrder: { id: `order-${id}`, orderNumber: `SO-${id}` },
})

const renderInvoicesWorkspace = (
  initialEntry: string | { pathname: string; search?: string; state?: unknown } = {
    pathname: '/sales/invoices',
    state: { highlightInvoiceId: 'inv-2' },
  },
) => {
  const store = configureStore({
    reducer: {
      sales: salesReducer,
    },
  })

  const wrapper = ({ children }: PropsWithChildren) => (
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>
    </Provider>
  )

  let selectedInvoice = null as InvoiceListItem | null

  const result = renderHook(
    () =>
      useInvoicesWorkspace({
        dispatch: store.dispatch,
        invoices: [makeInvoice('inv-1'), makeInvoice('inv-2')],
        selectedInvoice,
        refetch: vi.fn(),
      }),
    { wrapper },
  )

  return {
    ...result,
    store,
    syncSelectedInvoice: () => {
      selectedInvoice = selectSelectedInvoice(store.getState()) as InvoiceListItem | null
      result.rerender()
    },
  }
}

describe('useInvoicesWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, '', '/')
  })

  it('selects the invoice referenced by location state', async () => {
    const { result, store } = renderInvoicesWorkspace()

    await waitFor(() => {
      expect(selectSelectedInvoice(store.getState())?.id).toBe('inv-2')
    })

    expect(result.current.focusedInvoiceIndex).toBe(1)
  })

  it('does not open an edit dialog on Enter when an invoice is selected', async () => {
    const { result, syncSelectedInvoice } = renderInvoicesWorkspace('/sales/invoices')

    await act(async () => {
      result.current.handleInvoiceSelect(makeInvoice('inv-1'))
    })
    syncSelectedInvoice()

    act(() => {
      result.current.handleEnterAction()
    })

    expect(navigateSpy).not.toHaveBeenCalled()
  })

  it('fetches the full sales order when an invoice is selected', async () => {
    const { result, syncSelectedInvoice } = renderInvoicesWorkspace('/sales/invoices')

    await act(async () => {
      result.current.handleInvoiceSelect(makeInvoice('inv-1'))
    })
    syncSelectedInvoice()

    await waitFor(() => {
      expect(triggerGetSalesOrder).toHaveBeenCalledWith('order-inv-1')
    })
  })

  it('fetches payment JEs from the full order', async () => {
    const { result, syncSelectedInvoice } = renderInvoicesWorkspace('/sales/invoices')

    await act(async () => {
      result.current.handleInvoiceSelect(makeInvoice('inv-1'))
    })
    syncSelectedInvoice()

    await waitFor(() => {
      expect(fetchJournalEntries).toHaveBeenCalledWith(
        expect.objectContaining({ sourceType: 'payment', sourceId: 'pay-order-inv-1' }),
      )
    })
  })

  it('does not fetch sales_order JEs using the invoice salesOrder.id directly — only via fullOrder', async () => {
    const { result, syncSelectedInvoice } = renderInvoicesWorkspace('/sales/invoices')

    await act(async () => {
      result.current.handleInvoiceSelect(makeInvoice('inv-1'))
    })
    syncSelectedInvoice()

    // wait for the full order to load and payment JE fetch to fire
    await waitFor(() => {
      expect(triggerGetSalesOrder).toHaveBeenCalledWith('order-inv-1')
    })
    await waitFor(() => {
      expect(fetchJournalEntries).toHaveBeenCalledWith(
        expect.objectContaining({ sourceType: 'payment' }),
      )
    })

    // the sales_order JE fetch must go through fullOrder (sourceId = fullOrder.id = 'order-inv-1')
    // not hardcoded from selectedInvoice.salesOrder.id — both happen to be the same value,
    // but the call must only happen once (via fullOrder path, not also via a direct invoice path)
    const salesOrderCalls = (fetchJournalEntries as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call: any[]) => call[0]?.sourceType === 'sales_order',
    )
    expect(salesOrderCalls).toHaveLength(1)
  })
})
