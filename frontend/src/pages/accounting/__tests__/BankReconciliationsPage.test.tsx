import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'

import { BankReconciliationStatus } from '@/types'
import accountingReducer, { selectSelectedBankReconciliation } from '@/store/slices/accountingSlice'

import BankReconciliationsPage from '../BankReconciliationsPage'

vi.mock('@/hooks/useNotification', () => ({ useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }) }))
vi.mock('@/utils/formatters', async () => {
  const actual = await vi.importActual<typeof import('@/utils/formatters')>('@/utils/formatters')
  return { ...actual, formatCurrency: (value: number) => `$${value}`, formatDate: (date: string) => date }
})
vi.mock('@/utils/dateRange', () => ({ getPeriodDateRange: () => ({ from: undefined, to: undefined }), getStartOfWeek: () => 0 }))
vi.mock('@/components/accounting/BankReconciliationFormDialog', () => ({ default: () => null }))

const MOCK_RECONCILIATION_IN_PROGRESS = {
  id: 'rec-1',
  accountId: 'acc-1',
  fiscalPeriodId: 'fp-1',
  reconciliationDate: '2024-10-31',
  statementBalance: 1000,
  bookBalance: 900,
  difference: 100,
  status: BankReconciliationStatus.IN_PROGRESS,
  isCompleted: false,
  isInProgress: true,
  isBalanced: false,
  account: { id: 'acc-1', code: 'BANK001', name: 'Main Checking', type: 'asset' },
  fiscalPeriod: { id: 'fp-1', code: 'OCT24', name: 'October 2024', status: 'open' },
  reconciledTransactions: [
    {
      id: 'txn-1',
      reconciliationId: 'rec-1',
      journalEntryLineId: 'jel-1',
      cleared: false,
      journalEntryLine: {
        id: 'jel-1',
        journalEntryId: 'je-1',
        accountId: 'acc-1',
        debitAmount: 500,
        creditAmount: 0,
        memo: 'Deposit',
        journalEntry: { id: 'je-1', referenceNumber: 'JE-001', entryDate: '2024-10-15', description: 'Bank deposit' },
      },
      createdAt: '2024-10-31',
      updatedAt: '2024-10-31',
    },
  ],
  createdAt: '2024-10-31',
  updatedAt: '2024-10-31',
}

const MOCK_RECONCILIATION_COMPLETED = {
  ...MOCK_RECONCILIATION_IN_PROGRESS,
  id: 'rec-2',
  status: BankReconciliationStatus.COMPLETED,
  isCompleted: true,
  isInProgress: false,
  isBalanced: true,
  difference: 0,
}

const mockedApi = vi.hoisted(() => ({
  useGetBankReconciliationsQuery: vi.fn(),
  useLazyGetBankReconciliationQuery: vi.fn(),
  useDeleteBankReconciliationMutation: vi.fn(),
  useCompleteBankReconciliationMutation: vi.fn(),
  useReopenBankReconciliationMutation: vi.fn(),
  useMarkBankReconciliationClearedMutation: vi.fn(),
  useUnmarkBankReconciliationClearedMutation: vi.fn(),
}))

vi.mock('@/store/api/accountingApi', () => mockedApi)

function makeStore() {
  return configureStore({ reducer: { accounting: accountingReducer } })
}

function renderPage(initialUrl = '/accounting/bank-reconciliations') {
  const store = makeStore()
  const view = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <BankReconciliationsPage />
      </MemoryRouter>
    </Provider>,
  )
  return { ...view, store }
}

describe('BankReconciliationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, '', '/')
    mockedApi.useGetBankReconciliationsQuery.mockReturnValue({ data: { data: [], meta: { total: 0 } }, isLoading: false, refetch: vi.fn() })
    mockedApi.useLazyGetBankReconciliationQuery.mockReturnValue([vi.fn(() => ({ unwrap: vi.fn().mockResolvedValue({}) }))])
    mockedApi.useDeleteBankReconciliationMutation.mockReturnValue([vi.fn()])
    mockedApi.useCompleteBankReconciliationMutation.mockReturnValue([vi.fn()])
    mockedApi.useReopenBankReconciliationMutation.mockReturnValue([vi.fn()])
    mockedApi.useMarkBankReconciliationClearedMutation.mockReturnValue([vi.fn()])
    mockedApi.useUnmarkBankReconciliationClearedMutation.mockReturnValue([vi.fn()])
  })

  it('renders the page title', () => {
    renderPage()
    expect(screen.getByText('Bank Reconciliations')).toBeInTheDocument()
  })

  it('shows empty state via EntityTable when no reconciliations', () => {
    renderPage()

    expect(screen.getByText('No Reconciliations found')).toBeInTheDocument()
    expect(screen.getByText('Reconciliations (0)')).toBeInTheDocument()
    expect(screen.queryByText('Account')).not.toBeInTheDocument()
  })

  it('renders reconciliation account name in sidebar', () => {
    mockedApi.useGetBankReconciliationsQuery.mockReturnValue({
      data: { data: [MOCK_RECONCILIATION_IN_PROGRESS], meta: { total: 1 } },
      isLoading: false,
      refetch: vi.fn(),
    })

    renderPage()

    expect(screen.getAllByText('Main Checking').length).toBeGreaterThan(0)
    expect(screen.getAllByText('October 2024').length).toBeGreaterThan(0)
    expect(screen.getByText('Reconciliations (1)')).toBeInTheDocument()
  })

  it('passes committed search to the API query', async () => {
    renderPage()

    const searchInput = screen.getByPlaceholderText('Search reconciliations...')
    fireEvent.change(searchInput, { target: { value: 'Main' } })
    fireEvent.keyDown(searchInput, { key: 'Enter' })

    await waitFor(() => {
      expect(mockedApi.useGetBankReconciliationsQuery).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'Main' }),
      )
    })
  })

  it('shows completed reconciliation lock alert and disabled checkboxes', async () => {
    mockedApi.useGetBankReconciliationsQuery.mockReturnValue({
      data: { data: [MOCK_RECONCILIATION_COMPLETED], meta: { total: 1 } },
      isLoading: false,
      refetch: vi.fn(),
    })
    mockedApi.useLazyGetBankReconciliationQuery.mockReturnValue([
      vi.fn(() => ({ unwrap: vi.fn().mockResolvedValue(MOCK_RECONCILIATION_COMPLETED) })),
    ])

    renderPage()
    fireEvent.click(screen.getAllByText('Main Checking')[0])

    expect(await screen.findByText('This reconciliation is completed. Reopen it to make changes.')).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).toBeDisabled()
  })

  it('shows empty context header state when nothing is selected', () => {
    renderPage()

    expect(screen.getByText('Select a reconciliation to view details')).toBeInTheDocument()
  })

  it('auto-selects the reconciliation matching the ?highlight= URL param', async () => {
    mockedApi.useGetBankReconciliationsQuery.mockReturnValue({
      data: { data: [MOCK_RECONCILIATION_IN_PROGRESS], meta: { total: 1 } },
      isLoading: false,
      refetch: vi.fn(),
    })

    const { store } = renderPage('/accounting/bank-reconciliations?highlight=rec-1')

    await waitFor(() => {
      expect(selectSelectedBankReconciliation(store.getState())?.id).toBe('rec-1')
    })
  })
})
