import { configureStore } from '@reduxjs/toolkit'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/store/api/inventoryApi', async () => {
  const actual = await vi.importActual<typeof import('@/store/api/inventoryApi')>('@/store/api/inventoryApi')
  return {
    ...actual,
    useGetProductsQuery: () => ({
      data: { data: [], meta: { total: 0 } },
      isLoading: false,
      isFetching: false,
      error: undefined,
    }),
    useUpdateProductMutation: () => [vi.fn(), {}],
  }
})

import { NotificationProvider } from '@/hooks/useNotification'
import { inventoryApiSlice } from '@/store/api/inventoryApi'
import { settingsApiSlice } from '@/store/api/settingsApi'

import ProductsPage from '../ProductsPage'

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

describe('ProductsPage', () => {
  it('renders the page header and Import link', () => {
    renderPage()
    expect(screen.getByText('Products')).toBeInTheDocument()
    expect(screen.getByText('Import')).toBeInTheDocument()
  })
})
