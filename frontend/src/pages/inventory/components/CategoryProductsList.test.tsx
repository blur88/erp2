import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import CategoryProductsList from './CategoryProductsList'

const mockUseGetProductsQuery = vi.hoisted(() => vi.fn())
const mockUseGetRegionalSettingsQuery = vi.hoisted(() => vi.fn())

vi.mock('@/store/api/inventoryApi', () => ({
  useGetProductsQuery: mockUseGetProductsQuery,
}))

vi.mock('@/store/api/settingsApi', () => ({
  useGetRegionalSettingsQuery: mockUseGetRegionalSettingsQuery,
}))

const makeProduct = (overrides: Partial<{
  id: string
  name: string
  barcode: string | null
  stockQuantity: number
}> = {}) => ({
  id: 'prod-1',
  name: 'Widget',
  barcode: 'WGT-001',
  stockQuantity: 50,
  ...overrides,
})

describe('CategoryProductsList', () => {
  beforeEach(() => {
    mockUseGetProductsQuery.mockReset()
    mockUseGetRegionalSettingsQuery.mockReset()
    mockUseGetRegionalSettingsQuery.mockReturnValue({ data: { lowStockThreshold: 10 } })
  })

  it('shows a loading spinner while fetching', () => {
    mockUseGetProductsQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false })

    render(<CategoryProductsList categoryId="cat-1" />)

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('shows error message when fetch fails', () => {
    mockUseGetProductsQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true })

    render(<CategoryProductsList categoryId="cat-1" />)

    expect(screen.getByText('Failed to load products.')).toBeInTheDocument()
  })

  it('shows empty state when category has no products', () => {
    mockUseGetProductsQuery.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false })

    render(<CategoryProductsList categoryId="cat-1" />)

    expect(screen.getByText('No products in this category.')).toBeInTheDocument()
  })

  it('renders product name and barcode', () => {
    mockUseGetProductsQuery.mockReturnValue({
      data: { data: [makeProduct({ name: 'Widget', barcode: 'WGT-001' })] },
      isLoading: false,
      isError: false,
    })

    render(<CategoryProductsList categoryId="cat-1" />)

    expect(screen.getByText('Widget')).toBeInTheDocument()
    expect(screen.getByText('WGT-001')).toBeInTheDocument()
  })

  it('shows em dash when product has no barcode', () => {
    mockUseGetProductsQuery.mockReturnValue({
      data: { data: [makeProduct({ barcode: null })] },
      isLoading: false,
      isError: false,
    })

    render(<CategoryProductsList categoryId="cat-1" />)

    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('shows In Stock chip when stock is above threshold', () => {
    mockUseGetRegionalSettingsQuery.mockReturnValue({ data: { lowStockThreshold: 10 } })
    mockUseGetProductsQuery.mockReturnValue({
      data: { data: [makeProduct({ stockQuantity: 11 })] },
      isLoading: false,
      isError: false,
    })

    render(<CategoryProductsList categoryId="cat-1" />)

    expect(screen.getByText('In Stock')).toBeInTheDocument()
  })

  it('shows Low Stock chip when stock is at or below threshold', () => {
    mockUseGetRegionalSettingsQuery.mockReturnValue({ data: { lowStockThreshold: 10 } })
    mockUseGetProductsQuery.mockReturnValue({
      data: { data: [makeProduct({ stockQuantity: 10 })] },
      isLoading: false,
      isError: false,
    })

    render(<CategoryProductsList categoryId="cat-1" />)

    expect(screen.getByText('Low Stock')).toBeInTheDocument()
  })

  it('shows Out of Stock chip when stock is zero', () => {
    mockUseGetProductsQuery.mockReturnValue({
      data: { data: [makeProduct({ stockQuantity: 0 })] },
      isLoading: false,
      isError: false,
    })

    render(<CategoryProductsList categoryId="cat-1" />)

    expect(screen.getByText('Out of Stock')).toBeInTheDocument()
  })

  it('uses lowStockThreshold from regional settings, not the hardcoded fallback', () => {
    mockUseGetRegionalSettingsQuery.mockReturnValue({ data: { lowStockThreshold: 25 } })
    mockUseGetProductsQuery.mockReturnValue({
      data: { data: [makeProduct({ stockQuantity: 20 })] },
      isLoading: false,
      isError: false,
    })

    render(<CategoryProductsList categoryId="cat-1" />)

    // 20 <= 25 threshold → Low Stock (not In Stock, which the hardcoded fallback of 10 would give)
    expect(screen.getByText('Low Stock')).toBeInTheDocument()
  })
})
