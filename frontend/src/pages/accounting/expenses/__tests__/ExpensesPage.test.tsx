import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

const { mockNavigate, mockLocation } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockLocation: {
    current: {
      pathname: '/accounting/expenses',
      search: '',
      hash: '',
      key: 'test',
      state: null as Record<string, unknown> | null,
    },
  },
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => mockLocation.current,
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  }
})

const { mockShowSuccess, mockShowError } = vi.hoisted(() => ({
  mockShowSuccess: vi.fn(),
  mockShowError: vi.fn(),
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}))

import { alpha } from '@mui/material'
import { useGetExpensesQuery, useGetExpenseQuery } from '@/store/api/accountingApi'
import { darkTheme } from '@/styles/theme'
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
  beforeEach(() => {
    vi.clearAllMocks()
    mockLocation.current = {
      pathname: '/accounting/expenses',
      search: '',
      hash: '',
      key: 'test',
      state: null,
    }
  })

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

  it('renders concise filter labels in the page toolbar', () => {
    renderPage()
    const filters = within(screen.getByTestId('page-header-toolbar'))

    expect(filters.getByRole('combobox', { name: 'Account' })).toBeInTheDocument()
    expect(filters.getByRole('combobox', { name: 'Payment' })).toBeInTheDocument()
    expect(filters.getByRole('combobox', { name: 'Status' })).toBeInTheDocument()
  })

  it('opens Edit with explicit list-origin state', async () => {
    const user = userEvent.setup()
    renderPage()

    const menuButtons = screen.getAllByRole('button', { name: /row actions/i })
    await user.click(menuButtons[0])
    await user.click(await screen.findByRole('menuitem', { name: /^edit$/i }))

    expect(mockNavigate).toHaveBeenCalledWith('/accounting/expenses/exp-1/edit', {
      state: { expenseEditOrigin: 'list' },
    })
  })

  it('highlights the expense named by incoming location state', async () => {
    mockLocation.current = {
      pathname: '/accounting/expenses',
      search: '',
      hash: '',
      key: 'test',
      state: { highlightExpenseId: 'exp-2' },
    }
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('EXP-002').closest('tr')).toHaveStyle({
        backgroundColor: alpha(darkTheme.palette.primary.main, 0.2),
      })
    })
  })

  it('clears the highlight state while preserving the query string', async () => {
    mockLocation.current = {
      pathname: '/accounting/expenses',
      search: '?tab=open',
      hash: '',
      key: 'test',
      state: { highlightExpenseId: 'exp-2' },
    }
    renderPage()

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/accounting/expenses?tab=open', {
        replace: true,
        state: null,
      })
    })
  })

  it('does not clear history state when no highlight arrives', () => {
    renderPage()
    expect(mockNavigate).not.toHaveBeenCalled()
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
    mockLocation.current = {
      pathname: '/accounting/expenses',
      search: '',
      hash: '',
      key: 'test',
      state: null,
    }
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

describe('ExpensesPage - regional date format', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLocation.current = {
      pathname: '/accounting/expenses',
      search: '',
      hash: '',
      key: 'test',
      state: null,
    }
  })

  afterEach(() => {
    localStorage.removeItem('dateFormat')
  })

  const cases: [string, string][] = [
    ['DD/MM/YYYY', '01/07/2026'],
    ['MM/DD/YYYY', '07/01/2026'],
    ['YYYY-MM-DD', '2026-07-01'],
  ]

  cases.forEach(([stored, expected]) => {
    it(`renders the expense date as ${stored}`, () => {
      localStorage.setItem('dateFormat', stored)
      renderPage()
      expect(screen.getByText(expected)).toBeInTheDocument()
    })
  })

  it('does not shift a date-only value under a behind-UTC timezone', () => {
    // Pacific/Niue is UTC-11, the extreme that actually exposes UTC parsing:
    // `new Date('2026-07-01')` is UTC midnight, which is 2026-06-30 13:00 local —
    // the *previous* calendar day. (UTC+14 would move it to 14:00 on the same day
    // and prove nothing.) formatDate must build a local midnight from the parts.
    const originalTZ = process.env.TZ
    process.env.TZ = 'Pacific/Niue'
    try {
      localStorage.setItem('dateFormat', 'YYYY-MM-DD')
      renderPage()
      expect(screen.getByText('2026-07-01')).toBeInTheDocument()
    } finally {
      // Restore precisely: assigning `undefined` would set the string "undefined".
      if (originalTZ === undefined) delete process.env.TZ
      else process.env.TZ = originalTZ
    }
  })
})
