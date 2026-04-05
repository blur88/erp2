import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FilterPaymentStatus } from '../FilterPaymentStatus'

describe('FilterPaymentStatus', () => {
  it('renders with Payment label', () => {
    render(<FilterPaymentStatus value={null} onChange={vi.fn()} />)
    expect(screen.getByLabelText(/payment/i)).toBeInTheDocument()
  })

  it('shows all four options by default', async () => {
    render(<FilterPaymentStatus value={null} onChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('combobox'))
    expect(await screen.findByText('Unpaid')).toBeInTheDocument()
    expect(await screen.findByText('Partial')).toBeInTheDocument()
    expect(await screen.findByText('Paid')).toBeInTheDocument()
    expect(await screen.findByText('Overpaid')).toBeInTheDocument()
  })

  it('hides Overpaid when includeOverpaid=false', async () => {
    render(<FilterPaymentStatus value={null} onChange={vi.fn()} includeOverpaid={false} />)
    await userEvent.click(screen.getByRole('combobox'))
    expect(await screen.findByText('Paid')).toBeInTheDocument()
    expect(screen.queryByText('Overpaid')).not.toBeInTheDocument()
  })
})
