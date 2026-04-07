import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import CustomerContextHeader from '../CustomerContextHeader'
import { CustomerType } from '@/types'
import { formatCurrency } from '@/utils/formatters'

describe('CustomerContextHeader', () => {
  it('renders a two-column customer summary layout', () => {
    render(
      <CustomerContextHeader
        selectedCustomer={{
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
        }}
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
})
