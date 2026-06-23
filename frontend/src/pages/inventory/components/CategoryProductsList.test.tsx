import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import CategoryProductsList from './CategoryProductsList'

const mockUseGetCategoryProductsQuery = vi.hoisted(() => vi.fn())
const mockUseGetRegionalSettingsQuery = vi.hoisted(() => vi.fn())

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => vi.fn(),
}))

vi.mock('@/store/api/inventoryApi', () => ({
  useGetCategoryProductsQuery: mockUseGetCategoryProductsQuery,
}))

vi.mock('@/store/api/settingsApi', () => ({
  useGetRegionalSettingsQuery: mockUseGetRegionalSettingsQuery,
}))

const makeProduct = (overrides: Partial<{
  id: string
  name: string
  stockQuantity: number
}> = {}) => ({
  id: 'prod-1',
  name: 'Widget',
  stockQuantity: 50,
  ...overrides,
})

const renderList = () =>
  render(
    <MemoryRouter>
      <CategoryProductsList categoryId="cat-1" />
    </MemoryRouter>,
  )

describe('CategoryProductsList', () => {
  beforeEach(() => {
    mockUseGetCategoryProductsQuery.mockReset()
    mockUseGetRegionalSettingsQuery.mockReset()
    mockUseGetRegionalSettingsQuery.mockReturnValue({ data: { lowStockThreshold: 10 } })
  })

  it('shows error message when fetch fails', () => {
    mockUseGetCategoryProductsQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    renderList()
    expect(screen.getByText('Failed to load products.')).toBeInTheDocument()
  })

  it('shows the category-specific empty state when category has no products', () => {
    mockUseGetCategoryProductsQuery.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false })
    renderList()
    expect(screen.getByText('No products in this category.')).toBeInTheDocument()
  })

  it('renders product name and stock', () => {
    mockUseGetCategoryProductsQuery.mockReturnValue({
      data: { data: [makeProduct({ name: 'Widget', stockQuantity: 5 })] },
      isLoading: false,
      isError: false,
    })
    renderList()
    expect(screen.getByText('Widget')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('does not render a barcode column', () => {
    mockUseGetCategoryProductsQuery.mockReturnValue({
      data: { data: [makeProduct()] },
      isLoading: false,
      isError: false,
    })
    renderList()
    expect(screen.queryByText('Barcode')).not.toBeInTheDocument()
  })

  it('shows In Stock chip when stock is above threshold', () => {
    mockUseGetCategoryProductsQuery.mockReturnValue({
      data: { data: [makeProduct({ stockQuantity: 11 })] },
      isLoading: false,
      isError: false,
    })
    renderList()
    expect(screen.getByText('In Stock')).toBeInTheDocument()
  })

  it('shows Low Stock chip when stock is at or below threshold', () => {
    mockUseGetCategoryProductsQuery.mockReturnValue({
      data: { data: [makeProduct({ stockQuantity: 10 })] },
      isLoading: false,
      isError: false,
    })
    renderList()
    expect(screen.getByText('Low Stock')).toBeInTheDocument()
  })

  it('shows Out of Stock chip when stock is zero', () => {
    mockUseGetCategoryProductsQuery.mockReturnValue({
      data: { data: [makeProduct({ stockQuantity: 0 })] },
      isLoading: false,
      isError: false,
    })
    renderList()
    expect(screen.getByText('Out of Stock')).toBeInTheDocument()
  })

  it('uses lowStockThreshold from regional settings, not the hardcoded fallback', () => {
    mockUseGetRegionalSettingsQuery.mockReturnValue({ data: { lowStockThreshold: 25 } })
    mockUseGetCategoryProductsQuery.mockReturnValue({
      data: { data: [makeProduct({ stockQuantity: 20 })] },
      isLoading: false,
      isError: false,
    })
    renderList()
    expect(screen.getByText('Low Stock')).toBeInTheDocument()
  })
})
