import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FilterPurchasingStatus } from '../FilterPurchasingStatus'

describe('FilterPurchasingStatus', () => {
  it('renders with Order Status label', () => {
    render(<FilterPurchasingStatus field="purchasingStatus" value={null} onChange={vi.fn()} />)
    expect(screen.getByLabelText(/order status/i)).toBeInTheDocument()
  })

  it('shows all PO status options', async () => {
    render(<FilterPurchasingStatus field="purchasingStatus" value={null} onChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('combobox'))
    expect(await screen.findByText('Draft')).toBeInTheDocument()
    expect(await screen.findByText('Ready')).toBeInTheDocument()
    expect(await screen.findByText('Received')).toBeInTheDocument()
    expect(await screen.findByText('Cancelled')).toBeInTheDocument()
  })
})
