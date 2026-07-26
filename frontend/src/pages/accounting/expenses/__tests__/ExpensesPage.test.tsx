import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const { mockExpenses } = vi.hoisted(() => ({
  mockExpenses: [
    {
      id: 'exp-1',
      expenseNumber: 'EXP-001',
      expenseDate: '2026-07-01',
      payee: 'Vendor A',
      description: 'Office supplies',
      expenseAccountId: 'acct-1',
      expenseAccount: { id: 'acct-1', code: '5010', name: 'Office Expenses' },
      totalAmount: '1000.0000',
      paidAmount: '0.0000',
      balance: '1000.0000',
      documentStatus: 'DRAFT' as const,
      paymentStatus: 'UNPAID' as const,
      notes: null,
      createdAt: '2026-07-01T00:00:00Z',
      updatedAt: '2026-07-01T00:00:00Z',
      payments: [],
    },
    {
      id: 'exp-2',
      expenseNumber: 'EXP-002',
      expenseDate: '2026-07-02',
      payee: 'Vendor B',
      description: 'Consulting fees',
      expenseAccountId: 'acct-2',
      expenseAccount: { id: 'acct-2', code: '5020', name: 'Consulting' },
      totalAmount: '500.0000',
      paidAmount: '500.0000',
      balance: '0.0000',
      documentStatus: 'DRAFT' as const,
      paymentStatus: 'PAID' as const,
      notes: null,
      createdAt: '2026-07-02T00:00:00Z',
      updatedAt: '2026-07-02T00:00:00Z',
      payments: [],
    },
  ],
}))

vi.mock('@/store/api/accountingApi', () => ({
  useGetExpensesQuery: vi.fn().mockReturnValue({
    data: { data: mockExpenses, meta: { total: 2, page: 1, limit: 25 } },
    isFetching: false,
    error: undefined,
  }),
  useGetAccountTreeQuery: vi.fn().mockReturnValue({
    data: [],
    isFetching: false,
    error: undefined,
  }),
  useGetExpenseQuery: vi.fn().mockReturnValue({ data: undefined, isFetching: false }),
  useCreateExpenseMutation: vi.fn().mockReturnValue([vi.fn(), { isLoading: false }]),
  useUpdateExpenseMutation: vi.fn().mockReturnValue([vi.fn(), { isLoading: false }]),
  useCancelExpenseMutation: vi.fn().mockReturnValue([vi.fn(), { isLoading: false }]),
  usePayExpenseMutation: vi.fn().mockReturnValue([vi.fn(), { isLoading: false }]),
  useRefundExpenseMutation: vi.fn().mockReturnValue([vi.fn(), { isLoading: false }]),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn(), useSearchParams: () => [new URLSearchParams(), vi.fn()] }
})

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

import { useGetExpensesQuery } from '@/store/api/accountingApi'
import ExpensesPage from '../ExpensesPage'

function renderPage() {
  const store = configureStore({ reducer: { empty: (s = null) => s } })
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/accounting/expenses']}>
        <ExpensesPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('ExpensesPage', () => {
  it('renders expense numbers from mocked data', () => {
    renderPage()
    expect(screen.getByText('EXP-001')).toBeInTheDocument()
    expect(screen.getByText('EXP-002')).toBeInTheDocument()
  })

  it('renders expense descriptions', () => {
    renderPage()
    expect(screen.getByText('Office supplies')).toBeInTheDocument()
    expect(screen.getByText('Consulting fees')).toBeInTheDocument()
  })

  it('shows StatusChip for payment status', () => {
    renderPage()
    expect(screen.getByText('Unpaid')).toBeInTheDocument()
    expect(screen.getAllByText('Paid').length).toBeGreaterThanOrEqual(1)
  })

  it('shows empty state when no expenses', () => {
    vi.mocked(useGetExpensesQuery).mockReturnValueOnce({
      data: { data: [], meta: { total: 0, page: 1, limit: 25 } },
      isFetching: false,
      error: undefined,
    } as any)
    renderPage()
    expect(screen.getByText(/No expenses found/i)).toBeInTheDocument()
  })

  it('shows New Expense button', () => {
    renderPage()
    expect(screen.getByText('+ New Expense')).toBeInTheDocument()
  })
})
