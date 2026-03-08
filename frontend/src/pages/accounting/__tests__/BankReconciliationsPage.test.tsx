import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'

import BankReconciliationsPage from '../BankReconciliationsPage'
import { BankReconciliationStatus, FiscalPeriodStatus } from '@/types'

const mockedApi = vi.hoisted(() => ({
  useGetBankReconciliationsQuery: vi.fn(),
  useDeleteBankReconciliationMutation: vi.fn(),
  useGetChartOfAccountsQuery: vi.fn(),
  useGetFiscalPeriodsQuery: vi.fn(),
}))

const mockNavigate = vi.fn()
const mockLocation = { pathname: '/accounting/bank-reconciliations' }

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => mockLocation,
  }
})

vi.mock('@/store/api/accountingApi', () => ({
  useGetBankReconciliationsQuery: mockedApi.useGetBankReconciliationsQuery,
  useDeleteBankReconciliationMutation: mockedApi.useDeleteBankReconciliationMutation,
  useGetChartOfAccountsQuery: mockedApi.useGetChartOfAccountsQuery,
  useGetFiscalPeriodsQuery: mockedApi.useGetFiscalPeriodsQuery,
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}))

vi.mock('@/components/accounting/BankReconciliationFormDialog', () => ({
  default: () => null,
}))

const mockReconciliations = [
  {
    id: 'recon-1',
    accountId: 'acct-1',
    fiscalPeriodId: 'period-1',
    reconciliationDate: '2026-01-31',
    statementBalance: 1000,
    bookBalance: 1000,
    difference: 0,
    status: BankReconciliationStatus.IN_PROGRESS,
    isCompleted: false,
    isInProgress: true,
    isBalanced: true,
    account: { id: 'acct-1', code: '1010', name: 'Cash', type: 'ASSET' },
    fiscalPeriod: { id: 'period-1', code: '2026-01', name: 'January 2026', status: 'OPEN' },
    createdAt: '2026-01-31',
    updatedAt: '2026-01-31',
  },
]

const renderPage = () =>
  render(
    <BrowserRouter>
      <BankReconciliationsPage />
    </BrowserRouter>
  )

describe('BankReconciliationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    mockLocation.pathname = '/accounting/bank-reconciliations'
    mockedApi.useGetBankReconciliationsQuery.mockReturnValue({
      data: {
        data: mockReconciliations,
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      },
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    })
    mockedApi.useDeleteBankReconciliationMutation.mockReturnValue([vi.fn()])
    mockedApi.useGetChartOfAccountsQuery.mockReturnValue({
      data: {
        data: [{ id: 'acct-1', code: '1010', name: 'Cash', type: 'ASSET' }],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      },
    })
    mockedApi.useGetFiscalPeriodsQuery.mockReturnValue({
      data: {
        data: [
          {
            id: 'period-1',
            code: '2026-01',
            name: 'January 2026',
            startDate: '2026-01-01',
            endDate: '2026-01-31',
            status: FiscalPeriodStatus.OPEN,
            isOpen: true,
            isClosed: false,
            durationDays: 31,
            createdAt: '2026-01-01',
            updatedAt: '2026-01-01',
          },
        ],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      },
    })
  })

  it('renders reconciliation list data', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Bank Reconciliations')).toBeInTheDocument()
      expect(screen.getByText('1010 - Cash')).toBeInTheDocument()
      expect(screen.getByText('January 2026')).toBeInTheDocument()
    })
  })

  it('shows empty state when no reconciliations exist', async () => {
    mockedApi.useGetBankReconciliationsQuery.mockReturnValue({
      data: { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } },
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('No reconciliations found')).toBeInTheDocument()
    })
  })

  it('navigates to the details page when a row is clicked', async () => {
    renderPage()

    const row = await screen.findByText('1010 - Cash')
    fireEvent.click(row.closest('tr') as HTMLElement)

    expect(mockNavigate).toHaveBeenCalledWith('/accounting/bank-reconciliations/recon-1')
  })

  it('navigates to the create route when New Reconciliation is clicked', () => {
    renderPage()

    fireEvent.click(screen.getByText('New Reconciliation'))

    expect(mockNavigate).toHaveBeenCalledWith('/accounting/bank-reconciliations/new')
  })
})
