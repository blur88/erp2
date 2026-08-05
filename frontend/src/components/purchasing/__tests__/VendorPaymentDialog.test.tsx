import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import VendorPaymentDialog from '../VendorPaymentDialog'

const { mockUseGetActivePaymentMethodsForPurchasesQuery } = vi.hoisted(() => ({
  mockUseGetActivePaymentMethodsForPurchasesQuery: vi.fn(),
}))

vi.mock('@/store/api/paymentMethodsApi', () => ({
  useGetActivePaymentMethodsForPurchasesQuery: mockUseGetActivePaymentMethodsForPurchasesQuery,
}))

const paymentMethods = [
  { id: 'pm-1', name: 'Cash', code: 'CASH', isActive: true },
  { id: 'pm-2', name: 'Bank Transfer', code: 'BANK', isActive: true },
]

function renderDialog(props: Partial<ComponentProps<typeof VendorPaymentDialog>> = {}) {
  const defaults = {
    open: true,
    onClose: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(undefined),
    orderNumber: 'PO-26-001',
    totalAmount: '1000.0000',
    paidAmount: '0.0000',
  }
  return render(<VendorPaymentDialog {...defaults} {...props} />)
}

beforeEach(() => {
  mockUseGetActivePaymentMethodsForPurchasesQuery.mockReturnValue({ data: paymentMethods })
})

afterEach(() => {
  localStorage.removeItem('defaultCurrency')
})

describe('VendorPaymentDialog money handling', () => {
  it('seeds the outstanding balance at the two-decimal floor', () => {
    renderDialog()
    // type="number" inputs: toHaveValue normalizes to Number; assert the raw
    // DOM value to check the two-decimal lexical normalization.
    const input = screen.getByPlaceholderText('Amount') as HTMLInputElement
    expect(input.value).toBe('1000.00')
  })

  it('computes the outstanding balance exactly', () => {
    // 1000.0000 - 0.1000 - exact subtraction, no binary64 drift.
    renderDialog({ totalAmount: '1000.0000', paidAmount: '0.1000' })
    const input = screen.getByPlaceholderText('Amount') as HTMLInputElement
    expect(input.value).toBe('999.90')
  })

  it('formats summaries with the configured currency, not a hard-coded MYR', () => {
    localStorage.setItem('defaultCurrency', 'USD')
    renderDialog()
    expect(screen.queryByText(/RM|MYR/)).not.toBeInTheDocument()
    expect(screen.getAllByText(/USD/).length).toBeGreaterThan(0)
  })

  it('submits the exact decimal string, not a coerced number', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderDialog({ onSubmit })

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

  it('preserves a large decimal(12,4) value', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderDialog({ onSubmit, totalAmount: '99999999.9900', paidAmount: '0.0000' })

    await userEvent.click(screen.getByRole('button', { name: /record payment/i }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith([
        expect.objectContaining({ amount: '99999999.99' }),
      ]),
    )
  })

  it('disables submit for a malformed amount instead of counting it as zero', async () => {
    renderDialog()
    const input = screen.getByPlaceholderText('Amount')
    await userEvent.clear(input)
    await userEvent.type(input, '1.00001')
    expect(screen.getByRole('button', { name: /record payment/i })).toBeDisabled()
  })

  // Overpayment is a supported flow: warn, but allow submit.
  it('warns on overpayment but still allows submit', async () => {
    renderDialog({ totalAmount: '100.0000', paidAmount: '0.0000' })
    const input = screen.getByPlaceholderText('Amount')
    await userEvent.clear(input)
    await userEvent.type(input, '100.0001')

    expect(screen.getByRole('button', { name: /record payment/i })).toBeEnabled()
  })

  it('disables submit on a zero total even though the API accepts zero', async () => {
    renderDialog()
    const input = screen.getByPlaceholderText('Amount')
    await userEvent.clear(input)
    await userEvent.type(input, '0')
    expect(screen.getByRole('button', { name: /record payment/i })).toBeDisabled()
  })
})
