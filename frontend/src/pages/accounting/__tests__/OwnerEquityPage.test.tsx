import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'

import OwnerEquityPage from '../OwnerEquityPage'
import accountingReducer, { selectSelectedOwnerEquityTransaction } from '@/store/slices/accountingSlice'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ search: '', pathname: '/accounting/owner-equity', state: null }),
  }
})

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))
vi.mock('@/utils/dateRange', () => ({
  getPeriodDateRange: () => ({ from: undefined, to: undefined }),
  getStartOfWeek: () => 0,
}))
vi.mock('@/utils/formatters', async () => {
  const actual = await vi.importActual<typeof import('@/utils/formatters')>('@/utils/formatters')
  return { ...actual, formatDate: (value: string) => value, formatCurrency: (value: number) => `$${value}` }
})

const mockedApi = vi.hoisted(() => ({
  useGetOwnerEquityTransactionsQuery: vi.fn(),
  useGetPaymentMethodsQuery: vi.fn(),
  useCreateOwnerEquityTransactionMutation: vi.fn(),
  useUpdateOwnerEquityTransactionMutation: vi.fn(),
  useDeleteOwnerEquityTransactionMutation: vi.fn(),
  usePostOwnerEquityTransactionMutation: vi.fn(),
  useReverseOwnerEquityTransactionMutation: vi.fn(),
  useLazyGetJournalEntriesQuery: vi.fn(),
}))

vi.mock('@/store/api/accountingApi', () => mockedApi)

const TX_1 = {
  id: 'tx-1',
  referenceNumber: 'EQ-001',
  transactionDate: '2026-02-15',
  type: 'capital_injection' as const,
  amount: 500,
  paymentMethodId: 'pm-1',
  paymentMethod: { id: 'pm-1', code: 'CASH', name: 'Cash' },
  description: 'Initial owner capital',
  status: 'draft' as const,
  createdAt: '2026-02-15',
  updatedAt: '2026-02-15',
}

const TX_2 = {
  id: 'tx-2',
  referenceNumber: 'EQ-002',
  transactionDate: '2026-03-01',
  type: 'owner_drawing' as const,
  amount: 200,
  paymentMethodId: 'pm-1',
  paymentMethod: { id: 'pm-1', code: 'CASH', name: 'Cash' },
  description: 'Owner withdrawal',
  status: 'draft' as const,
  createdAt: '2026-03-01',
  updatedAt: '2026-03-01',
}

function makeStore() {
  return configureStore({ reducer: { accounting: accountingReducer } })
}

function renderPage(initialUrl = '/accounting/owner-equity') {
  const store = makeStore()
  const view = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <OwnerEquityPage />
      </MemoryRouter>
    </Provider>,
  )
  return { ...view, store }
}

describe('OwnerEquityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.useGetOwnerEquityTransactionsQuery.mockReturnValue({
      data: { data: [TX_1, TX_2] },
      isLoading: false,
      refetch: vi.fn(),
    })
    mockedApi.useGetPaymentMethodsQuery.mockReturnValue({
      data: { data: [{ id: 'pm-1', code: 'CASH', name: 'Cash', isActive: true }] },
    })
    mockedApi.useCreateOwnerEquityTransactionMutation.mockReturnValue([vi.fn()])
    mockedApi.useUpdateOwnerEquityTransactionMutation.mockReturnValue([vi.fn()])
    mockedApi.useDeleteOwnerEquityTransactionMutation.mockReturnValue([vi.fn()])
    mockedApi.usePostOwnerEquityTransactionMutation.mockReturnValue([vi.fn()])
    mockedApi.useReverseOwnerEquityTransactionMutation.mockReturnValue([vi.fn()])
    mockedApi.useLazyGetJournalEntriesQuery.mockReturnValue([
      vi.fn().mockReturnValue({ unwrap: () => Promise.resolve({ data: [] }) }),
    ])
  })

  it('renders title and transaction rows', () => {
    renderPage()
    expect(screen.getByText('Owner Equity')).toBeInTheDocument()
    expect(screen.getAllByText('EQ-001')[0]).toBeInTheDocument()
    expect(screen.getByText('EQ-002')).toBeInTheDocument()
  })

  it('shows detail content after clicking a row', () => {
    renderPage()
    fireEvent.click(screen.getAllByText('EQ-001')[0])
    expect(screen.getByText('Initial owner capital')).toBeInTheDocument()
  })

  it('navigates the list with keyboard arrow keys', () => {
    renderPage()
    // First item is auto-selected on load — its description should be visible
    expect(screen.getByText('Initial owner capital')).toBeInTheDocument()
    // ArrowDown moves selection to second item
    fireEvent.keyDown(document, { key: 'ArrowDown' })
    expect(screen.getByText('Owner withdrawal')).toBeInTheDocument()
  })

  it('auto-selects the transaction matching the ?highlight= URL param', async () => {
    const { store } = renderPage('/accounting/owner-equity?highlight=tx-1')

    await waitFor(() => {
      expect(selectSelectedOwnerEquityTransaction(store.getState())?.id).toBe('tx-1')
    })
  })
})
