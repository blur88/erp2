import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SalesOrderPaymentStatusChip } from '../SalesOrderPaymentStatusChip'
import { SalesOrderStatusChip } from '../SalesOrderStatusChip'

describe('SalesOrderStatusChip', () => {
  it('renders Draft for DRAFT', () => {
    render(<SalesOrderStatusChip status="DRAFT" />)
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  it('renders Fulfill for FULFILLED', () => {
    render(<SalesOrderStatusChip status="FULFILLED" />)
    expect(screen.getByText('Fulfill')).toBeInTheDocument()
  })

  it('renders Cancelled for CANCELLED', () => {
    render(<SalesOrderStatusChip status="CANCELLED" />)
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
  })
})

describe('SalesOrderPaymentStatusChip', () => {
  it('renders Unpaid for UNPAID', () => {
    render(<SalesOrderPaymentStatusChip status="UNPAID" />)
    expect(screen.getByText('Unpaid')).toBeInTheDocument()
  })

  it('renders Partial for PARTIAL', () => {
    render(<SalesOrderPaymentStatusChip status="PARTIAL" />)
    expect(screen.getByText('Partial')).toBeInTheDocument()
  })

  it('renders Paid for PAID', () => {
    render(<SalesOrderPaymentStatusChip status="PAID" />)
    expect(screen.getByText('Paid')).toBeInTheDocument()
  })

  it('renders Overpaid for OVERPAID', () => {
    render(<SalesOrderPaymentStatusChip status="OVERPAID" />)
    expect(screen.getByText('Overpaid')).toBeInTheDocument()
  })
})
