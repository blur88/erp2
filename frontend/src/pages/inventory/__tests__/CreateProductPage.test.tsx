import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import CreateProductPage from '../CreateProductPage'

const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
}

const mockNavigate = vi.fn()
const mockShowSuccess = vi.fn()
const mockShowError = vi.fn()

const mockApiPost = vi.fn()
const mockApiPatch = vi.fn()
const mockApiGet = vi.fn()

const mockGetPriceLists = vi.fn()
const mockBulkUpdatePrices = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({}),
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

vi.mock('@/services/api', () => ({
  ApiService: {
    post: (...args: unknown[]) => mockApiPost(...args),
    patch: (...args: unknown[]) => mockApiPatch(...args),
    get: (...args: unknown[]) => mockApiGet(...args),
  },
}))

vi.mock('@/services/priceListApi', () => ({
  priceListApi: {
    getPriceLists: (...args: unknown[]) => mockGetPriceLists(...args),
    bulkUpdatePrices: (...args: unknown[]) => mockBulkUpdatePrices(...args),
  },
}))

describe('CreateProductPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockGetPriceLists.mockResolvedValue({
      data: [{ id: 'pl-1', name: 'Retail', isActive: true }],
    })
    mockApiPost.mockResolvedValue({ id: 'prod-1' })
    mockApiPatch.mockResolvedValue({})
    mockApiGet.mockResolvedValue({})
    mockBulkUpdatePrices.mockResolvedValue({})
  })

  it('saves a price list item when price is explicitly set to 0', async () => {
    render(
      <BrowserRouter future={routerFutureFlags}>
        <CreateProductPage />
      </BrowserRouter>
    )

    fireEvent.change(screen.getByRole('textbox', { name: /Product Name/i }), { target: { value: 'Test Product' } })
    fireEvent.click(screen.getByRole('button', { name: 'Select Category' }))

    const retailPriceInput = await screen.findByLabelText('Retail Price')
    fireEvent.change(retailPriceInput, { target: { value: '0' } })

    fireEvent.click(screen.getByRole('button', { name: 'Create Product' }))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(mockBulkUpdatePrices).toHaveBeenCalledWith('pl-1', [
        {
          productId: 'prod-1',
          price: 0,
          costBasis: 0,
        },
      ])
    })
  })
})
