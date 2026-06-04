import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import StockIndicatorChip from '../StockIndicatorChip'

describe('StockIndicatorChip', () => {
  it('shows In stock when sufficient', () => {
    render(<StockIndicatorChip stockQuantity={10} quantity={5} />)
    expect(screen.getByText('In stock')).toBeInTheDocument()
  })

  it('shows Out of stock when zero', () => {
    render(<StockIndicatorChip stockQuantity={0} quantity={1} />)
    expect(screen.getByText('Out of stock (0)')).toBeInTheDocument()
  })

  it('shows Only N left when insufficient', () => {
    render(<StockIndicatorChip stockQuantity={2} quantity={5} />)
    expect(screen.getByText('Only 2 left (need 5)')).toBeInTheDocument()
  })
})
