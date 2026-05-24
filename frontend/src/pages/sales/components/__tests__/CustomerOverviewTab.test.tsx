import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Customer } from '@/types'
import { CustomerType } from '@/types'

import CustomerOverviewTab from '../CustomerOverviewTab'

const baseCustomer: Customer = {
  id: 'c1',
  slug: 'acme-corp',
  type: CustomerType.BUSINESS,
  name: 'Acme Corp',
  phone: '012-3456789',
  email: 'info@acme.com',
  isActive: true,
  billingStreetAddress: '1 Main St',
  billingStreetAddress2: undefined,
  billingCity: 'Kuala Lumpur',
  billingState: 'WP',
  billingPostalCode: '50000',
  billingCountry: 'Malaysia',
  shippingStreetAddress: '2 Ship Rd',
  shippingStreetAddress2: undefined,
  shippingCity: 'Petaling Jaya',
  shippingState: 'Selangor',
  shippingPostalCode: '47500',
  shippingCountry: 'Malaysia',
  priceList: {
    id: 'pl1',
    code: 'RETAIL',
    name: 'Retail',
    isDefault: false,
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    items: [],
  },
  priceListId: 'pl1',
  notes: 'VIP customer',
  totalSales: 0,
  totalOrders: 0,
  averageOrderValue: 0,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
}

describe('CustomerOverviewTab', () => {
  it('renders basic info card', () => {
    render(<CustomerOverviewTab customer={baseCustomer} />)
    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    expect(screen.getByText('012-3456789')).toBeInTheDocument()
    expect(screen.getByText('info@acme.com')).toBeInTheDocument()
  })

  it('renders billing address', () => {
    render(<CustomerOverviewTab customer={baseCustomer} />)
    expect(screen.getByText('1 Main St')).toBeInTheDocument()
    expect(screen.getByText(/Kuala Lumpur/)).toBeInTheDocument()
  })

  it('renders shipping address when different from billing', () => {
    render(<CustomerOverviewTab customer={baseCustomer} />)
    expect(screen.getByText('2 Ship Rd')).toBeInTheDocument()
    expect(screen.queryByText('Same as Billing')).not.toBeInTheDocument()
  })

  it('shows Same as Billing chip when shipping matches billing', () => {
    const customer: Customer = {
      ...baseCustomer,
      shippingStreetAddress: '1 Main St',
      shippingStreetAddress2: undefined,
      shippingCity: 'Kuala Lumpur',
      shippingState: 'WP',
      shippingPostalCode: '50000',
      shippingCountry: 'Malaysia',
    }
    render(<CustomerOverviewTab customer={customer} />)
    expect(screen.getByText('Same as Billing')).toBeInTheDocument()
  })

  it('does not show Same as Billing chip when all shipping fields are blank', () => {
    const customer: Customer = {
      ...baseCustomer,
      shippingStreetAddress: undefined,
      shippingStreetAddress2: undefined,
      shippingCity: undefined,
      shippingState: undefined,
      shippingPostalCode: undefined,
      shippingCountry: undefined,
    }
    render(<CustomerOverviewTab customer={customer} />)
    expect(screen.queryByText('Same as Billing')).not.toBeInTheDocument()
  })

  it('does not show Same as Billing chip when billing is also blank', () => {
    const customer: Customer = {
      ...baseCustomer,
      billingStreetAddress: undefined,
      billingStreetAddress2: undefined,
      billingCity: undefined,
      billingState: undefined,
      billingPostalCode: undefined,
      billingCountry: undefined,
      shippingStreetAddress: undefined,
      shippingStreetAddress2: undefined,
      shippingCity: undefined,
      shippingState: undefined,
      shippingPostalCode: undefined,
      shippingCountry: undefined,
    }
    render(<CustomerOverviewTab customer={customer} />)
    expect(screen.queryByText('Same as Billing')).not.toBeInTheDocument()
  })

  it('renders price list and notes in Additional card', () => {
    render(<CustomerOverviewTab customer={baseCustomer} />)
    expect(screen.getByText('Retail')).toBeInTheDocument()
    expect(screen.getByText('VIP customer')).toBeInTheDocument()
  })

  it('renders em dash for missing optional fields', () => {
    const customer: Customer = { ...baseCustomer, phone: undefined, email: undefined }
    render(<CustomerOverviewTab customer={customer} />)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})
