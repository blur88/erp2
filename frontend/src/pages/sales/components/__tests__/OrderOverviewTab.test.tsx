import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import type { SalesOrder, SalesOrderItem } from '@/types'

import OrderOverviewTab from '../OrderOverviewTab'

function makeItem(overrides: Partial<SalesOrderItem> & Record<string, unknown> = {}): SalesOrderItem & Record<string, unknown> {
  return {
    id: 'i1',
    product: {
      id: 'p1',
      name: 'Widget',
      sku: 'W1',
      price: 10,
      quantity: 100,
      categoryId: 'cat1',
      isActive: true,
      unit: 'pcs',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    quantity: 2,
    unitPrice: 50,
    discount: 0,
    total: 100,
    discountType: 'percentage',
    discountPercent: 0,
    discountAmount: 0,
    ...overrides,
  }
}

function makeOrder(overrides: Partial<SalesOrder> = {}): SalesOrder {
  return {
    id: 'o1',
    orderNumber: 'SO-26-001',
    status: 'DRAFT',
    paymentStatus: 'UNPAID',
    customerId: 'c1',
    customer: {
      id: 'c1',
      slug: 'acme',
      name: 'Acme Corp',
      isActive: true,
      type: 'BUSINESS' as any,
      totalSales: 0,
      totalOrders: 0,
      averageOrderValue: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    totalAmount: '100.0000',
    paidAmount: '0.0000',
    balanceDue: '100.0000',
    shippingAmount: 10,
    subtotal: 90,
    orderDate: new Date('2026-01-15'),
    items: [makeItem()],
    createdAt: new Date('2026-01-15'),
    updatedAt: new Date('2026-01-15'),
    ...overrides,
  } as SalesOrder
}

function renderTab(order: SalesOrder) {
  return render(
    <MemoryRouter>
      <OrderOverviewTab order={order} />
    </MemoryRouter>,
  )
}

describe('OrderOverviewTab', () => {
  it('renders order number', () => {
    renderTab(makeOrder())
    expect(screen.getByText('SO-26-001')).toBeInTheDocument()
  })

  it('renders customer name as a link', () => {
    renderTab(makeOrder())
    const link = screen.getByRole('link', { name: 'Acme Corp' })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/sales/customers/acme/view')
  })

  it('renders notes when present', () => {
    renderTab(makeOrder({ notes: 'Deliver ASAP' }))
    expect(screen.getByText('Deliver ASAP')).toBeInTheDocument()
  })

  it('renders em dash for notes when absent', () => {
    renderTab(makeOrder({ notes: undefined }))
    expect(screen.getByText('Notes')).toBeInTheDocument()
  })

  it('renders line item product name', () => {
    renderTab(makeOrder())
    expect(screen.getByText('Widget')).toBeInTheDocument()
  })

  it('renders percentage discount as X%', () => {
    renderTab(makeOrder({
      items: [makeItem({ discountType: 'percentage', discountPercent: 10 })],
    }))
    expect(screen.getByText('10.00%')).toBeInTheDocument()
  })

  it('renders amount discount as currency', () => {
    renderTab(makeOrder({
      items: [makeItem({ discountType: 'amount', discountAmount: 5 })],
    }))
    expect(screen.getByText(/5\.00/)).toBeInTheDocument()
  })

  it('renders no discount as dash when discount is zero', () => {
    renderTab(makeOrder({
      items: [makeItem({ discountType: 'percentage', discountPercent: 0, discountAmount: 0 })],
    }))
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
  })

  it('renders totals section with Total, Paid, Balance', () => {
    renderTab(makeOrder())
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getByText('Paid')).toBeInTheDocument()
    expect(screen.getByText('Balance')).toBeInTheDocument()
  })

  it('shows the real partial balance due', () => {
    renderTab(makeOrder({
      paymentStatus: 'PARTIAL',
      totalAmount: '1000.0000',
      paidAmount: '400.0000',
      balanceDue: '600.0000',
    }))

    expect(screen.getAllByText('Balance Due').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/600/).length).toBeGreaterThan(0)
  })

  it('shows Surplus for an overpaid order', () => {
    renderTab(makeOrder({
      paymentStatus: 'OVERPAID',
      totalAmount: '1000.0000',
      paidAmount: '1200.0000',
      balanceDue: '-200.0000',
    }))

    expect(screen.getAllByText('Surplus').length).toBeGreaterThan(0)
    expect(screen.queryByText(/-.*200/)).toBeNull()
    expect(screen.getAllByText(/200/).length).toBeGreaterThan(0)
  })
})
