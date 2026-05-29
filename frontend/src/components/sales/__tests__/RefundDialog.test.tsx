import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import RefundDialog from '../RefundDialog'

const { mockUseGetActivePaymentMethodsQuery, mockUseGetSalesOrderPaymentsQuery } = vi.hoisted(() => ({
  mockUseGetActivePaymentMethodsQuery: vi.fn(),
  mockUseGetSalesOrderPaymentsQuery: vi.fn(),
}))

vi.mock('@/store/api/paymentMethodsApi', () => ({
  useGetActivePaymentMethodsQuery: mockUseGetActivePaymentMethodsQuery,
}))

vi.mock('@/store/api/salesApi', () => ({
  useGetSalesOrderPaymentsQuery: mockUseGetSalesOrderPaymentsQuery,
}))

const paymentMethods = [
  { id: 'pm-1', name: 'Cash', code: 'CASH', isActive: true },
  { id: 'pm-2', name: 'Bank Transfer', code: 'BANK', isActive: true },
]

const makePayments = (paid: number, refunded: number) => [
  ...(paid > 0 ? [{ id: 'p1', salesOrderId: 'order-1', paymentMethodId: 'pm-1', amount: paid, paymentDate: '2026-01-01', createdAt: '', updatedAt: '' }] : []),
  ...(refunded > 0 ? [{ id: 'p2', salesOrderId: 'order-1', paymentMethodId: 'pm-1', amount: -refunded, paymentDate: '2026-01-02', createdAt: '', updatedAt: '' }] : []),
]

const makeMultiPayments = () => [
  { id: 'p1', salesOrderId: 'order-1', paymentMethodId: 'pm-1', amount: 300, paymentDate: '2026-01-01', createdAt: '', updatedAt: '' },
  { id: 'p2', salesOrderId: 'order-1', paymentMethodId: 'pm-2', amount: 200, paymentDate: '2026-01-01', createdAt: '', updatedAt: '' },
]

function renderDialog(props: Partial<ComponentProps<typeof RefundDialog>> = {}) {
  const defaults = {
    open: true,
    onClose: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(undefined),
    orderId: 'order-1',
    orderNumber: 'SO-26-001',
    totalAmount: 500,
  }
  return render(<RefundDialog {...defaults} {...props} />)
}

beforeEach(() => {
  mockUseGetActivePaymentMethodsQuery.mockReturnValue({ data: paymentMethods })
  mockUseGetSalesOrderPaymentsQuery.mockReturnValue({ data: makePayments(500, 0), isLoading: false })
})

