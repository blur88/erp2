import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import CreateProductPage from '../CreateProductPage'

const mockNavigate = vi.fn()
const mockShowSuccess = vi.fn()
const mockShowError = vi.fn()
const mockUpdateProduct = vi.fn()
const mockCreateProduct = vi.fn()
const mockFetchProduct = vi.fn()
const mockDispatch = vi.fn()

const mockBulkUpdatePrices = vi.fn()
let mockRouteParams: Record<string, string> = {}

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => mockRouteParams,
    useBlocker: () => ({ state: 'idle', proceed: vi.fn(), reset: vi.fn() }),
  }
})

vi.mock('react-redux', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    useDispatch: () => mockDispatch,
  }
})

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess: mockShowSuccess,
    showError: mockShowError,
  }),
}))

vi.mock('@/hooks/useCurrency', () => ({
  useCurrency: () => ({ currency: '$' }),
}))

vi.mock('@/hooks/useDuplicateCheck', () => ({
  useDuplicateCheck: () => ({
    checkDuplicate: vi.fn(),
    nameError: '',
    barcodeError: '',
    hasNameDuplicate: false,
    hasBarcodeDuplicate: false,
    hasCheckedName: false,
    hasCheckedBarcode: false,
  }),
}))

vi.mock('@/components/inventory/CategorySelector', () => ({
  default: ({ onChange }: { onChange: (category: { id: string; name: string }) => void }) => (
    <button type="button" onClick={() => onChange({ id: 'cat-1', name: 'Category 1' })}>
      Select Category
    </button>
  ),
}))

vi.mock('@/store/api/priceListApi', () => ({
  useGetPriceListsQuery: () => ({
    data: { data: [{ id: 'pl-1', name: 'Retail', isActive: true }] },
    isLoading: false,
  }),
  useBulkUpdatePricesMutation: () => [mockBulkUpdatePrices, { isLoading: false }],
  priceListApiSlice: {
    util: {
      invalidateTags: (tags: unknown) => ({ type: '__INVALIDATE__', tags }),
    },
  },
}))

vi.mock('@/store/api/inventoryApi', () => ({
  useUpdateProductMutation: () => [mockUpdateProduct],
  useCreateProductMutation: () => [mockCreateProduct],
  useLazyGetProductBySlugQuery: () => [mockFetchProduct, { isFetching: false }],
}))

describe('CreateProductPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRouteParams = {}

    mockCreateProduct.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({ id: 'prod-1' }),
    })
    mockFetchProduct.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({
        id: 'prod-1',
        name: 'Original Product',
        description: '',
        barcode: '',
        type: 'Stocked Product',
        categoryId: 'cat-1',
        baseCost: 0,
        stockQuantity: 0,
        notes: '',
        isActive: true,
        category: { id: 'cat-1', name: 'Category 1' },
        priceListItems: [],
      }),
    })
    mockUpdateProduct.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({}),
    })
    mockBulkUpdatePrices.mockResolvedValue({})
  })

  it('saves a price list item when price is explicitly set to 0', async () => {
    render(
      <BrowserRouter>
        <CreateProductPage />
      </BrowserRouter>
    )

    fireEvent.change(screen.getByRole('textbox', { name: /Product Name/i }), { target: { value: 'Test Product' } })
    fireEvent.click(screen.getByRole('button', { name: 'Select Category' }))

    const retailPriceInput = await screen.findByLabelText('Retail Price')
    fireEvent.change(retailPriceInput, { target: { value: '0' } })

    fireEvent.click(screen.getByRole('button', { name: 'Create Product' }))

    await waitFor(() => {
      expect(mockCreateProduct).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: 'cat-1' })
      )
    })

    await waitFor(() => {
      expect(mockBulkUpdatePrices).toHaveBeenCalledWith({
        priceListId: 'pl-1',
        items: [
          {
            productId: 'prod-1',
            price: 0,
            costBasis: 0,
          },
        ],
      })
    })
  })

  it('uses the RTK Query update mutation when editing a product', async () => {
    mockRouteParams = { slug: 'original-product' }

    render(
      <BrowserRouter>
        <CreateProductPage />
      </BrowserRouter>
    )

    const productNameInput = await screen.findByRole('textbox', { name: /Product Name/i })
    await waitFor(() => {
      expect(productNameInput).toHaveValue('Original Product')
    })

    fireEvent.change(productNameInput, { target: { value: 'Updated Product' } })
    fireEvent.click(screen.getByRole('button', { name: 'Update Product' }))

    await waitFor(() => {
      expect(mockUpdateProduct).toHaveBeenCalledWith({
        id: 'prod-1',
        data: expect.objectContaining({
          name: 'Updated Product',
          categoryId: 'cat-1',
        }),
      })
    })
  })

  it('invalidates PriceListItem cache for the product after updating prices in edit mode', async () => {
    mockRouteParams = { slug: 'original-product' }
    mockFetchProduct.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({
        id: 'prod-1',
        name: 'Original Product',
        description: '',
        barcode: '',
        type: 'Stocked Product',
        categoryId: 'cat-1',
        baseCost: 10,
        stockQuantity: 0,
        notes: '',
        isActive: true,
        category: { id: 'cat-1', name: 'Category 1' },
        priceListItems: [{ priceListId: 'pl-1', price: 50 }],
      }),
    })

    render(
      <BrowserRouter>
        <CreateProductPage />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /Product Name/i })).toHaveValue('Original Product')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Update Product' }))

    await waitFor(() => {
      expect(mockBulkUpdatePrices).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: '__INVALIDATE__',
          tags: [{ type: 'PriceListItem', id: 'product-prod-1' }],
        })
      )
    })
  })
})
