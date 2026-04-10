import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import ProductsTable from './ProductsTable'

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
    updatedAt: new Date('2026-03-10T00:00:00.000Z')
  }) as Product)

describe('ProductsTable', () => {
  it('shows the visible product count from the list instead of external pagination metadata', () => {
    render(
      <ProductsTable
        products={[makeProduct('1', 'Alpha'), makeProduct('2', 'Beta')]}
        loading={false}
        focusedProductIndex={0}
        productListRef={{ current: null }}
        onFocus={vi.fn()}
        onProductSelect={vi.fn()}
      />,
    )

    expect(screen.getByText('Product List (2)')).toBeInTheDocument()
  })
})
