import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import MarginChip from '../MarginChip'

describe('MarginChip', () => {
  it('renders green chip for margin > 20%', () => {
    render(<MarginChip price={100} cost={50} />)
    const chip = screen.getByText('50.0%')
    expect(chip).toBeInTheDocument()
  })

  it('renders yellow chip for margin > 10% and <= 20%', () => {
    render(<MarginChip price={100} cost={85} />)
    expect(screen.getByText('15.0%')).toBeInTheDocument()
  })

  it('renders red chip for margin <= 10%', () => {
    render(<MarginChip price={100} cost={95} />)
    expect(screen.getByText('5.0%')).toBeInTheDocument()
  })

  it('renders nothing when cost <= 0 (no division by zero)', () => {
    const { container } = render(<MarginChip price={100} cost={0} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when price <= 0', () => {
    const { container } = render(<MarginChip price={0} cost={50} />)
    expect(container).toBeEmptyDOMElement()
  })
})
