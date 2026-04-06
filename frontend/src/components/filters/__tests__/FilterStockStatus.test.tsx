import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FilterStockStatus } from '../FilterStockStatus'

describe('FilterStockStatus', () => {
  it('renders a Stock Status select', () => {
    render(<FilterStockStatus value={null} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Stock Status')).toBeInTheDocument()
  })

  it('calls onChange with "low_stock" when Low Stock is selected', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<FilterStockStatus value={null} onChange={onChange} />)

    await user.click(screen.getByLabelText('Stock Status'))
    await user.click(screen.getByRole('option', { name: 'Low Stock' }))

    expect(onChange).toHaveBeenCalledWith('low_stock')
  })

  it('calls onChange with "out_of_stock" when Out of Stock is selected', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<FilterStockStatus value={null} onChange={onChange} />)

    await user.click(screen.getByLabelText('Stock Status'))
    await user.click(screen.getByRole('option', { name: 'Out of Stock' }))

    expect(onChange).toHaveBeenCalledWith('out_of_stock')
  })

  it('calls onChange with null when All is selected', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<FilterStockStatus value="low_stock" onChange={onChange} />)

    await user.click(screen.getByLabelText('Stock Status'))
    await user.click(screen.getByRole('option', { name: 'All' }))

    expect(onChange).toHaveBeenCalledWith(null)
  })
})
