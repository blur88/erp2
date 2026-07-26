import { configureStore } from '@reduxjs/toolkit'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Expense } from '@/types'

import ExpenseDetailPage from '../ExpenseDetailPage'

const { mockNavigate, mockGetExpense, mockCancelExpense } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockGetExpense: vi.fn(),
  mockCancelExpense: vi.fn(),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate, useParams: () => ({ id: 'exp-1' }) }
})

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

vi.mock('@/store/api/accountingApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/accountingApi')>()
  return {
    ...actual,
    useGetExpenseQuery: mockGetExpense,
    useCancelExpenseMutation: () => [mockCancelExpense, { isLoading: false }],
  }
})

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
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/accounting/expenses/exp-1']}>
        <Routes>
          <Route path="/accounting/expenses/:id" element={<ExpenseDetailPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
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

    it('DRAFT+PAID shows Refund only (no Pay, Edit, Cancel)', () => {
      mockGetExpense.mockReturnValue({
        data: makeExpense({ documentStatus: 'DRAFT', paymentStatus: 'PAID' }),
        isLoading: false,
      })
      renderPage()
      expect(screen.getByRole('button', { name: 'Refund' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Pay' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
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
})
