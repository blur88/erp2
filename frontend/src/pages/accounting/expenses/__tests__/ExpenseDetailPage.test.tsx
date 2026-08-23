import { configureStore } from '@reduxjs/toolkit'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Expense } from '@/types'

import ExpenseDetailPage from '../ExpenseDetailPage'

const {
  mockNavigate,
  mockGetExpense,
  mockCancelExpense,
  mockUncancelExpense,
  mockPayExpense,
  mockRefundExpense,
  mockShowSuccess,
  mockShowError,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockGetExpense: vi.fn(),
  mockCancelExpense: vi.fn(() => ({ unwrap: vi.fn().mockResolvedValue(undefined) })),
  mockUncancelExpense: vi.fn(() => ({ unwrap: vi.fn().mockResolvedValue(undefined) })),
  mockPayExpense: vi.fn(() => ({ unwrap: vi.fn().mockResolvedValue(undefined) })),
  mockRefundExpense: vi.fn(() => ({ unwrap: vi.fn().mockResolvedValue(undefined) })),
  mockShowSuccess: vi.fn(),
  mockShowError: vi.fn(),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate, useParams: () => ({ id: 'exp-1' }) }
})

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}))

vi.mock('@/store/api/accountingApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/accountingApi')>()
  return {
    ...actual,
    useGetExpenseQuery: mockGetExpense,
    useCancelExpenseMutation: () => [mockCancelExpense, { isLoading: false }],
    useUncancelExpenseMutation: () => [mockUncancelExpense, { isLoading: false }],
    usePayExpenseMutation: () => [mockPayExpense, { isLoading: false }],
    useRefundExpenseMutation: () => [mockRefundExpense, { isLoading: false }],
  }
})

vi.mock('@/store/api/paymentMethodsApi', () => ({
  useGetActivePaymentMethodsForPurchasesQuery: () => ({ data: [] }),
  useGetActivePaymentMethodsQuery: () => ({ data: [] }),
}))

vi.mock('@/components/common/PaymentDialog', () => ({
  default: ({ open, onSubmit }: any) =>
    open ? <div data-testid="expense-pay-dialog" onClick={() => onSubmit([{ paymentMethodId: 'pm-1', amount: '100.0000', paymentDate: '2024-01-01' }])}>PaymentDialog</div> : null,
}))

vi.mock('@/components/common/RefundDialog', () => ({
  default: ({ open, onSubmit }: any) =>
    open ? <div data-testid="expense-refund-dialog" onClick={() => onSubmit([{ sourceId: 'pmt-1', amount: 50 }])}>RefundDialog</div> : null,
  __esModule: true,
}))

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'exp-1',
    expenseNumber: 'EXP-001',
    expenseDate: '2024-06-15',
    payee: 'Vendor Corp',
    description: 'Office supplies purchase',
    expenseAccountId: 'acc-1',
    expenseAccount: { id: 'acc-1', code: '5000', name: 'Office Supplies' },
    totalAmount: '500.00',
    paidAmount: '0.00',
    balance: '500.00',
    documentStatus: 'DRAFT',
    paymentStatus: 'UNPAID',
    notes: 'Some notes here',
    createdAt: '2024-06-15T10:00:00Z',
    updatedAt: '2024-06-15T10:00:00Z',
    payments: [],
    ...overrides,
  }
}

