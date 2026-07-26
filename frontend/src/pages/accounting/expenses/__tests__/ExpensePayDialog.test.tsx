import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
      amount: 100,
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
