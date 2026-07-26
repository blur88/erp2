import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

const { mockShowSuccess, mockShowError } = vi.hoisted(() => ({
  mockShowSuccess: vi.fn(),
  mockShowError: vi.fn(),
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}))

import { useGetExpensesQuery, useGetExpenseQuery } from '@/store/api/accountingApi'
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

describe('ExpensesPage - refund detail loading', () => {
  const refundDetail = {
    ...mockExpenses[1],
    payments: [
      {
        id: 'pay-1',
        expenseId: 'exp-2',
        paymentMethodId: 'pm-1',
        paymentDate: '2026-07-02',
        amount: '500.0000',
        reference: null,
        sourcePaymentId: null,
        paymentMethod: { id: 'pm-1', code: 'CASH', name: 'Cash' },
        remainingRefundable: '500.0000',
      },
    ],
  }

  async function openRefundOnSecondRow() {
    const user = userEvent.setup()
    renderPage()
    // exp-2 is DRAFT + PAID, so its row menu offers Refund.
    const menuButtons = screen.getAllByRole('button', { name: /row actions/i })
    await user.click(menuButtons[1])
    await user.click(await screen.findByRole('menuitem', { name: /refund/i }))
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens the refund dialog with sources once the detail record loads', async () => {
    vi.mocked(useGetExpenseQuery).mockReturnValue({
      currentData: refundDetail,
      isError: false,
    } as any)
    await openRefundOnSecondRow()
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeInTheDocument()
    // Sources actually populated from the detail record: the Cash payment is
    // preselected and its full amount is available for refund.
    expect(within(dialog).getByText('Cash')).toBeInTheDocument()
    expect(within(dialog).getAllByText(/500\.00/).length).toBeGreaterThanOrEqual(1)
    expect(mockShowError).not.toHaveBeenCalled()
  })

  it('does not open the refund dialog from another expense\'s cached detail', async () => {
    vi.mocked(useGetExpenseQuery).mockReturnValue({
      currentData: { ...refundDetail, id: 'exp-OTHER' },
      isError: false,
    } as any)
    await openRefundOnSecondRow()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows an error and abandons the refund action when the detail fetch fails', async () => {
    vi.mocked(useGetExpenseQuery).mockReturnValue({
      currentData: undefined,
      isError: true,
    } as any)
    await openRefundOnSecondRow()
    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith('Failed to load expense payments for refund')
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
