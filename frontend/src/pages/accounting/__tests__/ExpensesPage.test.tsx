import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'

import ExpensesPage from '../ExpensesPage'

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}))

vi.mock('@/hooks/useSearchAndFilter', async () => {
  const actual = await vi.importActual('@/hooks/useSearchAndFilter')
  return {
    ...actual,
    useKeyboardShortcuts: vi.fn(),
  }
})

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

vi.mock('@/store/api/accountingApi', () => ({
  useGetExpensesQuery: mockedApi.useGetExpensesQuery,
  useGetPaymentMethodsQuery: mockedApi.useGetPaymentMethodsQuery,
  useGetChartOfAccountsQuery: mockedApi.useGetChartOfAccountsQuery,
  useCreateExpenseMutation: mockedApi.useCreateExpenseMutation,
  useUpdateExpenseMutation: mockedApi.useUpdateExpenseMutation,
  useDeleteExpenseMutation: mockedApi.useDeleteExpenseMutation,
  usePostExpenseMutation: mockedApi.usePostExpenseMutation,
  useBulkPostExpensesMutation: mockedApi.useBulkPostExpensesMutation,
  useBulkDeleteExpensesMutation: mockedApi.useBulkDeleteExpensesMutation,
}))

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
      data: {
        data: [
          {
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
            status: 'draft',
            createdAt: '2026-02-15',
            updatedAt: '2026-02-15',
          },
        ],
      },
      isLoading: false,
      refetch: vi.fn(),
    })
    mockedApi.useGetPaymentMethodsQuery.mockReturnValue({
      data: {
        data: [{ id: 'pm-1', code: 'CASH', name: 'Cash', isActive: true }],
      },
    })
    mockedApi.useGetChartOfAccountsQuery.mockReturnValue({
      data: {
        data: [{ id: 'coa-1', code: '6000', name: 'Office Supplies', type: 'EXPENSE', isActive: true }],
      },
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
    expect(screen.getByText('EXP-001')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    mockedApi.useGetExpensesQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      refetch: vi.fn(),
    })

    renderPage()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('displays expense data in table', () => {
    renderPage()

    expect(screen.getByText('EXP-001')).toBeInTheDocument()
    expect(screen.getByText('Stationery Hub')).toBeInTheDocument()
    expect(screen.getByText('Printer paper and ink')).toBeInTheDocument()
    expect(screen.getByText('6000 - Office Supplies')).toBeInTheDocument()
  })

  it('shows filter controls', () => {
    renderPage()

    expect(screen.getAllByText('Expense Account').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Payment Method').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Status').length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Start Date')).toBeInTheDocument()
    expect(screen.getByLabelText('End Date')).toBeInTheDocument()
  })
})
