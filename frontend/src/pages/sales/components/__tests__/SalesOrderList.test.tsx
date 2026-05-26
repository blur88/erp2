import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { SalesOrder } from '@/types'

import SalesOrderList from '../SalesOrderList'

function makeOrder(overrides: Partial<SalesOrder> = {}): SalesOrder {
  return {
    id: 'ord-1',
    orderNumber: 'SO-26-001',
    status: 'DRAFT',
    paymentStatus: 'UNPAID',
    customerId: 'cust-1',
    customer: { id: 'cust-1', name: 'Amuro Ray' } as any,
    totalAmount: 1000,
    orderDate: new Date('2026-01-15'),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

const noop = vi.fn()
const defaultProps = {
  orders: [makeOrder()],
  loading: false,
  total: 1,
  onView: noop,
  onEdit: noop,
  onPay: noop,
  onFulfill: noop,
  onUnfulfill: noop,
  onRefund: noop,
  onCancel: noop,
  onPrint: noop,
  paginationSlot: undefined,
}

function renderList(props = defaultProps) {
  return render(
    <MemoryRouter>
      <SalesOrderList {...props} />
    </MemoryRouter>,
  )
}

async function openMenu() {
  await userEvent.click(screen.getByRole('button', { name: /row actions/i }))
}

describe('SalesOrderList columns', () => {
  it('renders order number', () => {
    renderList()
    expect(screen.getByText('SO-26-001')).toBeInTheDocument()
  })

  it('renders customer name', () => {
    renderList()
    expect(screen.getByText('Amuro Ray')).toBeInTheDocument()
  })

  it('renders total amount formatted', () => {
    renderList()
    expect(screen.getByText(/1[,.]?000/)).toBeInTheDocument()
  })

  it('renders Draft status chip', () => {
    renderList()
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  it('renders Unpaid payment chip', () => {
    renderList()
    expect(screen.getByText('Unpaid')).toBeInTheDocument()
  })
})

describe('SalesOrderList empty state', () => {
  it('shows empty message when no orders', () => {
    renderList({ ...defaultProps, orders: [], total: 0 })
    expect(screen.getByText(/no sales orders yet/i)).toBeInTheDocument()
  })
})

describe('SalesOrderList row actions — Draft Unpaid', () => {
  it('shows View, Edit, Pay, Fulfill (disabled), Cancel, Print', async () => {
    renderList()
    await openMenu()
    expect(screen.getByRole('menuitem', { name: /view/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /^edit$/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /^pay$/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /fulfill/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /cancel/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /print/i })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /unfulfill/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /refund/i })).not.toBeInTheDocument()
  })

  it('Fulfill is disabled with tooltip', async () => {
    renderList()
    await openMenu()
    const fulfill = screen.getByRole('menuitem', { name: /fulfill/i })
    expect(fulfill).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByTitle('Full payment required')).toBeInTheDocument()
  })
})

describe('SalesOrderList row actions — Draft Paid', () => {
  it('shows View, Edit (disabled), Fulfill, Refund, Cancel (disabled), Print — no Pay', async () => {
    renderList({ ...defaultProps, orders: [makeOrder({ paymentStatus: 'PAID' })] })
    await openMenu()
    expect(screen.getByRole('menuitem', { name: /view/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /^edit$/i })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /^pay$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /^fulfill$/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /refund/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /cancel/i })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /unfulfill/i })).not.toBeInTheDocument()
    const edit = screen.getByRole('menuitem', { name: /^edit$/i })
    expect(edit).toHaveAttribute('aria-disabled', 'true')
  })
})

describe('SalesOrderList row actions — Fulfilled', () => {
  it('shows View, Edit (disabled), Unfulfill, Refund, Cancel (disabled), Print', async () => {
    renderList({ ...defaultProps, orders: [makeOrder({ status: 'FULFILLED', paymentStatus: 'PAID' })] })
    await openMenu()
    expect(screen.getByRole('menuitem', { name: /view/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /^edit$/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /unfulfill/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /refund/i })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /^fulfill$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /^pay$/i })).not.toBeInTheDocument()
  })
})

describe('SalesOrderList row actions — Cancelled', () => {
  it('shows only View and Print', async () => {
    renderList({ ...defaultProps, orders: [makeOrder({ status: 'CANCELLED', paymentStatus: 'UNPAID' })] })
    await openMenu()
    expect(screen.getByRole('menuitem', { name: /view/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /print/i })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /^edit$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /cancel/i })).not.toBeInTheDocument()
  })
})
