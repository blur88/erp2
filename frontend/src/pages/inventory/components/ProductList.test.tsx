import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import ProductList from './ProductList'

import type { Product } from '@/types'

const makeProduct = (id: string, name: string): Product =>
  (({
    id,
    name,
    barcode: `SKU-${id}`,
    type: 'Stocked Product',
    baseCost: 10,
    stockQuantity: 2,
    isActive: true,
    isOutOfStock: false,
    createdAt: new Date('2026-03-10T00:00:00.000Z'),
    updatedAt: new Date('2026-03-10T00:00:00.000Z'),
  }) as Product)

describe('ProductList', () => {
  it('shows the visible product count', () => {
    render(
      <ProductList
        products={[makeProduct('1', 'Alpha'), makeProduct('2', 'Beta')]}
        loading={false}
        focusedIndex={0}
        productListRef={{ current: null }}
        onSelect={vi.fn()}
      />,
    )

    expect(screen.getByText('Products (2)')).toBeInTheDocument()
  })

  it('shows skeleton rows when loading with no products', () => {
    render(
      <ProductList
        products={[]}
        loading={true}
        focusedIndex={-1}
        productListRef={{ current: null }}
        onSelect={vi.fn()}
      />,
    )

    expect(screen.queryByText(/no products/i)).not.toBeInTheDocument()
  })

  it('shows empty state when not loading and no products', () => {
    render(
      <ProductList
        products={[]}
        loading={false}
        focusedIndex={-1}
        productListRef={{ current: null }}
        onSelect={vi.fn()}
      />,
    )

    expect(screen.getByText(/no products found/i)).toBeInTheDocument()
  })
})
