import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ExpensesPage from '../ExpensesPage'
import accountingReducer, { selectSelectedExpense } from '@/store/slices/accountingSlice'

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
  useLazyGetExpenseQuery: vi.fn(),
  usePostExpenseMutation: vi.fn(),
  useRestoreExpenseMutation: vi.fn(),
  useUnpostExpenseMutation: vi.fn(),
  useGetDeletedExpensesQuery: vi.fn(),
  usePermanentDeleteExpenseMutation: vi.fn(),
  useBulkPermanentDeleteExpensesMutation: vi.fn(),
  useBulkRestoreExpensesMutation: vi.fn(),
}))

const mockedPaymentMethodsApi = vi.hoisted(() => ({
  useGetActivePaymentMethodsQuery: vi.fn(),
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
vi.mock('@/store/api/paymentMethodsApi', () => mockedPaymentMethodsApi)
const mockCurrentUser = { id: 'u-1', username: 'admin', role: 'admin' }
vi.mock('@/store/slices/authSlice', () => ({
  selectCurrentUser: () => mockCurrentUser,
}))

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

function makeStore() {
  return configureStore({ reducer: { accounting: accountingReducer } })
}

const renderPage = (initialUrl = '/accounting/expenses') => {
  const store = makeStore()
  const view = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <ExpensesPage />
      </MemoryRouter>
    </Provider>,
  )
  return { ...view, store }
}

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
    mockedApi.useLazyGetExpenseQuery.mockReturnValue([vi.fn()])
    mockedApi.usePostExpenseMutation.mockReturnValue([vi.fn()])
    mockedApi.useRestoreExpenseMutation.mockReturnValue([vi.fn()])
    mockedApi.useUnpostExpenseMutation.mockReturnValue([vi.fn()])
    mockedApi.useGetDeletedExpensesQuery.mockReturnValue({ data: [], isLoading: false })
    mockedApi.usePermanentDeleteExpenseMutation.mockReturnValue([vi.fn()])
    mockedApi.useBulkPermanentDeleteExpensesMutation.mockReturnValue([vi.fn()])
    mockedApi.useBulkRestoreExpensesMutation.mockReturnValue([vi.fn()])
    mockedPaymentMethodsApi.useGetActivePaymentMethodsQuery.mockReturnValue({
      data: [{ id: 'pm-1', code: 'CASH', name: 'Cash', isActive: true }],
    })
  })

  it('renders the page title', () => {
    renderPage()
    expect(screen.getByText('Expenses')).toBeInTheDocument()
  })

  it('shows expense reference number in the narrow list', () => {
    renderPage()
    expect(screen.getAllByText('EXP-001').length).toBeGreaterThan(0)
  })

  it('bulk action buttons are never shown (feature removed)', () => {
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
    const { container } = renderPage()
    // Click the row in the list (EntityTable tbody area) by finding the first occurrence
    // of EXP-001 inside the table body, which is unambiguously in the list panel
    const tableBody = container.querySelector('tbody')!
    const listRow = within(tableBody).getByText('EXP-001')
    fireEvent.click(listRow)
    expect(screen.getAllByText('Stationery Hub').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Office Supplies').length).toBeGreaterThan(0)
    expect(screen.getAllByText('$225.5').length).toBeGreaterThan(0)
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

  it('View Deleted button is present', () => {
    renderPage()
    expect(screen.getByRole('button', { name: 'View Deleted' })).toBeInTheDocument()
  })

  it('expenseAccountId defaults to undefined in initial query', () => {
    renderPage()
    expect(mockedApi.useGetExpensesQuery).toHaveBeenCalledWith(
      expect.objectContaining({ expenseAccountId: undefined }),
    )
  })

  it('shows description in workspace card after selecting a row', () => {
    const { container } = renderPage()
    const tableBody = container.querySelector('tbody')!
    fireEvent.click(within(tableBody).getByText('EXP-001'))
    expect(screen.getByText('Printer paper and ink')).toBeInTheDocument()
  })

  it('auto-selects the expense matching the ?highlight= URL param', async () => {
    mockedApi.useGetExpensesQuery.mockReturnValue({
      data: { data: [expense1], meta: { total: 1 } },
      isLoading: false,
      refetch: vi.fn(),
    })

    const { store } = renderPage('/accounting/expenses?highlight=ex-1')

    await waitFor(() => {
      expect(selectSelectedExpense(store.getState())?.id).toBe('ex-1')
    })
  })
})
