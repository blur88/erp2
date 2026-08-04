import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ExpensePayDialog from '../ExpensePayDialog'

const mockPaymentMethods = [
  { id: 'pm-cash', code: 'CASH', name: 'Cash', useForPurchases: true, accountingChannel: 'CASH', sortOrder: 1, isActive: true, createdAt: '', updatedAt: '' },
  { id: 'pm-bank', code: 'BANK', name: 'Bank Transfer', useForPurchases: true, accountingChannel: 'BANK', sortOrder: 2, isActive: true, createdAt: '', updatedAt: '' },
]

vi.mock('@/store/api/paymentMethodsApi', () => ({
  useGetActivePaymentMethodsForPurchasesQuery: () => ({ data: mockPaymentMethods }),
}))

const defaultExpense = {
  id: 'exp-1',
  expenseNumber: 'EXP-001',
  totalAmount: '500.00',
  paidAmount: '200.00',
  balance: '300.00',
}

function renderDialog(props: Partial<ComponentProps<typeof ExpensePayDialog>> = {}) {
  const store = configureStore({ reducer: {} })
  const defaults: ComponentProps<typeof ExpensePayDialog> = {
    open: true,
    onClose: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(undefined),
    expense: defaultExpense as any,
  }
  return render(
    <Provider store={store}>
      <ExpensePayDialog {...defaults} {...props} />
    </Provider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ExpensePayDialog', () => {
  it('renders expense summary with Total, Paid, Balance', () => {
    renderDialog()
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getByText('Paid')).toBeInTheDocument()
    expect(screen.getByText('Balance')).toBeInTheDocument()
    expect(screen.getAllByText(/RM 500\.00/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/RM 200\.00/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/RM 300\.00/).length).toBeGreaterThanOrEqual(1)
  })

  it('pre-fills first payment line with balance amount', () => {
    renderDialog()
    const amountInput = screen.getByPlaceholderText('Amount') as HTMLInputElement
    expect(Number(amountInput.value)).toBe(300)
  })

  it('submit button is disabled when total entered is 0', () => {
    renderDialog({
      expense: { ...defaultExpense, totalAmount: '500.00', paidAmount: '500.00', balance: '0.00' } as any,
    })
    expect(screen.getByRole('button', { name: /record payment/i })).toBeDisabled()
  })

  it('disables submit when total exceeds balance', async () => {
    renderDialog()
    const amountInput = screen.getByPlaceholderText('Amount') as HTMLInputElement
    await userEvent.clear(amountInput)
    await userEvent.type(amountInput, '500')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /record payment/i })).toBeDisabled()
    })
  })

  it('submits payExpense rows on valid input', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderDialog({ onSubmit })
    const amountInput = screen.getByPlaceholderText('Amount')
    await userEvent.clear(amountInput)
    await userEvent.type(amountInput, '100')
    await userEvent.click(screen.getByRole('button', { name: /record payment/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce())
    const payload = onSubmit.mock.calls[0][0]
    expect(payload).toHaveLength(1)
    expect(payload[0]).toMatchObject({
      paymentMethodId: expect.any(String),
      amount: '100',
      paymentDate: expect.any(String),
    })
  })

  it('shows error on backend failure and does not close', async () => {
    const onClose = vi.fn()
    const onSubmit = vi.fn().mockRejectedValue({ response: { data: { message: 'Payment failed' } } })
    renderDialog({ onClose, onSubmit })
    await userEvent.click(screen.getByRole('button', { name: /record payment/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(onClose).not.toHaveBeenCalled()
  })

  it('allows adding multiple payment lines', async () => {
    renderDialog()
    await userEvent.click(screen.getByRole('button', { name: /add payment line/i }))
    const amountInputs = screen.getAllByPlaceholderText('Amount')
    expect(amountInputs).toHaveLength(2)
  })

  it('remove button is disabled when only one line', () => {
    renderDialog()
    const removeButtons = screen.getAllByRole('button').filter((btn) =>
      btn.querySelector('svg[data-testid="DeleteIcon"]'),
    )
    expect(removeButtons[0]).toBeDisabled()
  })
})

describe('money formatting and precision', () => {
  afterEach(() => {
    localStorage.removeItem('defaultCurrency')
  })

  it('seeds the default amount at the two-decimal floor', () => {
    renderDialog({ expense: { ...defaultExpense, balance: '1000.0000' } })
    // type="number" inputs: toHaveValue normalizes to Number; assert the raw
    // DOM value to check the two-decimal lexical normalization.
    const input = screen.getByPlaceholderText('Amount') as HTMLInputElement
    expect(input.value).toBe('1000.00')
  })

  it('formats summaries with the configured currency, not a hard-coded MYR', () => {
    localStorage.setItem('defaultCurrency', 'USD')
    renderDialog({
      expense: { ...defaultExpense, totalAmount: '1000.0000', paidAmount: '0.0000', balance: '1000.0000' },
    })
    expect(screen.getAllByText('USD 1,000.00').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText(/RM|MYR/)).not.toBeInTheDocument()
  })

  it('submits the exact decimal string, not a coerced number', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    // Balance is 1000.0001 so a 1000.0001 payment is within it.
    renderDialog({ onSubmit, expense: { ...defaultExpense, balance: '1000.0001' } })

    const input = screen.getByPlaceholderText('Amount')
    await userEvent.clear(input)
    await userEvent.type(input, '1000.0001')
    await userEvent.click(screen.getByRole('button', { name: /record payment/i }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith([
        expect.objectContaining({ amount: '1000.0001' }),
      ]),
    )
  })

  it('preserves four decimals above the floor on a small partial payment', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderDialog({ onSubmit, expense: { ...defaultExpense, balance: '1000.0000' } })

    const input = screen.getByPlaceholderText('Amount')
    await userEvent.clear(input)
    await userEvent.type(input, '0.0101')
    await userEvent.click(screen.getByRole('button', { name: /record payment/i }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith([
        expect.objectContaining({ amount: '0.0101' }),
      ]),
    )
  })

  it('disables submit for a malformed amount instead of counting it as zero', async () => {
    renderDialog({ expense: { ...defaultExpense, balance: '1000.0000' } })
    const input = screen.getByPlaceholderText('Amount')
    await userEvent.clear(input)
    await userEvent.type(input, '1.00001')
    expect(screen.getByRole('button', { name: /record payment/i })).toBeDisabled()
  })

  // Unlike the sales/vendor dialogs, this one blocks over-balance by design.
  it('still blocks submit one minor unit over the balance', async () => {
    renderDialog({ expense: { ...defaultExpense, balance: '100.0000' } })
    const input = screen.getByPlaceholderText('Amount')
    await userEvent.clear(input)
    await userEvent.type(input, '100.0001')
    expect(screen.getByRole('button', { name: /record payment/i })).toBeDisabled()
  })

  it('still blocks submit on a zero amount', async () => {
    renderDialog({ expense: { ...defaultExpense, balance: '100.0000' } })
    const input = screen.getByPlaceholderText('Amount')
    await userEvent.clear(input)
    await userEvent.type(input, '0')
    expect(screen.getByRole('button', { name: /record payment/i })).toBeDisabled()
  })
})
