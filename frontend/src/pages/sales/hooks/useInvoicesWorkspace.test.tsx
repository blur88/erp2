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

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')

  return {
    ...actual,
    useNavigate: () => navigateSpy,
  }
})

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showError: vi.fn() }),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useLazyGetJournalEntriesQuery: () => [fetchJournalEntries],
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
})
