import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Product } from '@/types'

vi.mock('@/store/api/settingsApi', () => ({
  useGetRegionalSettingsQuery: () => ({ data: { lowStockThreshold: 10 } }),
}))

import ProductOverviewTab from '../ProductOverviewTab'

const product = {
  id: 'p1',
  slug: 'widget',
  name: 'Widget',
  barcode: 'B1',
  type: 'Stocked Product',
  category: { id: 'c1', name: 'Tools' },
  description: 'A widget',
  baseCost: 50,
  stockQuantity: 5,
  isActive: true,
  isOutOfStock: false,
  notes: 'handle with care',
  priceListItems: [
    { priceListId: 'pl1', price: 100, priceList: { id: 'pl1', name: 'Retail', isDefault: true } },
  ],
} as unknown as Product

describe('ProductOverviewTab', () => {
  it('shows "not tracked" for service products instead of stock status', () => {
    render(<ProductOverviewTab product={{ ...product, type: 'Service', stockQuantity: 0 } as Product} />)
    expect(screen.getByText('Stock not tracked for services')).toBeInTheDocument()
    expect(screen.queryByText('Out of Stock')).not.toBeInTheDocument()
    expect(screen.queryByText('Stock Qty')).not.toBeInTheDocument()
  })

  it('renders basic info and a margin chip for the price list', () => {
    render(<ProductOverviewTab product={product} />)
    expect(screen.getByText('B1')).toBeInTheDocument()
    expect(screen.getByText('Tools')).toBeInTheDocument()
    expect(screen.getByText('50.0%')).toBeInTheDocument()
  })

  it('shows a Low Stock chip when qty is at/below threshold', () => {
    render(<ProductOverviewTab product={{ ...product, stockQuantity: 3 } as Product} />)
    expect(screen.getByText('Low Stock')).toBeInTheDocument()
  })

  it('renders additional price lists ordered by priority', () => {
    const multiPrice = {
      ...product,
      priceListItems: [
        { priceListId: 'b', price: 80, priceList: { id: 'b', name: 'Wholesale', priority: 2 } },
        { priceListId: 'a', price: 100, priceList: { id: 'a', name: 'Retail', priority: 1 } },
      ],
    } as unknown as Product
    render(<ProductOverviewTab product={multiPrice} />)
    const names = screen.getAllByText(/Retail|Wholesale/).map((n) => n.textContent)
    expect(names).toEqual(['Retail', 'Wholesale']) // priority 1 before priority 2
  })
})
