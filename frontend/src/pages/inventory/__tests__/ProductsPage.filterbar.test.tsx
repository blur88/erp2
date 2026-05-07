import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ProductsPage from '../ProductsPage'
import inventoryReducer from '@/store/slices/inventorySlice'

const { useGetProductsQuery, useGetCategoriesQuery } = vi.hoisted(() => ({
  useGetProductsQuery: vi.fn(() => ({
    data: { data: [], meta: { total: 0 } },
    isFetching: false,
    refetch: vi.fn(),
  })),
  useGetCategoriesQuery: vi.fn(() => ({ data: [] })),
}))

vi.mock('@/store/api/inventoryApi', () => ({
  useGetProductsQuery,
  useGetCategoriesQuery,
  useDeleteProductMutation: vi.fn(() => [vi.fn()]),
}))

vi.mock('@mui/material', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mui/material')>()
  return {
    ...actual,
    useMediaQuery: vi.fn(() => false),
  }
})

vi.mock('../components/ProductList', () => ({ default: () => <div>ProductList</div> }))
vi.mock('../components/ProductContextHeader', () => ({ default: () => <div>ProductContextHeader</div> }))
vi.mock('../components/ProductWorkspaceCard', () => ({ default: () => <div>ProductWorkspaceCard</div> }))
vi.mock('../components/ProductsDialogs', () => ({ default: () => <div>ProductsDialogs</div> }))
vi.mock('../hooks/productsActions', () => ({
  useProductsActions: () => ({
    handleAddProduct: vi.fn(),
    handleEditProduct: vi.fn(),
    handleDeleteProduct: vi.fn(),
    handleConfirmDelete: vi.fn(),
    handleCancelDelete: vi.fn(),
    handleExportClick: vi.fn(),
    handleExportClose: vi.fn(),
    handleExport: vi.fn(),
  }),
}))
vi.mock('../hooks/productsSelection', () => ({
  useProductsSelection: () => ({
    handleProductSelect: vi.fn(),
    handleNavigateUp: vi.fn(),
    handleNavigateDown: vi.fn(),
    handleNavigateToFirst: vi.fn(),
    handleNavigateToLast: vi.fn(),
    handlePageUpNavigation: vi.fn(),
    handlePageDownNavigation: vi.fn(),
    handleEnterAction: vi.fn(),
    handleEscapeAction: vi.fn(),
  }),
}))
vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

function renderPage(initialUrl = '/') {
  const store = configureStore({
    reducer: {
      inventory: inventoryReducer,
    },
  })

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <ProductsPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('ProductsPage FilterBar integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useGetProductsQuery.mockReturnValue({
      data: { data: [], meta: { total: 0 } },
      isFetching: false,
      refetch: vi.fn(),
    })
    useGetCategoriesQuery.mockReturnValue({ data: [] })
  })

  it('renders the shared filter search input', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/search by name, barcode, or brand/i)).toBeInTheDocument()
  })

  it('restores search from URL into the products query', () => {
    renderPage('/?search=gundam')
    expect(useGetProductsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'gundam' }),
    )
  })

  it('restores categoryId from URL into the products query', () => {
    renderPage('/?categoryId=cat-uuid-123')
    expect(useGetProductsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ categoryId: 'cat-uuid-123' }),
    )
  })

  it('restores type from URL into the products query', () => {
    renderPage('/?type=goods')
    expect(useGetProductsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'Stocked Product' }),
    )
  })

  it('maps stockStatus=low_stock to lowStock=true in the products query', () => {
    renderPage('/?stockStatus=low_stock')
    expect(useGetProductsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ lowStock: true }),
    )
  })

  it('maps stockStatus=out_of_stock to outOfStock=true in the products query', () => {
    renderPage('/?stockStatus=out_of_stock')
    expect(useGetProductsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ outOfStock: true }),
    )
  })

  it('does not pass lowStock or outOfStock when stockStatus is not set', () => {
    renderPage('/')
    const lastCall = useGetProductsQuery.mock.calls.at(-1)?.[0] ?? {}

    expect(lastCall).not.toHaveProperty('lowStock')
    expect(lastCall).not.toHaveProperty('outOfStock')
  })

  it('renders the three inventory quick filters', () => {
    useGetCategoriesQuery.mockReturnValue({
      data: [{ id: 'cat-1', name: 'Electronics' }],
    })

    renderPage('/')

    expect(screen.getByLabelText('Category')).toBeInTheDocument()
    expect(screen.getByLabelText('Product Type')).toBeInTheDocument()
    expect(screen.getByLabelText('Stock Status')).toBeInTheDocument()
    expect(useGetCategoriesQuery).toHaveBeenCalledWith({})
  })

  it('does not pass the legacy isActive query flag', () => {
    renderPage('/')
    expect(useGetProductsQuery).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ isActive: expect.anything() }),
    )
  })
})
