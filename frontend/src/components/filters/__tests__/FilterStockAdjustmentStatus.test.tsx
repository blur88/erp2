import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FilterStockAdjustmentStatus } from '../FilterStockAdjustmentStatus'

describe('FilterStockAdjustmentStatus', () => {
  it('renders with Status label', () => {
    render(<FilterStockAdjustmentStatus field="status" value={null} onChange={vi.fn()} />)
    expect(screen.getByLabelText(/status/i)).toBeInTheDocument()
  })

  it('shows exactly All, Draft, and Completed options', async () => {
    render(<FilterStockAdjustmentStatus field="status" value={null} onChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('combobox'))
    // FilterSelect renders the empty "All" MenuItem plus the option list.
    const optionNames = screen.getAllByRole('option').map((o) => o.textContent)
    expect(optionNames).toEqual(['All', 'Draft', 'Completed'])
  })
})
