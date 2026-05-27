import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import PaymentDialog from '../PaymentDialog'

const { mockUseGetActivePaymentMethodsQuery } = vi.hoisted(() => ({
  mockUseGetActivePaymentMethodsQuery: vi.fn(),
}))

vi.mock('@/store/api/paymentMethodsApi', () => ({
  useGetActivePaymentMethodsQuery: mockUseGetActivePaymentMethodsQuery,
}))

const paymentMethods = [
  { id: 'pm-1', name: 'Cash', code: 'CASH', isActive: true },
  { id: 'pm-2', name: 'Bank Transfer', code: 'BANK', isActive: true },
]

function renderDialog(props: Partial<ComponentProps<typeof PaymentDialog>> = {}) {
  const defaults = {
    open: true,
    onClose: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(undefined),
    orderNumber: 'SO-26-001',
    totalAmount: 1000,
    paidAmount: 0,
  }
  return render(<PaymentDialog {...defaults} {...props} />)
}

beforeEach(() => {
  mockUseGetActivePaymentMethodsQuery.mockReturnValue({ data: paymentMethods })
})

describe('PaymentDialog', () => {
  it('displays order total and remaining balance', () => {
    renderDialog({ totalAmount: 1000, paidAmount: 200 })
    expect(screen.getByText('Order Total')).toBeInTheDocument()
    expect(screen.getByText('Outstanding Balance')).toBeInTheDocument()
  })

  it('populates payment method dropdown with methods from API', async () => {
    renderDialog()
    expect(screen.getByText('Cash')).toBeInTheDocument()
  })

  it('adds a payment row when Add Payment Line is clicked', async () => {
    renderDialog()
    const addButton = screen.getByRole('button', { name: /add payment line/i })
    await userEvent.click(addButton)
    expect(screen.getAllByPlaceholderText('Amount')).toHaveLength(2)
  })

  it('removes a payment row when x is clicked', async () => {
    renderDialog()
    const addButton = screen.getByRole('button', { name: /add payment line/i })
    await userEvent.click(addButton)
    expect(screen.getAllByPlaceholderText('Amount')).toHaveLength(2)
    const removeButtons = screen.getAllByRole('button', { name: '' }).filter(
      (btn) => btn.querySelector('svg[data-testid="DeleteIcon"]'),
    )
    await userEvent.click(removeButtons[0])
    expect(screen.getAllByPlaceholderText('Amount')).toHaveLength(1)
  })

  it('disables the remove button when only one row remains', () => {
    renderDialog()
    const removeButtons = screen.getAllByRole('button').filter(
      (btn) => btn.querySelector('svg[data-testid="DeleteIcon"]'),
    )
    expect(removeButtons[0]).toBeDisabled()
  })

  it('Record Payment button is disabled when total entered is 0', () => {
    renderDialog({ totalAmount: 1000, paidAmount: 1000 })
    const recordBtn = screen.getByRole('button', { name: /record payment/i })
    expect(recordBtn).toBeDisabled()
  })

  it('Record Payment button is enabled when total entered is > 0', async () => {
    renderDialog({ totalAmount: 1000, paidAmount: 1000 })
    const amountInput = screen.getByPlaceholderText('Amount')
    await userEvent.clear(amountInput)
    await userEvent.type(amountInput, '50')
    expect(screen.getByRole('button', { name: /record payment/i })).toBeEnabled()
  })

  it('Cancel with no data closes immediately without confirmation', async () => {
    const onClose = vi.fn()
    renderDialog({ totalAmount: 1000, paidAmount: 1000, onClose })
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(screen.queryByText('Discard this payment?')).not.toBeInTheDocument()
  })

  it('Cancel with data shows discard confirmation', async () => {
    renderDialog({ totalAmount: 1000, paidAmount: 0 })
    const amountInput = screen.getByPlaceholderText('Amount')
    await userEvent.clear(amountInput)
    await userEvent.type(amountInput, '300')
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.getByText('Discard this payment?')).toBeInTheDocument()
  })

  it('clicking Discard in confirmation calls onClose', async () => {
    const onClose = vi.fn()
    renderDialog({ totalAmount: 1000, paidAmount: 0, onClose })
    await userEvent.clear(screen.getByPlaceholderText('Amount'))
    await userEvent.type(screen.getByPlaceholderText('Amount'), '100')
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    await userEvent.click(screen.getByRole('button', { name: /^discard$/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('clicking Keep Editing dismisses confirmation and keeps dialog open', async () => {
    const onClose = vi.fn()
    renderDialog({ totalAmount: 1000, paidAmount: 0, onClose })
    await userEvent.clear(screen.getByPlaceholderText('Amount'))
    await userEvent.type(screen.getByPlaceholderText('Amount'), '100')
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    await userEvent.click(screen.getByRole('button', { name: /keep editing/i }))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByText('Discard this payment?')).not.toBeInTheDocument()
  })

  it('Cancel on untouched dialog (pre-filled amount) closes without confirmation', async () => {
    const onClose = vi.fn()
    renderDialog({ totalAmount: 1000, paidAmount: 0, onClose })
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(screen.queryByText('Discard this payment?')).not.toBeInTheDocument()
  })

  it('Escape / backdrop on outer dialog shows discard confirmation when user has edited', async () => {
    const onClose = vi.fn()
    renderDialog({ totalAmount: 1000, paidAmount: 0, onClose })
    const amountInput = screen.getByPlaceholderText('Amount')
    await userEvent.clear(amountInput)
    await userEvent.type(amountInput, '200')
    await userEvent.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('Discard this payment?')).toBeInTheDocument()
  })

  it('Escape on untouched dialog closes immediately without confirmation', async () => {
    const onClose = vi.fn()
    renderDialog({ totalAmount: 1000, paidAmount: 0, onClose })
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
    expect(screen.queryByText('Discard this payment?')).not.toBeInTheDocument()
  })

  it('submit success calls onSubmit with correct lines and closes dialog', async () => {
    const onClose = vi.fn()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderDialog({ totalAmount: 500, paidAmount: 0, onClose, onSubmit })
    const amountInput = screen.getByPlaceholderText('Amount')
    await userEvent.clear(amountInput)
    await userEvent.type(amountInput, '500')
    await userEvent.click(screen.getByRole('button', { name: /record payment/i }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(onSubmit).toHaveBeenCalledWith([
      expect.objectContaining({ paymentMethodId: 'pm-1', amount: 500, paymentDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
    ])
  })

  it('submit error shows error alert and does not close dialog', async () => {
    const onClose = vi.fn()
    const onSubmit = vi.fn().mockRejectedValue({ message: 'Server error' })
    renderDialog({ totalAmount: 500, paidAmount: 0, onClose, onSubmit })
    const amountInput = screen.getByPlaceholderText('Amount')
    await userEvent.clear(amountInput)
    await userEvent.type(amountInput, '500')
    await userEvent.click(screen.getByRole('button', { name: /record payment/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows overpayment warning when total exceeds outstanding balance', async () => {
    renderDialog({ totalAmount: 500, paidAmount: 0 })
    const amountInput = screen.getByPlaceholderText('Amount')
    await userEvent.clear(amountInput)
    await userEvent.type(amountInput, '600')
    expect(screen.getByText(/exceeds outstanding balance/i)).toBeInTheDocument()
  })

  it('renders a date field defaulting to today for each payment line', () => {
    renderDialog({ totalAmount: 500, paidAmount: 0 })
    const dateInputs = screen.getAllByDisplayValue(/^\d{4}-\d{2}-\d{2}$/)
    expect(dateInputs.length).toBeGreaterThanOrEqual(1)
  })
})
