import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import StockIndicatorChip from '../StockIndicatorChip'

const chipRoot = () => document.querySelector('.MuiChip-root') as HTMLElement

describe('StockIndicatorChip', () => {
  it('shows In stock (success) when sufficient', () => {
    render(<StockIndicatorChip stockQuantity={10} quantity={5} />)
    expect(screen.getByText('In stock')).toBeInTheDocument()
    expect(chipRoot()).toHaveClass('MuiChip-colorSuccess')
  })

  it('shows Out of stock (error) + icon when zero', () => {
    render(<StockIndicatorChip stockQuantity={0} quantity={1} />)
    expect(screen.getByText('Out of stock (0)')).toBeInTheDocument()
    expect(chipRoot()).toHaveClass('MuiChip-colorError')
    expect(chipRoot().querySelector('svg')).toBeInTheDocument()
  })

  it('shows Only N left (warning) + icon when insufficient', () => {
    render(<StockIndicatorChip stockQuantity={2} quantity={5} />)
    expect(screen.getByText('Only 2 left (need 5)')).toBeInTheDocument()
    expect(chipRoot()).toHaveClass('MuiChip-colorWarning')
    expect(chipRoot().querySelector('svg')).toBeInTheDocument()
  })
})
