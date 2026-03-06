import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import BankReconciliationDetailsPage from './BankReconciliationDetailsPage'
import { BankReconciliationStatus } from '@/types'

const mockedApi = vi.hoisted(() => ({
  useGetBankReconciliationQuery: vi.fn(),
  useUpdateBankReconciliationMutation: vi.fn(),
  useDeleteBankReconciliationMutation: vi.fn(),
  useMarkBankReconciliationClearedMutation: vi.fn(),
  useUnmarkBankReconciliationClearedMutation: vi.fn(),
  useCompleteBankReconciliationMutation: vi.fn(),
  useReopenBankReconciliationMutation: vi.fn(),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useGetBankReconciliationQuery: mockedApi.useGetBankReconciliationQuery,
  useUpdateBankReconciliationMutation: mockedApi.useUpdateBankReconciliationMutation,
  useDeleteBankReconciliationMutation: mockedApi.useDeleteBankReconciliationMutation,
  useMarkBankReconciliationClearedMutation: mockedApi.useMarkBankReconciliationClearedMutation,
  useUnmarkBankReconciliationClearedMutation: mockedApi.useUnmarkBankReconciliationClearedMutation,
  useCompleteBankReconciliationMutation: mockedApi.useCompleteBankReconciliationMutation,
  useReopenBankReconciliationMutation: mockedApi.useReopenBankReconciliationMutation,
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}))

vi.mock('@/utils/formatters', () => ({
  formatCurrency: (value: number) => `$${value.toFixed(2)}`,
}))

const mockReconciliation = {
  id: 'recon-1',
  accountId: 'acct-1',
  fiscalPeriodId: 'period-1',
  reconciliationDate: '2026-01-31',
  statementBalance: 1000,
  bookBalance: 900,
  difference: 100,
  status: BankReconciliationStatus.IN_PROGRESS,
  isCompleted: false,
  isInProgress: true,
  isBalanced: false,
  account: { id: 'acct-1', code: '1010', name: 'Cash', type: 'ASSET' },
  fiscalPeriod: { id: 'period-1', code: '2026-01', name: 'January 2026', status: 'OPEN' },
  reconciledTransactions: [
    {
      id: 'txn-1',
      reconciliationId: 'recon-1',
      journalEntryLineId: 'line-1',
      cleared: true,
      journalEntryLine: {
        id: 'line-1',
        journalEntryId: 'entry-1',
        accountId: 'acct-1',
        debitAmount: 100,
        creditAmount: 0,
        memo: 'Deposit',
        account: { id: 'acct-1', code: '1010', name: 'Cash', type: 'ASSET' },
        journalEntry: {
          id: 'entry-1',
          referenceNumber: 'JE-001',
          entryDate: '2026-01-20',
          description: 'Deposit entry',
        },
      },
      createdAt: '2026-01-20',
      updatedAt: '2026-01-20',
    },
  ],
  createdAt: '2026-01-31',
  updatedAt: '2026-01-31',
}

const renderPage = (route = '/accounting/bank-reconciliations/recon-1') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/accounting/bank-reconciliations/:id" element={<BankReconciliationDetailsPage />} />
      </Routes>
    </MemoryRouter>
  )

describe('BankReconciliationDetailsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.useGetBankReconciliationQuery.mockReturnValue({
      data: mockReconciliation,
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    })
    mockedApi.useUpdateBankReconciliationMutation.mockReturnValue([vi.fn()])
    mockedApi.useDeleteBankReconciliationMutation.mockReturnValue([vi.fn()])
    mockedApi.useMarkBankReconciliationClearedMutation.mockReturnValue([vi.fn()])
    mockedApi.useUnmarkBankReconciliationClearedMutation.mockReturnValue([vi.fn()])
    mockedApi.useCompleteBankReconciliationMutation.mockReturnValue([vi.fn()])
    mockedApi.useReopenBankReconciliationMutation.mockReturnValue([vi.fn()])
  })

  it('renders reconciliation details', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('1010 - Cash')).toBeInTheDocument()
      expect(screen.getByText('January 2026')).toBeInTheDocument()
      expect(screen.getByText(/Difference: \$100\.00/)).toBeInTheDocument()
      expect(screen.getByText('JE-001')).toBeInTheDocument()
    })
  })

  it('renders loading state', () => {
    mockedApi.useGetBankReconciliationQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: undefined,
      refetch: vi.fn(),
    })

    renderPage()

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('renders not found state when reconciliation is missing', async () => {
    mockedApi.useGetBankReconciliationQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Bank reconciliation not found')).toBeInTheDocument()
    })
  })

  it('shows the complete action disabled when reconciliation is not balanced', () => {
    renderPage()

    expect(screen.getByText('Complete').closest('button')).toBeDisabled()
  })

  it('shows the reopen action for completed reconciliations', () => {
    mockedApi.useGetBankReconciliationQuery.mockReturnValue({
      data: {
        ...mockReconciliation,
        status: BankReconciliationStatus.COMPLETED,
        isCompleted: true,
        isInProgress: false,
        isBalanced: true,
      },
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    })

    renderPage()

    expect(screen.getByText('Reopen')).toBeInTheDocument()
    expect(screen.queryByText('Complete')).not.toBeInTheDocument()
  })

  it('renders reconciliation transactions', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Deposit entry | Deposit')).toBeInTheDocument()
      expect(screen.getAllByText('Cleared').length).toBeGreaterThan(0)
    })
  })
})
