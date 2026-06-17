import { configureStore } from '@reduxjs/toolkit'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Product } from '@/types'

const { getProductsSpy } = vi.hoisted(() => ({ getProductsSpy: vi.fn() }))

// Per-test knobs.
let productsData: Partial<Product>[] = []
let appliedStockStatus: 'in_stock' | 'low_stock' | 'out_of_stock' | null = null

vi.mock('@/store/api/inventoryApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/inventoryApi')>()
  return {
    ...actual,
    useGetProductsQuery: (params: unknown) => {
      getProductsSpy(params)
      return {
        data: { data: productsData, meta: { total: productsData.length } },
        isLoading: false,
        isFetching: false,
        error: undefined,
      }
    },
    useUpdateProductMutation: () => [vi.fn(), {}],
  }
})

vi.mock('@/store/api/settingsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/settingsApi')>()
  return {
    ...actual,
    useGetRegionalSettingsQuery: () => ({ data: { lowStockThreshold: 10 } }),
  }
})

// Mock the filter bar so we can drive appliedFilters deterministically.
vi.mock('@/hooks/useFilterBar', () => ({
  useFilterBar: () => ({
    appliedFilters: {
      search: '',
      status: null,
      categoryId: null,
      stockStatus: appliedStockStatus,
    },
    draftFilters: { search: '', status: null, categoryId: null, stockStatus: appliedStockStatus },
    handlers: {},
    hasActiveFilters: appliedStockStatus != null,
  }),
}))

import { NotificationProvider } from '@/hooks/useNotification'
import { inventoryApiSlice } from '@/store/api/inventoryApi'
import { settingsApiSlice } from '@/store/api/settingsApi'

import ProductsPage from '../ProductsPage'

function product(overrides: Partial<Product>): Partial<Product> {
  return {
    id: overrides.id ?? 'p',
    slug: overrides.slug ?? 'p',
    name: overrides.name ?? 'Product',
    barcode: 'B',
    type: 'Stocked Product',
    baseCost: 5,
    stockQuantity: 50,
    isActive: true,
    isOutOfStock: false,
    priceListItems: [],
    ...overrides,
  }
}

function renderPage() {
  const store = configureStore({
    reducer: {
      [inventoryApiSlice.reducerPath]: inventoryApiSlice.reducer,
      [settingsApiSlice.reducerPath]: settingsApiSlice.reducer,
    },
    middleware: (gdm) => gdm().concat(inventoryApiSlice.middleware, settingsApiSlice.middleware),
  })
  return render(
    <Provider store={store}>
      <NotificationProvider>
        <MemoryRouter>
          <ProductsPage />
        </MemoryRouter>
      </NotificationProvider>
    </Provider>,
  )
}

afterEach(() => {
  vi.clearAllMocks()
  productsData = []
  appliedStockStatus = null
})

describe('ProductsPage', () => {
  it('renders the page header and Import link', () => {
    renderPage()
    expect(screen.getByText('Products')).toBeInTheDocument()
    expect(screen.getByText('Import')).toBeInTheDocument()
  })

  it('sends isActive: undefined when the status filter is All', () => {
    renderPage()
    // Status filter defaults to All -> must send isActive key as undefined so the
    // endpoint default (isActive: true) is overridden and inactive products show.
    expect(getProductsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: undefined }),
    )
  })

  it('filters the full fetched set to low-stock rows when Low Stock is selected', () => {
    appliedStockStatus = 'low_stock'
    productsData = [
      product({ id: '1', slug: 'low', name: 'LowStockItem', stockQuantity: 3 }),
      product({ id: '2', slug: 'ok', name: 'HealthyItem', stockQuantity: 50 }),
      product({ id: '3', slug: 'zero', name: 'OutItem', stockQuantity: 0 }),
    ]
    renderPage()
    // threshold 10: only stockQuantity 3 is low_stock (0 is out_of_stock, 50 is in_stock)
    expect(screen.getByText('LowStockItem')).toBeInTheDocument()
    expect(screen.queryByText('HealthyItem')).not.toBeInTheDocument()
    expect(screen.queryByText('OutItem')).not.toBeInTheDocument()
    // Low Stock has no server predicate — must not be sent to the backend.
    expect(getProductsSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ lowStock: expect.anything() }),
    )
  })
})
