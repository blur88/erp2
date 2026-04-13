import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CategoryWorkspaceCard from './CategoryWorkspaceCard'

import type { Category } from '@/types'

const mockUseGetProductsQuery = vi.hoisted(() => vi.fn())
const mockUseGetRegionalSettingsQuery = vi.hoisted(() => vi.fn())

vi.mock('@/store/api/inventoryApi', () => ({
  useGetProductsQuery: mockUseGetProductsQuery,
}))

vi.mock('@/store/api/settingsApi', () => ({
  useGetRegionalSettingsQuery: mockUseGetRegionalSettingsQuery,
}))

const makeCategory = (overrides: Partial<Category> = {}): Category => ({
  id: 'cat-1',
  name: 'Hardware',
  level: 0,
  parentId: null,
  fullPath: 'Hardware',
  isRoot: true,
  hasChildren: false,
  isActive: true,
  productCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

const makeProduct = (overrides: Partial<{ id: string; name: string; stockQuantity: number }> = {}) => ({
  id: 'prod-1',
  name: 'Widget',
  stockQuantity: 12,
  ...overrides,
})

describe('CategoryWorkspaceCard', () => {
  beforeEach(() => {
    mockUseGetProductsQuery.mockReset()
    mockUseGetRegionalSettingsQuery.mockReset()
    mockUseGetRegionalSettingsQuery.mockReturnValue({ data: { lowStockThreshold: 10 } })
  })

  it('renders a products table and notes section instead of tab panels', () => {
    mockUseGetProductsQuery.mockReturnValue({
      data: { data: [makeProduct({ name: 'Widget', stockQuantity: 3 })] },
      isLoading: false,
      isError: false,
    })

    render(<CategoryWorkspaceCard selectedCategory={makeCategory({ description: 'Shelf A' })} />)

    expect(screen.getByText('Category Products')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Stock' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument()
    expect(screen.getByText('Low Stock')).toBeInTheDocument()
    expect(screen.getByText('Notes')).toBeInTheDocument()
    expect(screen.getByText('Shelf A')).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.queryByText('Full Path')).not.toBeInTheDocument()
  })

  it('skips the products query when no category is selected', () => {
    mockUseGetProductsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    })

    render(<CategoryWorkspaceCard selectedCategory={null} />)

    expect(mockUseGetProductsQuery).toHaveBeenCalledWith({ categoryId: '' }, { skip: true })
    expect(screen.queryByText('Category Products')).not.toBeInTheDocument()
  })
})
