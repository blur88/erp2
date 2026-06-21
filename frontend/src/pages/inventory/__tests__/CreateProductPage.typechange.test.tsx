import { configureStore } from '@reduxjs/toolkit'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const { mockNavigate, mockUpdateProduct, mockFetchProductBySlug, productState } =
  vi.hoisted(() => {
    const productState = { stockQuantity: 5, type: 'Stocked Product' as 'Stocked Product' | 'Service' }
    return {
      mockNavigate: vi.fn(),
      mockUpdateProduct: vi.fn(() => ({ unwrap: () => Promise.resolve({ id: 'p1' }) })),
      mockFetchProductBySlug: vi.fn(() => ({
        unwrap: () => Promise.resolve({
          id: 'p1', slug: 'widget', name: 'Widget', type: productState.type,
          categoryId: 'c1', baseCost: 10, stockQuantity: productState.stockQuantity,
          isActive: true, priceListItems: [],
        }),
      })),
      productState,
    }
  })

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
  it('blocks Stocked→Service when stock > 0 (no Confirm, type unchanged)', async () => {
    productState.stockQuantity = 5
    productState.type = 'Stocked Product'
    const user = userEvent.setup()
    renderEdit()

    await waitFor(() => expect(screen.getByDisplayValue('Widget')).toBeInTheDocument())

    const typeSelect = screen.getByLabelText(/Product Type/i)
    await user.click(typeSelect)
    await user.click(await screen.findByRole('option', { name: 'Service' }))

    expect(
      await screen.findByText(/Reduce stock to 0 via a Stock Adjustment before converting to a Service/i),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Confirm$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Close$/i })).toBeInTheDocument()

    // Close dialog, then verify type field unchanged
    await user.click(screen.getByRole('button', { name: /^Close$/i }))
    expect(screen.getByDisplayValue('Stocked Product')).toBeInTheDocument()
  })

  it('warns (with Confirm) on Stocked→Service when stock is 0', async () => {
    productState.stockQuantity = 0
    productState.type = 'Stocked Product'
    const user = userEvent.setup()
    renderEdit()

    await waitFor(() => expect(screen.getByDisplayValue('Widget')).toBeInTheDocument())

    const typeSelect = screen.getByLabelText(/Product Type/i)
    await user.click(typeSelect)
    await user.click(await screen.findByRole('option', { name: 'Service' }))

    expect(await screen.findByText(/stop stock tracking/i)).toBeInTheDocument()

    // Confirm applies the conversion: dialog closes and the type field becomes Service.
    await user.click(screen.getByRole('button', { name: /^Confirm$/i }))
    await waitFor(() => expect(screen.getByDisplayValue('Service')).toBeInTheDocument())
  })

  it('shows "start at 0 / Stock Adjustments" copy on Service→Stocked in edit mode', async () => {
    productState.type = 'Service'
    const user = userEvent.setup()
    renderEdit()

    await waitFor(() => expect(screen.getByDisplayValue('Widget')).toBeInTheDocument())

    const typeSelect = screen.getByLabelText(/Product Type/i)
    await user.click(typeSelect)
    await user.click(await screen.findByRole('option', { name: 'Stocked Product' }))

    expect(
      await screen.findByText(
        /start stock tracking at 0\. You must set quantity afterward via Stock Adjustments\./i,
      ),
    ).toBeInTheDocument()
  })
})
