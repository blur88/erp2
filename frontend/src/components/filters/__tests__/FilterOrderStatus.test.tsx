import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FilterOrderStatus } from '../FilterOrderStatus'

describe('FilterOrderStatus', () => {
  it('renders with Order Status label', () => {
    render(<FilterOrderStatus field="orderStatus" value={null} onChange={vi.fn()} />)
    expect(screen.getByLabelText(/order status/i)).toBeInTheDocument()
  })

  it('shows Unfulfilled and Fulfilled options', async () => {
    render(<FilterOrderStatus field="orderStatus" value={null} onChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('combobox'))
    expect(await screen.findByText('Unfulfilled')).toBeInTheDocument()
    expect(await screen.findByText('Fulfilled')).toBeInTheDocument()
  })

  it('shows a Ready option for the status field', async () => {
    render(<FilterOrderStatus field="status" value={null} onChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('combobox'))
    expect(await screen.findByRole('option', { name: 'Ready' })).toBeInTheDocument()
  })

  it('displays the selected value', () => {
    render(<FilterOrderStatus field="orderStatus" value="fulfilled" onChange={vi.fn()} />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })
})
