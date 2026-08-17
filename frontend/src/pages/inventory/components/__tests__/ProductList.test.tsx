import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { formatCurrency } from '@/utils/currency'
import type { Product } from '@/types'

import ProductList from '../ProductList'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const product = {
  id: 'p1',
  slug: 'widget',
  name: 'Widget',
  barcode: 'B1',
  type: 'Stocked Product',
  category: { id: 'c1', name: 'Tools' },
  baseCost: 5,
  stockQuantity: 1234,
  isActive: true,
  isOutOfStock: false,
} as unknown as Product

function renderList(props: Partial<React.ComponentProps<typeof ProductList>> = {}) {
  return render(
    <MemoryRouter>
      <ProductList
        products={[product]}
        loading={false}
        total={1}
        onStatusToggle={vi.fn()}
        getDefaultPrice={() => 99}
        {...props}
      />
    </MemoryRouter>,
  )
}

describe('ProductList', () => {
  it('renders product name, category and comma-formatted stock', () => {
    renderList()
    expect(screen.getByText('Widget')).toBeInTheDocument()
    expect(screen.getByText('Tools')).toBeInTheDocument()
    expect(screen.getByText('1,234')).toBeInTheDocument()
  })

  it('renders the base cost as currency', () => {
    renderList()
    expect(screen.getByText(formatCurrency(5))).toBeInTheDocument()
  })

  it('renders an em dash when the base cost is zero', () => {
    renderList({ products: [{ ...product, baseCost: 0 }] })
    expect(screen.queryByText(formatCurrency(0))).not.toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('labels each column header in the same order as the rendered cells', () => {
    renderList()
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual([
      'Name',
      'Category',
      'Base Cost',
      'Default Selling Price',
      'Stock Qty',
      'Active',
      'Actions',
    ])

    const cells = screen.getAllByRole('cell').map((c) => c.textContent)
    expect(cells.slice(0, 5)).toEqual([
      'Widget',
      'Tools',
      formatCurrency(5),
      formatCurrency(99),
      '1,234',
    ])
  })

  it('navigates to view page on row select', () => {
    renderList()
    fireEvent.click(screen.getByText('Widget'))
    expect(mockNavigate).toHaveBeenCalledWith('/inventory/products/widget/view')
  })

  it('row action menu offers View/Edit/Set-Inactive but no Delete', () => {
    renderList()
    fireEvent.click(screen.getByLabelText('row actions'))
    expect(screen.getByText('View Product')).toBeInTheDocument()
    expect(screen.getByText('Edit Product')).toBeInTheDocument()
    expect(screen.getByText('Set as Inactive')).toBeInTheDocument()
    expect(screen.queryByText(/delete/i)).not.toBeInTheDocument()
  })

  it('renders the empty state when there are no products', () => {
    renderList({ products: [], total: 0 })
    expect(screen.getByText(/no products found/i)).toBeInTheDocument()
  })
})
