import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import PaymentsPage from '../PaymentsPage'
import salesReducer from '@/store/slices/salesSlice'

const { useGetPaymentsQuery } = vi.hoisted(() => ({
  useGetPaymentsQuery: vi.fn(() => ({
    data: { data: [], meta: { total: 0 } },
    isLoading: false,
    isFetching: false,
    error: undefined,
    refetch: vi.fn(),
  })),
}))

vi.mock('@/store/api/salesApi', () => ({
  useGetPaymentsQuery,
  useGetCustomersQuery: vi.fn(() => ({
    data: { data: [{ id: 'cust-1', name: 'Acme Corp' }], meta: { total: 1 } },
  })),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useLazyGetJournalEntriesQuery: vi.fn(() => [vi.fn(), {}]),
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

vi.mock('@/components/common/MasterDetailWorkspace', () => ({
  default: ({ listSlot, headerSlot, workspaceSlot }: any) => (
    <div>
      <div>{listSlot}</div>
      <div>{headerSlot}</div>
      <div>{workspaceSlot}</div>
    </div>
  ),
}))

vi.mock('../components/PaymentsTable', () => ({ default: () => <div>PaymentsTable</div> }))
vi.mock('../components/PaymentContextHeader', () => ({ default: () => <div>PaymentContextHeader</div> }))
vi.mock('../components/PaymentWorkspaceCard', () => ({ default: () => <div>PaymentWorkspaceCard</div> }))
vi.mock('../components/PaymentsDialogs', () => ({ default: () => <div>PaymentsDialogs</div> }))
vi.mock('../hooks/usePaymentsWorkspace', () => ({
  usePaymentsWorkspace: () => ({
    searchInputRef: { current: null },
    focusedPaymentIndex: -1,
    paymentListRef: { current: null },
    deletedPaymentsDialogOpen: false,
    setDeletedPaymentsDialogOpen: vi.fn(),
    printDialogOpen: false,
    setPrintDialogOpen: vi.fn(),
    journalEntryRef: null,
    journalEntryRefLoading: false,
    handlePaymentSelect: vi.fn(),
    handleNavigateUp: vi.fn(),
    handleNavigateDown: vi.fn(),
    handleEnterAction: vi.fn(),
    handlePageUpNavigation: vi.fn(),
    handlePageDownNavigation: vi.fn(),
    handleNavigateToFirst: vi.fn(),
    handleNavigateToLast: vi.fn(),
    handleEscapeAction: vi.fn(),
    handleOrderClick: vi.fn(),
    handleInvoiceClick: vi.fn(),
    handleNavigateToJournalEntry: vi.fn(),
  }),
}))

function renderPage(initialUrl = '/', state?: unknown) {
  const store = configureStore({ reducer: { sales: salesReducer } })
  const url = new URL(initialUrl, 'http://localhost')

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[{ pathname: url.pathname, search: url.search, state }]}>
        <PaymentsPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('PaymentsPage FilterBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the search input', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/search by payment number or customer/i)).toBeInTheDocument()
  })

  it('restores search from URL and passes it to query', () => {
    renderPage('/?search=receipt-42')
    expect(useGetPaymentsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'receipt-42' }),
    )
  })

  it('ignores legacy customerId URL params in the query', () => {
    renderPage('/?customerId=cust-1')
    expect(useGetPaymentsQuery).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ customerId: expect.anything() }),
    )
  })

  it('renders locked chip (no × button) when customerId is preset via location state', () => {
    renderPage('/', { customerId: 'cust-1' })
    const chip = screen.getByText(/customer: acme corp/i)
    expect(chip).toBeInTheDocument()
    const chipEl = chip.closest('[class*="MuiChip"]')
    expect(chipEl?.querySelector('[data-testid="CancelIcon"]')).not.toBeInTheDocument()
  })

  it('passes customerId from location state to query', () => {
    renderPage('/', { customerId: 'cust-1' })
    expect(useGetPaymentsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ customerId: 'cust-1' }),
    )
  })

  it('renders period filter button', () => {
    renderPage()
    expect(screen.getByRole('combobox', { name: /period/i })).toBeInTheDocument()
  })

  it('renders customer filter button', () => {
    renderPage()
    expect(screen.getByRole('combobox', { name: /customer/i })).toBeInTheDocument()
  })

  it('renders status filter button', () => {
    renderPage()
    expect(screen.getByRole('combobox', { name: /status/i })).toBeInTheDocument()
  })

  it('passes status filter to query when applied', () => {
    renderPage('/?transactionStatus=completed')
    expect(useGetPaymentsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'completed' }),
    )
  })
})
