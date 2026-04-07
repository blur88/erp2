import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import CustomerContextHeader from '../CustomerContextHeader'
import { CustomerType } from '@/types'
import { formatCurrency } from '@/utils/formatters'

const baseCustomer = {
  id: 'customer-1',
  type: CustomerType.BUSINESS,
  name: 'Acme Supplies',
  phone: '555-0100',
  email: 'billing@acme.test',
  isActive: true,
  totalSales: 12500,
  totalOrders: 18,
  averageOrderValue: 694.44,
  firstPurchaseDate: new Date('2026-01-10T00:00:00.000Z'),
  lastPurchaseDate: new Date('2026-04-01T00:00:00.000Z'),
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-04-01T00:00:00.000Z'),
}

describe('CustomerContextHeader', () => {
  it('renders a two-column customer summary layout', () => {
    render(
      <CustomerContextHeader
        selectedCustomer={baseCustomer}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByText('Customer - Acme Supplies')).toBeInTheDocument()
    expect(screen.getByText('Customer Information')).toBeInTheDocument()
    expect(screen.getByText('Account Summary')).toBeInTheDocument()
    expect(screen.getByText('Business')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText(formatCurrency(12500))).toBeInTheDocument()
    expect(screen.getAllByRole('table')).toHaveLength(2)
  })

  it('renders Individual type and Inactive status as plain text', () => {
    render(
      <CustomerContextHeader
        selectedCustomer={{ ...baseCustomer, type: CustomerType.INDIVIDUAL, isActive: false }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByText('Individual')).toBeInTheDocument()
    expect(screen.getByText('Inactive')).toBeInTheDocument()
    expect(screen.queryByText('Active')).not.toBeInTheDocument()
  })

  it('shows — for missing priceList', () => {
    render(
      <CustomerContextHeader
        selectedCustomer={{ ...baseCustomer, priceList: undefined, priceListId: undefined }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    // Price List row label is present and its value is —
    const rows = screen.getAllByRole('row')
    const priceListRow = rows.find(r => r.textContent?.includes('Price List'))
    expect(priceListRow).toBeTruthy()
    expect(priceListRow!.textContent).toContain('—')
  })

  it('shows — for missing first and last purchase dates', () => {
    render(
      <CustomerContextHeader
        selectedCustomer={{ ...baseCustomer, firstPurchaseDate: undefined, lastPurchaseDate: undefined }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    const rows = screen.getAllByRole('row')
    const firstRow = rows.find(r => r.textContent?.includes('First Purchase'))
    const lastRow = rows.find(r => r.textContent?.includes('Last Purchase'))
    expect(firstRow!.textContent).toContain('—')
    expect(lastRow!.textContent).toContain('—')
  })
})
