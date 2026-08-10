import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FilterPaymentStatus } from '../FilterPaymentStatus'

describe('FilterPaymentStatus', () => {
  it('renders with Payment label', () => {
    render(<FilterPaymentStatus field="paymentStatus" value={null} onChange={vi.fn()} valueCase="lower" />)
    expect(screen.getByLabelText(/payment/i)).toBeInTheDocument()
  })

  it('shows all four options by default', async () => {
    render(<FilterPaymentStatus field="paymentStatus" value={null} onChange={vi.fn()} valueCase="lower" />)
    await userEvent.click(screen.getByRole('combobox'))
    expect(await screen.findByText('Unpaid')).toBeInTheDocument()
    expect(await screen.findByText('Partial')).toBeInTheDocument()
    expect(await screen.findByText('Paid')).toBeInTheDocument()
    expect(await screen.findByText('Overpaid')).toBeInTheDocument()
  })

  it('hides Overpaid when includeOverpaid=false', async () => {
    render(<FilterPaymentStatus field="paymentStatus" value={null} onChange={vi.fn()} includeOverpaid={false} valueCase="lower" />)
    await userEvent.click(screen.getByRole('combobox'))
    expect(await screen.findByText('Paid')).toBeInTheDocument()
    expect(screen.queryByText('Overpaid')).not.toBeInTheDocument()
  })

  // Labels are identical in both cases, so the three tests above pass either
  // way — nothing pinned the emitted VALUE until #1019. These do.
  it.each([
    ['lower', 'unpaid'],
    ['upper', 'UNPAID'],
  ] as const)('emits %s-case value %s', async (valueCase, expected) => {
    const onChange = vi.fn()
    render(
      <FilterPaymentStatus field="paymentStatus" value={null} onChange={onChange} valueCase={valueCase} />,
    )

    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(await screen.findByRole('option', { name: 'Unpaid' }))

    expect(onChange).toHaveBeenCalledWith(expected)
  })
})
