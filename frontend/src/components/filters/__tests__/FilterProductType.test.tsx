import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FilterProductType } from '../FilterProductType'

describe('FilterProductType', () => {
  it('renders a Product Type select', () => {
    render(<FilterProductType field="productType" value={null} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Product Type')).toBeInTheDocument()
  })

  it('calls onChange with "goods" when Goods is selected', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<FilterProductType field="productType" value={null} onChange={onChange} />)

    await user.click(screen.getByLabelText('Product Type'))
    await user.click(screen.getByRole('option', { name: 'Goods' }))

    expect(onChange).toHaveBeenCalledWith('goods')
  })

  it('calls onChange with "service" when Service is selected', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<FilterProductType field="productType" value={null} onChange={onChange} />)

    await user.click(screen.getByLabelText('Product Type'))
    await user.click(screen.getByRole('option', { name: 'Service' }))

    expect(onChange).toHaveBeenCalledWith('service')
  })

  it('calls onChange with null when All is selected', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<FilterProductType field="productType" value="goods" onChange={onChange} />)

    await user.click(screen.getByLabelText('Product Type'))
    await user.click(screen.getByRole('option', { name: 'All' }))

    expect(onChange).toHaveBeenCalledWith(null)
  })
})
