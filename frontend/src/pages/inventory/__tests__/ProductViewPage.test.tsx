import { configureStore } from '@reduxjs/toolkit'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { BrowserRouter, MemoryRouter, Route, Routes, useLocation  } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi  } from 'vitest'

vi.mock('@/store/api/inventoryApi', async () => {
  const actual = await vi.importActual<typeof import('@/store/api/inventoryApi')>('@/store/api/inventoryApi')
  return {
    ...actual,
    useGetProductBySlugQuery: () => ({
      data: {
        id: 'p1', slug: 'widget', name: 'Widget', barcode: 'B1', type: 'Stocked Product',
        baseCost: 50, stockQuantity: 5, isActive: true, isOutOfStock: false, priceListItems: [],
      },
      isLoading: false,
      isError: false,
    }),
  }
})

import { inventoryApiSlice } from '@/store/api/inventoryApi'
import { settingsApiSlice } from '@/store/api/settingsApi'

import ProductViewPage from '../ProductViewPage'

function renderPage(search = '') {
  const store = configureStore({
    reducer: {
      [inventoryApiSlice.reducerPath]: inventoryApiSlice.reducer,
      [settingsApiSlice.reducerPath]: settingsApiSlice.reducer,
    },
    middleware: (gdm) => gdm().concat(inventoryApiSlice.middleware, settingsApiSlice.middleware),
  })
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/inventory/products/widget/view${search}`]}>
        <Routes>
          <Route path="/inventory/products/:slug/view" element={<ProductViewPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

describe('ProductViewPage', () => {
  // jsdom persists window.location across cases; BrowserRouter tests below
  // read it, so reset between tests (#1131 review).
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('renders product name and tabs', () => {
    renderPage()
    expect(screen.getByText('Widget')).toBeInTheDocument()
    expect(screen.getByText('Overview')).toBeInTheDocument()
    expect(screen.getByText('Stock Movements')).toBeInTheDocument()
    expect(screen.getByText('Order History')).toBeInTheDocument()
  })

  it('preserves other query params when the tab changes', async () => {
    function LocationProbe() {
      const location = useLocation()
      return <span data-testid="probe-search">{location.search}</span>
    }

    const store = configureStore({
      reducer: {
        [inventoryApiSlice.reducerPath]: inventoryApiSlice.reducer,
        [settingsApiSlice.reducerPath]: settingsApiSlice.reducer,
      },
      middleware: (gdm) => gdm().concat(inventoryApiSlice.middleware, settingsApiSlice.middleware),
    })
    window.history.replaceState(null, '', '/inventory/products/widget/view?tab=0&probe=keepme')
    render(
      <Provider store={store}>
        <BrowserRouter>
          <Routes>
            <Route path="/inventory/products/:slug/view" element={<ProductViewPage />} />
          </Routes>
          <LocationProbe />
        </BrowserRouter>
      </Provider>,
    )

    const user = userEvent.setup()
    const tabs = await screen.findAllByRole('tab')
    await user.click(tabs[1])

    const search = screen.getByTestId('probe-search').textContent ?? ''
    expect(new URLSearchParams(search).get('probe')).toBe('keepme')
    expect(new URLSearchParams(search).get('tab')).toBe('1')
  })

  it('returns to the list with the ticket decoded', async () => {
    function LocationProbe() {
      const location = useLocation()
      return <span data-testid="back-search">{location.pathname}{location.search}</span>
    }

    const store = configureStore({
      reducer: {
        [inventoryApiSlice.reducerPath]: inventoryApiSlice.reducer,
        [settingsApiSlice.reducerPath]: settingsApiSlice.reducer,
      },
      middleware: (gdm) => gdm().concat(inventoryApiSlice.middleware, settingsApiSlice.middleware),
    })
    window.history.replaceState(null, '', '/inventory/products/widget/view?listQuery=page%3D2')
    render(
      <Provider store={store}>
        <BrowserRouter>
          <Routes>
            <Route path="/inventory/products/:slug/view" element={<ProductViewPage />} />
          </Routes>
          <LocationProbe />
        </BrowserRouter>
      </Provider>,
    )

    const user = userEvent.setup()
    await user.click(screen.getByTestId('ArrowBackIcon').closest('button')!)

    expect(screen.getByTestId('back-search').textContent).toBe('/inventory/products?page=2')
  })

  it('returns to the bare list when there is no ticket', async () => {
    function LocationProbe() {
      const location = useLocation()
      return <span data-testid="back-search">{location.pathname}{location.search}</span>
    }

    const store = configureStore({
      reducer: {
        [inventoryApiSlice.reducerPath]: inventoryApiSlice.reducer,
        [settingsApiSlice.reducerPath]: settingsApiSlice.reducer,
      },
      middleware: (gdm) => gdm().concat(inventoryApiSlice.middleware, settingsApiSlice.middleware),
    })
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/inventory/products/widget/view']}>
          <Routes>
            <Route path="/inventory/products/:slug/view" element={<ProductViewPage />} />
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </Provider>,
    )

    const user = userEvent.setup()
    await user.click(screen.getByTestId('ArrowBackIcon').closest('button')!)

    expect(screen.getByTestId('back-search').textContent).toBe('/inventory/products')
  })
})
