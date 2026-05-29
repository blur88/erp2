import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SalesOrderPaymentStatusChip } from '../SalesOrderPaymentStatusChip'
import { SalesOrderStatusChip } from '../SalesOrderStatusChip'

describe('SalesOrderStatusChip', () => {
  it('renders Draft for DRAFT', () => {
    render(<SalesOrderStatusChip status="DRAFT" />)
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  it('renders Fulfilled for FULFILLED', () => {
    render(<SalesOrderStatusChip status="FULFILLED" />)
    expect(screen.getByText('Fulfilled')).toBeInTheDocument()
  })

  it('renders Cancelled for CANCELLED', () => {
    render(<SalesOrderStatusChip status="CANCELLED" />)
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
  })

  it('renders Ready for DRAFT + PAID', () => {
    render(<SalesOrderStatusChip status="DRAFT" paymentStatus="PAID" />)
    expect(screen.getByText('Ready')).toBeInTheDocument()
    expect(screen.queryByText('Draft')).not.toBeInTheDocument()
  })

  it('renders Draft for DRAFT + UNPAID', () => {
    render(<SalesOrderStatusChip status="DRAFT" paymentStatus="UNPAID" />)
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  it('renders Draft for DRAFT + PARTIAL', () => {
    render(<SalesOrderStatusChip status="DRAFT" paymentStatus="PARTIAL" />)
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  it('renders Draft for DRAFT + OVERPAID', () => {
    render(<SalesOrderStatusChip status="DRAFT" paymentStatus="OVERPAID" />)
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  it('renders Draft for DRAFT with no paymentStatus', () => {
    render(<SalesOrderStatusChip status="DRAFT" />)
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  it('renders Fulfilled for FULFILLED + PAID', () => {
    render(<SalesOrderStatusChip status="FULFILLED" paymentStatus="PAID" />)
    expect(screen.getByText('Fulfilled')).toBeInTheDocument()
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
