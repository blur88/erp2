import { configureStore } from '@reduxjs/toolkit'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

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
      <MemoryRouter initialEntries={['/inventory/products/widget/view']}>
        <Routes>
          <Route path="/inventory/products/:slug/view" element={<ProductViewPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

describe('ProductViewPage', () => {
  it('renders product name and tabs', () => {
    renderPage()
    expect(screen.getByText('Widget')).toBeInTheDocument()
    expect(screen.getByText('Overview')).toBeInTheDocument()
    expect(screen.getByText('Stock Movements')).toBeInTheDocument()
    expect(screen.getByText('Order History')).toBeInTheDocument()
  })
})
