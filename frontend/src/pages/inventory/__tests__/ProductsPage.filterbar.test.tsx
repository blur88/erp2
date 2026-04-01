import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ProductsPage } from '../ProductsPage'
import inventoryReducer from '@/store/slices/inventorySlice'

const { useGetProductsQuery } = vi.hoisted(() => ({
  useGetProductsQuery: vi.fn(() => ({
    data: { data: [], meta: { total: 0 } },
    isFetching: false,
    refetch: vi.fn(),
  })),
}))

vi.mock('@/store/api/inventoryApi', () => ({
  useGetProductsQuery,
  useDeleteProductMutation: vi.fn(() => [vi.fn()]),
}))

vi.mock('../components/ProductsTable', () => ({ default: () => <div>ProductsTable</div> }))
vi.mock('../components/ProductDetailsPanel', () => ({ default: () => <div>ProductDetailsPanel</div> }))
vi.mock('../components/ProductsDialogs', () => ({ default: () => <div>ProductsDialogs</div> }))
vi.mock('../hooks/useProductsActions', () => ({
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
vi.mock('../hooks/useProductsSelection', () => ({
  useProductsSelection: () => ({
    handleProductSelect: vi.fn(),
    handleProductListFocus: vi.fn(),
    handleNavigateUp: vi.fn(),
    handleNavigateDown: vi.fn(),
    handleNavigateHome: vi.fn(),
    handleNavigateEnd: vi.fn(),
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
  })

  it('renders the shared filter search input', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/search by name, barcode, or brand/i)).toBeInTheDocument()
  })

  it('restores filters from URL into the products query', () => {
    renderPage('/?search=gundam&status=inactive')
    expect(useGetProductsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: 'gundam',
        isActive: false,
      }),
    )
  })
})
