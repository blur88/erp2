import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'

import CategoryProductsList from './CategoryProductsList'

const mockNavigate = vi.hoisted(() => vi.fn())
const mockUseGetProductsQuery = vi.hoisted(() => vi.fn())
const mockUseGetRegionalSettingsQuery = vi.hoisted(() => vi.fn())

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mockNavigate,
}))

vi.mock('@/store/api/inventoryApi', () => ({
  useGetProductsQuery: mockUseGetProductsQuery,
}))

vi.mock('@/store/api/settingsApi', () => ({
  useGetRegionalSettingsQuery: mockUseGetRegionalSettingsQuery,
}))

const makeProduct = (overrides: Partial<{
  id: string
  name: string
  slug: string
  barcode: string | null
  stockQuantity: number
}> = {}) => ({
  id: 'prod-1',
  name: 'Widget',
  slug: 'widget',
  barcode: 'WGT-001',
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
    mockNavigate.mockReset()
    mockUseGetProductsQuery.mockReset()
    mockUseGetRegionalSettingsQuery.mockReset()
    mockUseGetRegionalSettingsQuery.mockReturnValue({ data: { lowStockThreshold: 10 } })
  })

  it('shows error message when fetch fails', () => {
    mockUseGetProductsQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    renderList()
    expect(screen.getByText('Failed to load products.')).toBeInTheDocument()
  })

  it('shows the EntityTable empty state when category has no products', () => {
    mockUseGetProductsQuery.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false })
    renderList()
    expect(screen.getByText('No Products found')).toBeInTheDocument()
  })

  it('renders product name and barcode', () => {
    mockUseGetProductsQuery.mockReturnValue({
      data: { data: [makeProduct({ name: 'Widget', barcode: 'WGT-001' })] },
      isLoading: false,
      isError: false,
    })
    renderList()
    expect(screen.getByText('Widget')).toBeInTheDocument()
    expect(screen.getByText('WGT-001')).toBeInTheDocument()
  })

  it('shows em dash when product has no barcode', () => {
    mockUseGetProductsQuery.mockReturnValue({
      data: { data: [makeProduct({ barcode: null })] },
      isLoading: false,
      isError: false,
    })
    renderList()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('shows In Stock chip when stock is above threshold', () => {
    mockUseGetProductsQuery.mockReturnValue({
      data: { data: [makeProduct({ stockQuantity: 11 })] },
      isLoading: false,
      isError: false,
    })
    renderList()
    expect(screen.getByText('In Stock')).toBeInTheDocument()
  })

  it('shows Low Stock chip when stock is at or below threshold', () => {
    mockUseGetProductsQuery.mockReturnValue({
      data: { data: [makeProduct({ stockQuantity: 10 })] },
      isLoading: false,
      isError: false,
    })
    renderList()
    expect(screen.getByText('Low Stock')).toBeInTheDocument()
  })

  it('shows Out of Stock chip when stock is zero', () => {
    mockUseGetProductsQuery.mockReturnValue({
      data: { data: [makeProduct({ stockQuantity: 0 })] },
      isLoading: false,
      isError: false,
    })
    renderList()
    expect(screen.getByText('Out of Stock')).toBeInTheDocument()
  })

  it('uses lowStockThreshold from regional settings, not the hardcoded fallback', () => {
    mockUseGetRegionalSettingsQuery.mockReturnValue({ data: { lowStockThreshold: 25 } })
    mockUseGetProductsQuery.mockReturnValue({
      data: { data: [makeProduct({ stockQuantity: 20 })] },
      isLoading: false,
      isError: false,
    })
    renderList()
    expect(screen.getByText('Low Stock')).toBeInTheDocument()
  })

  it('navigates to the product view page on row click', async () => {
    const user = userEvent.setup()
    mockUseGetProductsQuery.mockReturnValue({
      data: { data: [makeProduct({ slug: 'widget' })] },
      isLoading: false,
      isError: false,
    })
    renderList()
    await user.click(screen.getByText('Widget'))
    expect(mockNavigate).toHaveBeenCalledWith('/inventory/products/widget/view')
  })
})