function renderPage() {
  const store = configureStore({ reducer: {} })
  const tree = () => (
    <Provider store={store}>
      <MemoryRouter initialEntries={['/accounting/expenses/exp-1']}>
        <Routes>
          <Route path="/accounting/expenses/:id" element={<ExpenseDetailPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>
  )
  const utils = render(tree())
  return { ...utils, rerenderPage: () => utils.rerender(tree()) }
}

describe('ExpenseDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading state', () => {
    mockGetExpense.mockReturnValue({ data: undefined, isLoading: true })
    renderPage()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('shows not found on error', () => {
    mockGetExpense.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    renderPage()
    expect(screen.getByText(/Expense not found/)).toBeInTheDocument()
  })

  it('renders expense number in header', () => {
    mockGetExpense.mockReturnValue({ data: makeExpense(), isLoading: false })
    renderPage()
    expect(screen.getByText('EXP-001')).toBeInTheDocument()
  })

  it('renders description in header and tab', () => {
    mockGetExpense.mockReturnValue({ data: makeExpense(), isLoading: false })
    renderPage()
    expect(screen.getAllByText('Office supplies purchase').length).toBeGreaterThanOrEqual(1)
  })

  it('renders draft status chip', () => {
    mockGetExpense.mockReturnValue({ data: makeExpense(), isLoading: false })
    renderPage()
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  it('renders unpaid payment chip', () => {
    mockGetExpense.mockReturnValue({ data: makeExpense(), isLoading: false })
    renderPage()
    expect(screen.getByText('Unpaid')).toBeInTheDocument()
  })

  it('renders Cancelled chip when document is cancelled', () => {
    mockGetExpense.mockReturnValue({
      data: makeExpense({ documentStatus: 'CANCELLED' }),
      isLoading: false,
    })
    renderPage()
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
  })

  describe('Overview tab', () => {
    it('renders expense date', () => {
      mockGetExpense.mockReturnValue({ data: makeExpense(), isLoading: false })
      renderPage()
      expect(screen.getByText('15/06/2024')).toBeInTheDocument()
    })

    it('renders payee', () => {
      mockGetExpense.mockReturnValue({ data: makeExpense(), isLoading: false })
      renderPage()
      expect(screen.getByText('Vendor Corp')).toBeInTheDocument()
    })

    it('renders notes', () => {
      mockGetExpense.mockReturnValue({ data: makeExpense(), isLoading: false })
      renderPage()
      expect(screen.getByText('Some notes here')).toBeInTheDocument()
    })

    it('renders account code and name', () => {
      mockGetExpense.mockReturnValue({ data: makeExpense(), isLoading: false })
      renderPage()
      expect(screen.getByText('5000 Office Supplies')).toBeInTheDocument()
    })

    it('renders total amount', () => {
      mockGetExpense.mockReturnValue({ data: makeExpense(), isLoading: false })
      renderPage()
      expect(screen.getAllByText('RM 500.00').length).toBeGreaterThanOrEqual(1)
    })

    it('renders paid amount', () => {
      mockGetExpense.mockReturnValue({ data: makeExpense(), isLoading: false })
      renderPage()
      expect(screen.getByText('RM 0.00')).toBeInTheDocument()
    })
  })

  describe('Payments tab', () => {
    it('shows empty state when no payments', async () => {
      mockGetExpense.mockReturnValue({ data: makeExpense(), isLoading: false })
      renderPage()
      await userEvent.click(screen.getByRole('tab', { name: /Payments/i }))
      expect(screen.getByText(/No payments recorded/)).toBeInTheDocument()
    })

    it('renders payment method and reference', async () => {
      const expense = makeExpense({
        payments: [
          {
            id: 'pmt-1',
            expenseId: 'exp-1',
            paymentMethodId: 'pm-1',
            paymentDate: '2024-06-16',
            amount: '200.00',
            reference: 'REF-001',
            sourcePaymentId: null,
            paymentMethod: { id: 'pm-1', code: 'CASH', name: 'Cash' },
          },
        ],
      })
      mockGetExpense.mockReturnValue({ data: expense, isLoading: false })
      renderPage()
      await userEvent.click(screen.getByRole('tab', { name: /Payments/i }))
      expect(screen.getByText('Cash')).toBeInTheDocument()
      expect(screen.getByText('REF-001')).toBeInTheDocument()
    })

    it('shows refund amounts in red', async () => {
      const expense = makeExpense({
        payments: [
          {
            id: 'pmt-refund',
            expenseId: 'exp-1',
            paymentMethodId: 'pm-1',
            paymentDate: '2024-06-16',
            amount: '-50.00',
            reference: 'REF-REFUND',
            sourcePaymentId: null,
            paymentMethod: { id: 'pm-1', code: 'CASH', name: 'Cash' },
          },
        ],
      })
      mockGetExpense.mockReturnValue({ data: expense, isLoading: false })
      renderPage()
      await userEvent.click(screen.getByRole('tab', { name: /Payments/i }))
      const amountEl = screen.getByTestId('payment-amount-pmt-refund')
      expect(amountEl).toHaveStyle({ color: 'rgb(211, 47, 47)' })
    })
  })

  describe('action bar', () => {
    it('DRAFT+UNPAID shows Pay, Edit, Cancel', () => {
      mockGetExpense.mockReturnValue({
        data: makeExpense({ documentStatus: 'DRAFT', paymentStatus: 'UNPAID' }),
        isLoading: false,
      })
      renderPage()
      expect(screen.getByRole('button', { name: 'Pay' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    })

    it('DRAFT+PARTIAL shows Pay, Refund, Edit, no Cancel', () => {
      mockGetExpense.mockReturnValue({
        data: makeExpense({ documentStatus: 'DRAFT', paymentStatus: 'PARTIAL' }),
        isLoading: false,
      })
      renderPage()
      expect(screen.getByRole('button', { name: 'Pay' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Refund' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    })

    it('COMPLETED+PAID shows Refund only (no Pay, Edit, Cancel)', () => {
      mockGetExpense.mockReturnValue({
        data: makeExpense({ documentStatus: 'COMPLETED', paymentStatus: 'PAID' }),
        isLoading: false,
      })
      renderPage()
      expect(screen.getByRole('button', { name: 'Refund' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Pay' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    })

    it('renders Completed and Paid chips for a settled expense', () => {
      const chipTexts = () =>
        Array.from(document.querySelectorAll('.MuiChip-root'))
          .map((c) => c.textContent)
      mockGetExpense.mockReturnValue({
        data: makeExpense({ documentStatus: 'COMPLETED', paymentStatus: 'PAID' }),
        isLoading: false,
      })
      renderPage()
      expect(chipTexts()).toContain('Completed')
      expect(chipTexts()).toContain('Paid')
    })

    it('renders Completed and Overpaid chips for an overpaid expense', () => {
      const chipTexts = () =>
        Array.from(document.querySelectorAll('.MuiChip-root'))
          .map((c) => c.textContent)
      mockGetExpense.mockReturnValue({
        data: makeExpense({ documentStatus: 'COMPLETED', paymentStatus: 'OVERPAID' }),
        isLoading: false,
      })
      renderPage()
      expect(chipTexts()).toContain('Completed')
      expect(chipTexts()).toContain('Overpaid')
    })

    it('CANCELLED shows no action buttons', () => {
      mockGetExpense.mockReturnValue({
        data: makeExpense({ documentStatus: 'CANCELLED' }),
        isLoading: false,
      })
      renderPage()
      expect(screen.queryByRole('button', { name: 'Pay' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Refund' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    })

    it('shows only Uncancel for a cancelled expense', () => {
      mockGetExpense.mockReturnValue({
        data: makeExpense({ documentStatus: 'CANCELLED', paymentStatus: 'UNPAID' }),
        isLoading: false,
        isError: false,
      })
      renderPage()

      expect(screen.getByRole('button', { name: /uncancel/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^pay$/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^cancel$/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^refund$/i })).not.toBeInTheDocument()
    })

    it('uncancels the expense and reports success', async () => {
      const user = userEvent.setup()
      mockGetExpense.mockReturnValue({
        data: makeExpense({ documentStatus: 'CANCELLED', paymentStatus: 'UNPAID' }),
        isLoading: false,
        isError: false,
      })
      renderPage()

      await user.click(screen.getByRole('button', { name: /uncancel/i }))
      await user.click(await screen.findByRole('button', { name: /uncancel expense/i }))

      await waitFor(() => {
        expect(mockUncancelExpense).toHaveBeenCalledWith('exp-1')
      })
      expect(mockShowSuccess).toHaveBeenCalledWith('Expense EXP-001 uncancelled')
    })

    it('Edit navigates to edit route', async () => {
      mockGetExpense.mockReturnValue({ data: makeExpense(), isLoading: false })
      renderPage()
      await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
      expect(mockNavigate).toHaveBeenCalledWith('/accounting/expenses/exp-1/edit')
    })
  })

  it('navigates back on back button click', async () => {
    mockGetExpense.mockReturnValue({ data: makeExpense(), isLoading: false })
    renderPage()
    await userEvent.click(screen.getByTestId('ArrowBackIcon').closest('button')!)
    expect(mockNavigate).toHaveBeenCalledWith('/accounting/expenses')
  })

  it('preserves other query params when the tab changes', async () => {
    mockGetExpense.mockReturnValue({ data: makeExpense(), isLoading: false })

    function LocationProbe() {
      const location = useLocation()
      return <span data-testid="probe-search">{location.search}</span>
    }

    const store = configureStore({ reducer: {} })
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/accounting/expenses/exp-1?tab=0&probe=keepme']}>
          <Routes>
            <Route path="/accounting/expenses/:id" element={<ExpenseDetailPage />} />
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </Provider>,
    )

    const user = userEvent.setup()
    const tabs = await screen.findAllByRole('tab')
    await user.click(tabs[1])

    const search = screen.getByTestId('probe-search').textContent ?? ''
    expect(new URLSearchParams(search).get('probe')).toBe('keepme')
    expect(new URLSearchParams(search).get('tab')).toBe('1')
  })

  describe('action wiring', () => {
    it('opens PayDialog when Pay is clicked', async () => {
      mockGetExpense.mockReturnValue({
        data: makeExpense({ documentStatus: 'DRAFT', paymentStatus: 'UNPAID' }),
        isLoading: false,
      })
      renderPage()
      await userEvent.click(screen.getByRole('button', { name: 'Pay' }))
      expect(screen.getByTestId('expense-pay-dialog')).toBeInTheDocument()
    })

    it('opens RefundDialog when Refund is clicked', async () => {
      mockGetExpense.mockReturnValue({
        data: makeExpense({ documentStatus: 'COMPLETED', paymentStatus: 'PAID', payments: [{ id: 'pmt-1', expenseId: 'exp-1', paymentMethodId: 'pm-1', paymentDate: '2024-06-15', amount: '500.00', reference: null, sourcePaymentId: null, paymentMethod: { id: 'pm-1', code: 'CASH', name: 'Cash' } }] }),
        isLoading: false,
      })
      renderPage()
      await userEvent.click(screen.getByRole('button', { name: 'Refund' }))
      expect(screen.getByTestId('expense-refund-dialog')).toBeInTheDocument()
    })

    it('opens ConfirmationDialog when Cancel is clicked', async () => {
      mockGetExpense.mockReturnValue({
        data: makeExpense({ documentStatus: 'DRAFT', paymentStatus: 'UNPAID' }),
        isLoading: false,
      })
      renderPage()
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(screen.getByText(/Cancel this expense/i)).toBeInTheDocument()
    })

    it('confirmed Cancel fires cancelExpense mutation and shows success', async () => {
      const unwrap = vi.fn().mockResolvedValue(undefined)
      mockCancelExpense.mockReturnValue({ unwrap })
      mockGetExpense.mockReturnValue({
        data: makeExpense({ documentStatus: 'DRAFT', paymentStatus: 'UNPAID' }),
        isLoading: false,
      })
      renderPage()
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      await userEvent.click(screen.getByRole('button', { name: /cancel expense/i }))
      await waitFor(() => expect(mockCancelExpense).toHaveBeenCalledWith('exp-1'))
      expect(mockShowSuccess).toHaveBeenCalledWith(expect.stringContaining('EXP-001'))
    })

    it('Pay submit calls payExpense mutation and shows success', async () => {
      const unwrap = vi.fn().mockResolvedValue(undefined)
      mockPayExpense.mockReturnValue({ unwrap })
      mockGetExpense.mockReturnValue({
        data: makeExpense({ documentStatus: 'DRAFT', paymentStatus: 'UNPAID' }),
        isLoading: false,
      })
      renderPage()
      await userEvent.click(screen.getByRole('button', { name: 'Pay' }))
      const dialog = screen.getByTestId('expense-pay-dialog')
      // Click the dialog to trigger onSubmit (simulates pay dialog submit)
      await act(async () => { dialog.click() })
      await waitFor(() => expect(mockPayExpense).toHaveBeenCalled())
      expect(mockShowSuccess).toHaveBeenCalledWith(expect.stringContaining('EXP-001'))
    })

    it('Refund submit calls refundExpense mutation and shows success', async () => {
      const unwrap = vi.fn().mockResolvedValue(undefined)
      mockRefundExpense.mockReturnValue({ unwrap })
      mockGetExpense.mockReturnValue({
        data: makeExpense({ documentStatus: 'COMPLETED', paymentStatus: 'PAID', payments: [{ id: 'pmt-1', expenseId: 'exp-1', paymentMethodId: 'pm-1', paymentDate: '2024-06-15', amount: '500.00', reference: null, sourcePaymentId: null, paymentMethod: { id: 'pm-1', code: 'CASH', name: 'Cash' } }] }),
        isLoading: false,
      })
      renderPage()
      await userEvent.click(screen.getByRole('button', { name: 'Refund' }))
      const dialog = screen.getByTestId('expense-refund-dialog')
      await act(async () => { dialog.click() })
      await waitFor(() => expect(mockRefundExpense).toHaveBeenCalled())
      expect(mockShowSuccess).toHaveBeenCalledWith(expect.stringContaining('EXP-001'))
    })

    it('Cancel backend error shows error snackbar', async () => {
      const unwrap = vi.fn().mockRejectedValue({ data: { message: 'Cannot cancel expense with payments' } })
      mockCancelExpense.mockReturnValue({ unwrap })
      mockGetExpense.mockReturnValue({
        data: makeExpense({ documentStatus: 'DRAFT', paymentStatus: 'UNPAID' }),
        isLoading: false,
      })
      renderPage()
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      await userEvent.click(screen.getByRole('button', { name: /cancel expense/i }))
      await waitFor(() => expect(mockShowError).toHaveBeenCalled())
    })
  })

  describe('query state transitions', () => {
    let errorSpy: ReturnType<typeof vi.spyOn> | undefined

    afterEach(() => {
      errorSpy?.mockRestore()
      errorSpy = undefined
    })

    it('transitions from loading to loaded without a hook-order error', () => {
      mockGetExpense.mockReturnValue({ data: undefined, isLoading: true })
      const { rerenderPage } = renderPage()
      expect(screen.getByRole('progressbar')).toBeInTheDocument()

      mockGetExpense.mockReturnValue({ data: makeExpense(), isLoading: false })
      rerenderPage()

      expect(screen.getByText('EXP-001')).toBeInTheDocument()
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    })

    it('transitions from loading to error without a hook-order error', () => {
      mockGetExpense.mockReturnValue({ data: undefined, isLoading: true })
      const { rerenderPage } = renderPage()
      expect(screen.getByRole('progressbar')).toBeInTheDocument()

      mockGetExpense.mockReturnValue({ data: undefined, isLoading: false, isError: true })
      rerenderPage()

      expect(screen.getByText(/Expense not found/)).toBeInTheDocument()
    })

    it('logs no hook-order diagnostic across the loading to loaded transition', () => {
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      mockGetExpense.mockReturnValue({ data: undefined, isLoading: true })
      const { rerenderPage } = renderPage()
      mockGetExpense.mockReturnValue({ data: makeExpense(), isLoading: false })
      rerenderPage()

      const hookComplaints = errorSpy.mock.calls.filter((call) =>
        call.some((arg) => typeof arg === 'string' && /hook/i.test(arg)),
      )
      expect(hookComplaints).toEqual([])
    })
  })
})
