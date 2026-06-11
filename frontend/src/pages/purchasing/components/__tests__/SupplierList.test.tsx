import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Supplier } from '@/types'

import SupplierList from '../SupplierList'

const navigateMock = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigateMock }
})

beforeEach(() => {
  navigateMock.mockClear()
})

const baseSupplier: Supplier = {
  id: 'sup-1',
  slug: 'globex',
  type: 'local',
  companyName: 'Globex',
  isActive: true,
  contactPerson: 'Hank Scorpio',
  totalPurchases: 0,
  totalOrders: 0,
  averageOrderValue: 0,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
}

function renderList(suppliers: Supplier[] = [baseSupplier]) {
  return render(
    <MemoryRouter>
      <SupplierList
        suppliers={suppliers}
        loading={false}
        total={suppliers.length}
        onStatusToggle={vi.fn()}
      />
    </MemoryRouter>,
  )
}

describe('SupplierList columns', () => {
  it('renders column headers', () => {
    renderList()
    expect(screen.getByText('Company Name')).toBeInTheDocument()
    expect(screen.getByText('Contact Person')).toBeInTheDocument()
    expect(screen.getByText('Type')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Actions')).toBeInTheDocument()
  })

  it('renders company name', () => {
    renderList()
    expect(screen.getByText('Globex')).toBeInTheDocument()
  })

  it('renders contact person', () => {
    renderList()
    expect(screen.getByText('Hank Scorpio')).toBeInTheDocument()
  })

  it('renders - when contact person is not set', () => {
    renderList([{ ...baseSupplier, contactPerson: null }])
    expect(screen.getByText('-')).toBeInTheDocument()
  })

  it('renders Local for local type', () => {
    renderList()
    expect(screen.getByText('Local')).toBeInTheDocument()
  })

  it('renders International for international type', () => {
    renderList([{ ...baseSupplier, type: 'international' }])
    expect(screen.getByText('International')).toBeInTheDocument()
  })

  it('renders Active chip for active supplier', () => {
    renderList()
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('renders Inactive chip for inactive supplier', () => {
    renderList([{ ...baseSupplier, isActive: false }])
    expect(screen.getByText('Inactive')).toBeInTheDocument()
  })
})

describe('SupplierList row click', () => {
  it('navigates to the supplier detail page when a row is clicked', async () => {
    renderList()
    await userEvent.click(screen.getByText('Globex'))
    expect(navigateMock).toHaveBeenCalledWith('/purchasing/suppliers/globex/view')
  })
})
