import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { StatusChip } from '@/components/common/StatusChip'

const chipRoot = () => document.querySelector('.MuiChip-root') as HTMLElement

describe('Sales order status via StatusChip', () => {
  it('renders Draft (warning) for DRAFT', () => {
    render(<StatusChip status="DRAFT" />)
    expect(screen.getByText('Draft')).toBeInTheDocument()
    expect(chipRoot()).toHaveClass('MuiChip-colorWarning')
  })

  it('renders Fulfilled (success) for FULFILLED', () => {
    render(<StatusChip status="FULFILLED" />)
    expect(chipRoot()).toHaveClass('MuiChip-colorSuccess')
  })

  it('renders Cancelled (default/grey) for CANCELLED', () => {
    render(<StatusChip status="CANCELLED" />)
    expect(chipRoot()).toHaveClass('MuiChip-colorDefault')
  })

  it('renders Ready (info) for READY', () => {
    render(<StatusChip status="READY" />)
    expect(chipRoot()).toHaveClass('MuiChip-colorInfo')
  })
})

describe('Sales payment status via StatusChip', () => {
  it('renders Unpaid (error) for UNPAID', () => {
    render(<StatusChip status="UNPAID" />)
    expect(chipRoot()).toHaveClass('MuiChip-colorError')
  })

  it('renders Partial (warning) for PARTIAL', () => {
    render(<StatusChip status="PARTIAL" />)
    expect(chipRoot()).toHaveClass('MuiChip-colorWarning')
  })

  it('renders Paid (success) for PAID', () => {
    render(<StatusChip status="PAID" />)
    expect(chipRoot()).toHaveClass('MuiChip-colorSuccess')
  })

  it('renders Overpaid (info) for OVERPAID', () => {
    render(<StatusChip status="OVERPAID" />)
    expect(chipRoot()).toHaveClass('MuiChip-colorInfo')
  })
})
