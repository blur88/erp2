import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

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

  it('navigates to view page on row select', () => {
    renderList()
    fireEvent.click(screen.getByText('Widget'))
    expect(mockNavigate).toHaveBeenCalledWith('/inventory/products/widget/view')
  })
})
