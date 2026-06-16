import { configureStore } from '@reduxjs/toolkit'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const { mockNavigate, mockUpdateProduct, mockFetchProductBySlug } =
  vi.hoisted(() => ({
    mockNavigate: vi.fn(),
    mockUpdateProduct: vi.fn(() => ({ unwrap: () => Promise.resolve({ id: 'p1' }) })),
    mockFetchProductBySlug: vi.fn(() => ({
      unwrap: () => Promise.resolve({
        id: 'p1', slug: 'widget', name: 'Widget', type: 'Stocked Product',
        categoryId: 'c1', baseCost: 10, stockQuantity: 5, isActive: true, priceListItems: [],
      }),
    })),
  }))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/store/api/inventoryApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/inventoryApi')>()
  return {
    ...actual,
    useLazyGetProductBySlugQuery: () => [mockFetchProductBySlug, { isFetching: false }],
    useUpdateProductMutation: () => [mockUpdateProduct, { isLoading: false }],
    useCreateProductMutation: () => [vi.fn(), { isLoading: false }],
  }
})

vi.mock('@/hooks/useNotification', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useNotification')>()
  return {
    ...actual,
    useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
  }
})

vi.mock('@/hooks/useUnsavedChangesGuard', () => ({
  useUnsavedChangesGuard: () => ({ UnsavedChangesDialog: null }),
}))

vi.mock('@/store/api/priceListApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/priceListApi')>()
  return {
    ...actual,
    useGetPriceListsQuery: () => ({ data: { data: [] }, isLoading: false }),
    useBulkUpdatePricesMutation: () => [vi.fn(), {}],
  }
})

import { NotificationProvider } from '@/hooks/useNotification'
import { inventoryApiSlice } from '@/store/api/inventoryApi'
import { settingsApiSlice } from '@/store/api/settingsApi'

import CreateProductPage from '../CreateProductPage'

function renderEdit() {
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
        <MemoryRouter initialEntries={['/inventory/products/widget/edit']}>
          <Routes>
            <Route path="/inventory/products/:slug/edit" element={<CreateProductPage />} />
          </Routes>
        </MemoryRouter>
      </NotificationProvider>
    </Provider>,
  )
}

describe('CreateProductPage type change', () => {
  it('confirms before changing type from Stocked Product to Service in edit mode', async () => {
    const user = userEvent.setup()
    renderEdit()

    await waitFor(() => expect(screen.getByDisplayValue('Widget')).toBeInTheDocument())

    const typeSelect = screen.getByLabelText(/Product Type/i)
    await user.click(typeSelect)
    await user.click(await screen.findByRole('option', { name: 'Service' }))

    expect(await screen.findByText(/stop stock tracking/i)).toBeInTheDocument()
  })
})
