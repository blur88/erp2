import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { CustomerType } from '@/types'

import CustomerList from '../CustomerList'

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => vi.fn() }
})

const baseCustomer = {
  id: 'cust-1',
  slug: 'acme-corp',
  name: 'Acme Corp',
  type: CustomerType.BUSINESS,
  isActive: true,
  phone: '555-1234',
  priceList: { id: 'pl-1', name: 'Retail', isActive: true },
  priceListId: 'pl-1',
  totalSales: 0,
  totalOrders: 0,
  averageOrderValue: 0,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
}

function renderList(customers = [baseCustomer]) {
  return render(
    <MemoryRouter>
      <CustomerList
        customers={customers as any}
        loading={false}
        total={customers.length}
        onStatusToggle={vi.fn()}
      />
    </MemoryRouter>,
  )
}

describe('CustomerList columns', () => {
  it('renders column headers', () => {
    renderList()
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Phone')).toBeInTheDocument()
    expect(screen.getByText('Type')).toBeInTheDocument()
    expect(screen.getByText('Price List')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
  })

  it('does not render the Customers count header', () => {
    renderList()
    expect(screen.queryByText(/Customers \(/)).not.toBeInTheDocument()
  })

  it('renders paginationSlot inside the table card', () => {
    render(
      <MemoryRouter>
        <CustomerList
          customers={[baseCustomer] as any}
          loading={false}
          total={1}
          onStatusToggle={vi.fn()}
          paginationSlot={<div data-testid="pagination-slot">Pagination</div>}
        />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('pagination-slot')).toBeInTheDocument()
  })

  it('renders customer name', () => {
    renderList()
    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
  })

  it('renders phone number', () => {
    renderList()
    expect(screen.getByText('555-1234')).toBeInTheDocument()
  })

  it('renders — when phone is not set', () => {
    renderList([{ ...baseCustomer, phone: undefined }])
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders Business for business type', () => {
    renderList()
    expect(screen.getByText('Business')).toBeInTheDocument()
  })

  it('renders Individual for individual type', () => {
    renderList([{ ...baseCustomer, type: CustomerType.INDIVIDUAL }])
    expect(screen.getByText('Individual')).toBeInTheDocument()
  })

  it('renders price list name', () => {
    renderList()
    expect(screen.getByText('Retail')).toBeInTheDocument()
  })

  it('renders — when price list is not set', () => {
    renderList([{ ...baseCustomer, priceList: undefined, priceListId: undefined }])
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders Active chip for active customer', () => {
    renderList()
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('renders Inactive chip for inactive customer', () => {
    renderList([{ ...baseCustomer, isActive: false }])
    expect(screen.getByText('Inactive')).toBeInTheDocument()
  })
})
