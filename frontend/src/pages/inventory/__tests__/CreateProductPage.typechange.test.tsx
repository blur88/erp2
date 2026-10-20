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
import { createTestStore } from '@/test/createTestStore'

function renderEdit() {
  const store = createTestStore({ apis: [inventoryApiSlice, settingsApiSlice] })
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
  it('keeps stock read-only and disables type changes when stock is nonzero', async () => {
    productState.stockQuantity = 5
    productState.type = 'Stocked Product'
    renderEdit()

    await waitFor(() => expect(screen.getByDisplayValue('Widget')).toBeInTheDocument())

    const typeSelect = screen.getByLabelText(/Product Type/i)
    expect(typeSelect).toHaveAttribute('aria-disabled', 'true')
    expect(
      screen.getByText('A product with stock on hand or inventory value must stay a Stocked Product.'),
    ).toBeInTheDocument()
    expect(screen.getByDisplayValue('Stocked Product')).toBeInTheDocument()
    expect(screen.getByLabelText(/Current Stock/i)).toBeDisabled()
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
