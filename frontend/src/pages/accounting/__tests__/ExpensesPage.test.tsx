import { fireEvent, render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ExpensesPage from '../ExpensesPage'

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}))

vi.mock('@/hooks/useJournalEntryRef', () => ({
  useJournalEntryRef: () => ({
    journalEntryRef: null,
    journalEntryRefLoading: false,
    navigateToJournalEntry: vi.fn(),
  }),
}))

const mockedApi = vi.hoisted(() => ({
  useGetExpensesQuery: vi.fn(),
  useGetPaymentMethodsQuery: vi.fn(),
  useGetChartOfAccountsQuery: vi.fn(),
  useCreateExpenseMutation: vi.fn(),
  useUpdateExpenseMutation: vi.fn(),
  useDeleteExpenseMutation: vi.fn(),
  usePostExpenseMutation: vi.fn(),
  useBulkPostExpensesMutation: vi.fn(),
  useBulkDeleteExpensesMutation: vi.fn(),
}))

vi.mock('@/utils/dateRange', () => ({
  getPeriodDateRange: () => ({ from: undefined, to: undefined }),
  getStartOfWeek: () => 0,
}))

vi.mock('@/utils/formatters', async () => {
  const actual = await vi.importActual<typeof import('@/utils/formatters')>('@/utils/formatters')
  return { ...actual, formatDate: (value: string) => value, formatCurrency: (value: number) => `$${value}` }
})

vi.mock('@/store/api/accountingApi', () => mockedApi)

const expenseListRow = () => screen.getAllByText('EXP-001')[0]

const expense1 = {
  id: 'ex-1',
  referenceNumber: 'EXP-001',
  expenseDate: '2026-02-15',
  expenseAccountId: 'coa-1',
  expenseAccount: { id: 'coa-1', code: '6000', name: 'Office Supplies' },
  amount: 225.5,
  paymentMethodId: 'pm-1',
  paymentMethod: { id: 'pm-1', code: 'CASH', name: 'Cash' },
  vendor: 'Stationery Hub',
  description: 'Printer paper and ink',
  status: 'draft' as const,
  createdAt: '2026-02-15',
  updatedAt: '2026-02-15',
}

const renderPage = () =>
  render(
    <BrowserRouter>
      <ExpensesPage />
    </BrowserRouter>,
  )

describe('ExpensesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.useGetExpensesQuery.mockReturnValue({
      data: { data: [expense1] },
      isLoading: false,
      refetch: vi.fn(),
    })
    mockedApi.useGetPaymentMethodsQuery.mockReturnValue({
      data: { data: [{ id: 'pm-1', code: 'CASH', name: 'Cash', isActive: true }] },
    })
    mockedApi.useGetChartOfAccountsQuery.mockReturnValue({
      data: { data: [{ id: 'coa-1', code: '6000', name: 'Office Supplies', type: 'EXPENSE', isActive: true }] },
    })
    mockedApi.useCreateExpenseMutation.mockReturnValue([vi.fn()])
    mockedApi.useUpdateExpenseMutation.mockReturnValue([vi.fn()])
    mockedApi.useDeleteExpenseMutation.mockReturnValue([vi.fn()])
    mockedApi.usePostExpenseMutation.mockReturnValue([vi.fn()])
    mockedApi.useBulkPostExpensesMutation.mockReturnValue([vi.fn()])
    mockedApi.useBulkDeleteExpensesMutation.mockReturnValue([vi.fn()])
  })

  it('renders the page title', () => {
    renderPage()
    expect(screen.getByText('Expenses')).toBeInTheDocument()
  })

  it('shows expense reference number in the narrow list', () => {
    renderPage()
    expect(screen.getAllByText('EXP-001').length).toBeGreaterThan(0)
  })

  it('bulk action buttons are hidden when no rows are selected', () => {
    renderPage()
    expect(screen.queryByText(/Bulk Post/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Bulk Delete/i)).not.toBeInTheDocument()
  })

  it('shows skeleton loading state', () => {
    mockedApi.useGetExpensesQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      refetch: vi.fn(),
    })
    renderPage()
    expect(document.querySelector('.MuiSkeleton-root')).toBeInTheDocument()
  })

  it('selecting a row shows detail in the context header', () => {
    renderPage()
    fireEvent.click(expenseListRow())
    expect(screen.getByText('Stationery Hub')).toBeInTheDocument()
    expect(screen.getAllByText('Office Supplies').length).toBeGreaterThan(0)
    expect(screen.getByText('$225.5')).toBeInTheDocument()
  })

  it('clicking New Expense opens form dialog', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'New Expense' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('New Expense')
  })

  it('shows filter controls', () => {
    renderPage()
    expect(screen.getByPlaceholderText('Search expenses...')).toBeInTheDocument()
    expect(screen.getAllByText('Status').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Period').length).toBeGreaterThan(0)
  })

  it('shows description in workspace card after selecting a row', () => {
    renderPage()
    fireEvent.click(expenseListRow())
    expect(screen.getByText('Printer paper and ink')).toBeInTheDocument()
  })
})
