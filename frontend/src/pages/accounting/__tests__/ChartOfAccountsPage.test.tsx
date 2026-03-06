import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'

import ChartOfAccountsPage from '../ChartOfAccountsPage'

const mockedApi = vi.hoisted(() => ({
  useGetChartOfAccountsQuery: vi.fn(),
  useDeleteChartOfAccountMutation: vi.fn(),
  useSeedDefaultChartOfAccountsMutation: vi.fn(),
  useCreateChartOfAccountMutation: vi.fn(),
  useUpdateChartOfAccountMutation: vi.fn(),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useGetChartOfAccountsQuery: mockedApi.useGetChartOfAccountsQuery,
  useDeleteChartOfAccountMutation: mockedApi.useDeleteChartOfAccountMutation,
  useSeedDefaultChartOfAccountsMutation: mockedApi.useSeedDefaultChartOfAccountsMutation,
  useCreateChartOfAccountMutation: mockedApi.useCreateChartOfAccountMutation,
  useUpdateChartOfAccountMutation: mockedApi.useUpdateChartOfAccountMutation,
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}))

vi.mock('@/hooks/useSearchAndFilter', () => ({
  useSearchAndFilter: () => ({
    searchTerm: '',
    setSearchTerm: vi.fn(),
    focusSearchInput: vi.fn(),
  }),
  useKeyboardShortcuts: vi.fn(),
}))

vi.mock('@/components/accounting/AccountMappingWarning', () => ({
  default: () => null,
}))

vi.mock('@/components/accounting/DeletedAccountsDialog', () => ({
  default: () => null,
}))

const mockAccounts = [
  {
    id: '1',
    code: '1000',
    name: 'Assets',
    type: 'asset',
    normalBalance: 'debit',
    isActive: true,
    isSystemAccount: false,
    currentBalance: 0,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: '2',
    code: '1100',
    name: 'Cash',
    type: 'asset',
    normalBalance: 'debit',
    parentId: '1',
    isActive: true,
    isSystemAccount: false,
    currentBalance: 5000,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: '3',
    code: '2000',
    name: 'Liabilities',
    type: 'liability',
    normalBalance: 'credit',
    isActive: true,
    isSystemAccount: false,
    currentBalance: 0,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
]

const renderWithProvider = () =>
  render(
    <BrowserRouter>
      <ChartOfAccountsPage />
    </BrowserRouter>
  )

describe('ChartOfAccountsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.useGetChartOfAccountsQuery.mockReturnValue({
      data: {
        data: mockAccounts,
        meta: { page: 1, limit: 1000, total: 3, totalPages: 1 },
      },
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    })
    mockedApi.useDeleteChartOfAccountMutation.mockReturnValue([vi.fn()])
    mockedApi.useSeedDefaultChartOfAccountsMutation.mockReturnValue([vi.fn()])
    mockedApi.useCreateChartOfAccountMutation.mockReturnValue([vi.fn()])
    mockedApi.useUpdateChartOfAccountMutation.mockReturnValue([vi.fn()])
  })

  it('renders page header correctly', async () => {
    renderWithProvider()

    await waitFor(() => {
      expect(screen.getByText('Chart of Accounts')).toBeInTheDocument()
    })
  })

  it('renders account list with correct data', async () => {
    renderWithProvider()

    await waitFor(() => {
      expect(screen.getByText('1000')).toBeInTheDocument()
      expect(screen.getByText('1100')).toBeInTheDocument()
      expect(screen.getByText('2000')).toBeInTheDocument()
    })

    expect(screen.getAllByText('Assets').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Cash').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Liabilities').length).toBeGreaterThan(0)
  })

  it('opens create dialog when Add Account button is clicked', async () => {
    renderWithProvider()

    await waitFor(() => {
      expect(screen.getByText('Chart of Accounts')).toBeInTheDocument()
    })

    const addButton = screen.getByRole('button', { name: /Add Account/i })
    fireEvent.click(addButton)

    await waitFor(() => {
      expect(screen.getByText('Add New Account')).toBeInTheDocument()
    })
  })

  it('displays account type badges with correct colors', async () => {
    renderWithProvider()

    await waitFor(() => {
      const assetBadges = screen.getAllByText('Asset')
      expect(assetBadges.length).toBeGreaterThan(0)
      expect(screen.getByText('Liability')).toBeInTheDocument()
    })
  })

  it('filters accounts by search term', async () => {
    renderWithProvider()

    const searchInput = screen.getByPlaceholderText(/Search by code or name/i)
    fireEvent.change(searchInput, { target: { value: 'Cash' } })

    await waitFor(() => {
      expect(searchInput).toHaveValue('Cash')
    })
  })

  it('shows seed button when no accounts exist', async () => {
    mockedApi.useGetChartOfAccountsQuery.mockReturnValue({
      data: {
        data: [],
        meta: { page: 1, limit: 1000, total: 0, totalPages: 0 },
      },
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    })

    renderWithProvider()

    await waitFor(() => {
      expect(screen.getAllByText(/Seed Default/i).length).toBeGreaterThan(0)
    })
  })

  it('displays loading spinner when loading', () => {
    mockedApi.useGetChartOfAccountsQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: undefined,
      refetch: vi.fn(),
    })

    renderWithProvider()

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('displays active/inactive status chips', async () => {
    renderWithProvider()

    await waitFor(() => {
      const activeChips = screen.getAllByText('Active')
      expect(activeChips.length).toBeGreaterThanOrEqual(3)
    })
  })

  it('handles errors gracefully', async () => {
    mockedApi.useGetChartOfAccountsQuery.mockReturnValue({
      data: { data: [], meta: { page: 1, limit: 1000, total: 0, totalPages: 0 } },
      isLoading: false,
      error: { data: 'Failed to fetch accounts' },
      refetch: vi.fn(),
    })

    renderWithProvider()

    await waitFor(() => {
      expect(screen.getByText('Chart of Accounts')).toBeInTheDocument()
    })
  })

  it('disables delete button for system accounts', async () => {
    mockedApi.useGetChartOfAccountsQuery.mockReturnValue({
      data: {
        data: [{ ...mockAccounts[0], isSystemAccount: true }],
        meta: { page: 1, limit: 1000, total: 1, totalPages: 1 },
      },
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    })

    renderWithProvider()

    await waitFor(() => {
      expect(screen.getAllByText('Assets').length).toBeGreaterThan(0)
    })

    const deleteButtons = screen.getAllByLabelText(/Delete account/i)
    expect(deleteButtons.some((btn) => (btn as HTMLButtonElement).disabled)).toBe(true)
  })
})
