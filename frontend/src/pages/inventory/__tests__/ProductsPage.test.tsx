import { configureStore } from '@reduxjs/toolkit'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

const { navigateSpy } = vi.hoisted(() => ({ navigateSpy: vi.fn() }))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => navigateSpy,
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
  it('renders the page header and Import action', () => {
    renderPage()
    expect(screen.getByText('Products')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument()
  })

  it('renders Import before New Product (grouped header actions)', () => {
    renderPage()
    const importButton = screen.getByRole('button', { name: 'Import' })
    const newProductButton = screen.getByRole('button', { name: 'New Product' })
    // Grouped: both live in one header action container. Anchor on Import's
    // parent and assert it contains New Product, rather than identical
    // parentElement. This survives a future wrapper around New Product (e.g. a
    // tooltip span) while still proving grouping; a wrapper around Import itself
    // would still need this anchor revisited.
    const container = importButton.parentElement
    expect(container).not.toBeNull()
    expect(container?.contains(newProductButton)).toBe(true)
    // And Import comes BEFORE New Product in DOM order.
    expect(
      importButton.compareDocumentPosition(newProductButton)
        & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('opens the import dialog when Import is clicked', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Import' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('navigates to create page when New Product is clicked', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'New Product' }))
    expect(navigateSpy).toHaveBeenCalledWith('/inventory/products/create')
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
      product({ id: '2', slug: 'edge-low', name: 'AtThresholdItem', stockQuantity: 10 }),
      product({ id: '3', slug: 'edge-in', name: 'JustAboveItem', stockQuantity: 11 }),
      product({ id: '4', slug: 'ok', name: 'HealthyItem', stockQuantity: 50 }),
      product({ id: '5', slug: 'zero', name: 'OutItem', stockQuantity: 0 }),
    ]
    renderPage()
    // threshold 10: qty in (0, 10] is low; qty 0 is out; qty > 10 is in.
    expect(screen.getByText('LowStockItem')).toBeInTheDocument()
    expect(screen.getByText('AtThresholdItem')).toBeInTheDocument() // boundary: qty===10 is low
    expect(screen.queryByText('JustAboveItem')).not.toBeInTheDocument() // boundary: qty===11 is in
    expect(screen.queryByText('HealthyItem')).not.toBeInTheDocument()
    expect(screen.queryByText('OutItem')).not.toBeInTheDocument()
    // Low Stock has no server predicate — the page must not send a server stock filter.
    expect(getProductsSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ outOfStock: expect.anything() }),
    )
    expect(getProductsSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ minStock: expect.anything() }),
    )
  })
})