describe('RefundDialog', () => {
  it('displays Available for Refund in summary', () => {
    mockUseGetSalesOrderPaymentsQuery.mockReturnValue({ data: makePayments(500, 100), isLoading: false })
    renderDialog()
    expect(screen.getByText('Available for Refund')).toBeInTheDocument()
    expect(screen.queryByText('Total Paid')).not.toBeInTheDocument()
    expect(screen.queryByText('Already Refunded')).not.toBeInTheDocument()
  })

  it('Available for Refund shows net paid minus prior refunds', () => {
    mockUseGetSalesOrderPaymentsQuery.mockReturnValue({ data: makePayments(500, 100), isLoading: false })
    renderDialog()
    // Available = 500 - 100 = 400
    expect(screen.getAllByText(/400/).length).toBeGreaterThan(0)
  })

  it('shows loading spinner while payments are loading', () => {
    mockUseGetSalesOrderPaymentsQuery.mockReturnValue({ data: [], isLoading: true })
    renderDialog()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('pre-fills first refund line with Available for Refund amount', () => {
    mockUseGetSalesOrderPaymentsQuery.mockReturnValue({ data: makePayments(500, 0), isLoading: false })
    renderDialog()
    const amountInput = screen.getByPlaceholderText('Amount') as HTMLInputElement
    expect(amountInput.value).toBe('500')
  })

  it('defaults refund amount to the surplus on an overpaid order', () => {
    // Net paid 500, order total 300 -> surplus 200
    mockUseGetSalesOrderPaymentsQuery.mockReturnValue({ data: makePayments(500, 0), isLoading: false })
    renderDialog({ totalAmount: 300 })
    const amountInput = screen.getByPlaceholderText('Amount') as HTMLInputElement
    expect(amountInput.value).toBe('200')
  })

  it('shows a Surplus over total row when the order is overpaid', () => {
    // Net paid 500, total 300 -> surplus 200
    mockUseGetSalesOrderPaymentsQuery.mockReturnValue({ data: makePayments(500, 0), isLoading: false })
    renderDialog({ totalAmount: 300 })
    expect(screen.getByText('Surplus over total')).toBeInTheDocument()
  })

  it('hides the Surplus over total row when the order is exactly paid', () => {
    // Net paid 500, total 500 -> surplus 0
    mockUseGetSalesOrderPaymentsQuery.mockReturnValue({ data: makePayments(500, 0), isLoading: false })
    renderDialog({ totalAmount: 500 })
    expect(screen.queryByText('Surplus over total')).not.toBeInTheDocument()
  })

  it('populates payment method dropdown from API', () => {
    renderDialog()
    expect(screen.getByText('Cash')).toBeInTheDocument()
  })

  it('adds a refund row when Add Refund Row is clicked', async () => {
    renderDialog()
    await userEvent.click(screen.getByRole('button', { name: /add refund row/i }))
    expect(screen.getAllByPlaceholderText('Amount')).toHaveLength(2)
  })

  it('remove button is disabled when only one row remains', () => {
    renderDialog()
    const removeButtons = screen.getAllByRole('button').filter(
      (btn) => btn.querySelector('svg[data-testid="DeleteIcon"]'),
    )
    expect(removeButtons[0]).toBeDisabled()
  })

  it('Refund button is disabled when total entered is 0', () => {
    mockUseGetSalesOrderPaymentsQuery.mockReturnValue({ data: makePayments(500, 500), isLoading: false })
    renderDialog()
    // Available = 0, pre-fill is '' → totalEntered = 0
    expect(screen.getByRole('button', { name: /^refund$/i })).toBeDisabled()
  })

  it('Refund button is disabled when total exceeds available', async () => {
    mockUseGetSalesOrderPaymentsQuery.mockReturnValue({ data: makePayments(300, 0), isLoading: false })
    renderDialog()
    const amountInput = screen.getByPlaceholderText('Amount')
    await userEvent.clear(amountInput)
    await userEvent.type(amountInput, '400')
    expect(screen.getByRole('button', { name: /^refund$/i })).toBeDisabled()
  })

  it('shows error alert when total exceeds available', async () => {
    mockUseGetSalesOrderPaymentsQuery.mockReturnValue({ data: makePayments(300, 0), isLoading: false })
    renderDialog()
    const amountInput = screen.getByPlaceholderText('Amount')
    await userEvent.clear(amountInput)
    await userEvent.type(amountInput, '400')
    expect(screen.getAllByText(/exceeds available/i).length).toBeGreaterThan(0)
  })

  it('Cancel with no edits closes immediately without confirmation', async () => {
    const onClose = vi.fn()
    renderDialog({ onClose })
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(screen.queryByText('Discard this refund?')).not.toBeInTheDocument()
  })

  it('Cancel after editing shows discard confirmation', async () => {
    renderDialog()
    const amountInput = screen.getByPlaceholderText('Amount')
    await userEvent.clear(amountInput)
    await userEvent.type(amountInput, '100')
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.getByText('Discard this refund?')).toBeInTheDocument()
  })

  it('clicking Discard in confirmation calls onClose', async () => {
    const onClose = vi.fn()
    renderDialog({ onClose })
    await userEvent.clear(screen.getByPlaceholderText('Amount'))
    await userEvent.type(screen.getByPlaceholderText('Amount'), '100')
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    await userEvent.click(screen.getByRole('button', { name: /^discard$/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('clicking Keep Editing dismisses confirmation and keeps dialog open', async () => {
    const onClose = vi.fn()
    renderDialog({ onClose })
    await userEvent.clear(screen.getByPlaceholderText('Amount'))
    await userEvent.type(screen.getByPlaceholderText('Amount'), '100')
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    await userEvent.click(screen.getByRole('button', { name: /keep editing/i }))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByText('Discard this refund?')).not.toBeInTheDocument()
  })

  it('submit success calls onSubmit with correct lines and closes dialog', async () => {
    const onClose = vi.fn()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderDialog({ onClose, onSubmit })
    const amountInput = screen.getByPlaceholderText('Amount')
    await userEvent.clear(amountInput)
    await userEvent.type(amountInput, '200')
    await userEvent.click(screen.getByRole('button', { name: /^refund$/i }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(onSubmit).toHaveBeenCalledWith([
      expect.objectContaining({ paymentMethodId: 'pm-1', amount: 200 }),
    ])
  })

  it('submit error shows error alert and does not close dialog', async () => {
    const onClose = vi.fn()
    const onSubmit = vi.fn().mockRejectedValue({ message: 'Server error' })
    renderDialog({ onClose, onSubmit })
    const amountInput = screen.getByPlaceholderText('Amount')
    await userEvent.clear(amountInput)
    await userEvent.type(amountInput, '100')
    await userEvent.click(screen.getByRole('button', { name: /^refund$/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(onClose).not.toHaveBeenCalled()
  })

  it('partial refund works — can refund less than available', async () => {
    mockUseGetSalesOrderPaymentsQuery.mockReturnValue({ data: makePayments(500, 0), isLoading: false })
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderDialog({ onSubmit })
    const amountInput = screen.getByPlaceholderText('Amount')
    await userEvent.clear(amountInput)
    await userEvent.type(amountInput, '150')
    await userEvent.click(screen.getByRole('button', { name: /^refund$/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith([
      expect.objectContaining({ amount: 150 }),
    ]))
  })

  it('Escape on untouched dialog closes immediately', async () => {
    const onClose = vi.fn()
    renderDialog({ onClose })
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('Escape after editing shows discard confirmation', async () => {
    const onClose = vi.fn()
    renderDialog({ onClose })
    await userEvent.clear(screen.getByPlaceholderText('Amount'))
    await userEvent.type(screen.getByPlaceholderText('Amount'), '100')
    await userEvent.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('Discard this refund?')).toBeInTheDocument()
  })

  it('renders a date field defaulting to today for each refund line', async () => {
    mockUseGetSalesOrderPaymentsQuery.mockReturnValue({ data: makePayments(500, 0), isLoading: false })
    renderDialog()
    await waitFor(() => {
      const dateInputs = screen.getAllByDisplayValue(/^\d{4}-\d{2}-\d{2}$/)
      expect(dateInputs.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('submit payload includes paymentDate', async () => {
    mockUseGetSalesOrderPaymentsQuery.mockReturnValue({ data: makePayments(500, 0), isLoading: false })
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderDialog({ onSubmit })
    await userEvent.click(screen.getByRole('button', { name: /^refund$/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const [lines] = onSubmit.mock.calls[0]
    expect(lines[0]).toHaveProperty('paymentDate')
    expect(lines[0].paymentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('pre-fills one refund line matching the original payment method', () => {
    mockUseGetSalesOrderPaymentsQuery.mockReturnValue({
      data: [{ id: 'p1', salesOrderId: 'order-1', paymentMethodId: 'pm-2', amount: 400, paymentDate: '2026-01-01', createdAt: '', updatedAt: '' }],
      isLoading: false,
    })
    renderDialog()
    expect(screen.getByText('Bank Transfer')).toBeInTheDocument()
  })

  it('pre-fills multiple refund lines when order has multiple payments', async () => {
    mockUseGetSalesOrderPaymentsQuery.mockReturnValue({
      data: makeMultiPayments(),
      isLoading: false,
    })
    renderDialog()
    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('Amount')).toHaveLength(2)
    })
  })

  it('scales pre-filled amounts proportionally when a partial refund has already been issued', async () => {
    // Net: Cash = 300 - 100 = 200, Bank Transfer = 200; netTotal = 400 = availableForRefund
    mockUseGetSalesOrderPaymentsQuery.mockReturnValue({
      data: [
        ...makeMultiPayments(),
        { id: 'r1', salesOrderId: 'order-1', paymentMethodId: 'pm-1', amount: -100, paymentDate: '2026-01-02', createdAt: '', updatedAt: '' },
      ],
      isLoading: false,
    })
    renderDialog()
    await waitFor(() => {
      const amounts = screen.getAllByPlaceholderText('Amount') as HTMLInputElement[]
      // 200/400 * 400 = 200, 200/400 * 400 = 200
      expect(amounts[0].value).toBe('200')
      expect(amounts[1].value).toBe('200')
    })
  })

  it('excludes fully-refunded payment methods from pre-filled rows', async () => {
    // Cimb: +40 -40 = net 0 (excluded); Cash: +40 = net 40 (shown)
    mockUseGetSalesOrderPaymentsQuery.mockReturnValue({
      data: [
        { id: 'p1', salesOrderId: 'order-1', paymentMethodId: 'pm-2', amount: 40, paymentDate: '2026-01-01', createdAt: '', updatedAt: '' },
        { id: 'r1', salesOrderId: 'order-1', paymentMethodId: 'pm-2', amount: -40, paymentDate: '2026-01-02', createdAt: '', updatedAt: '' },
        { id: 'p2', salesOrderId: 'order-1', paymentMethodId: 'pm-1', amount: 40, paymentDate: '2026-01-03', createdAt: '', updatedAt: '' },
      ],
      isLoading: false,
    })
    renderDialog()
    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('Amount')).toHaveLength(1)
      expect((screen.getByPlaceholderText('Amount') as HTMLInputElement).value).toBe('40')
    })
  })

  it('falls back to Cash when original payment method is not in active list', () => {
    mockUseGetSalesOrderPaymentsQuery.mockReturnValue({
      data: [{ id: 'p1', salesOrderId: 'order-1', paymentMethodId: 'pm-deactivated', amount: 300, paymentDate: '2026-01-01', createdAt: '', updatedAt: '' }],
      isLoading: false,
    })
    renderDialog()
    // pm-deactivated not in paymentMethods list → falls back to Cash (pm-1)
    expect(screen.getByText('Cash')).toBeInTheDocument()
  })
})
