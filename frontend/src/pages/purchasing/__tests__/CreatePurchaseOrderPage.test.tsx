import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'

import CreatePurchaseOrderPage from '../CreatePurchaseOrderPage'

const replacementSearchTerm = 'B'

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })

  return { promise, resolve }
}

const {
  mockDispatch,
  mockGet,
  mockCreatePurchaseOrder,
  mockUpdatePurchaseOrder,
  mockFetchPurchaseOrder,
  mockParams,
} = vi.hoisted(() => ({
  mockDispatch: vi.fn(),
  mockGet: vi.fn(),
  mockCreatePurchaseOrder: vi.fn(),
  mockUpdatePurchaseOrder: vi.fn(),
  mockFetchPurchaseOrder: vi.fn(),
  mockParams: vi.fn(() => ({})),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => mockParams(),
  }
})

vi.mock('@/hooks/useRedux', () => ({
  useAppDispatch: () => mockDispatch,
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}))

vi.mock('@/hooks/useCurrency', () => ({
  useCurrency: () => ({ currency: '$' }),
}))

vi.mock('@/services/api', () => ({
  ApiService: {
    get: mockGet,
  },
  default: {
    get: mockGet,
  },
}))

vi.mock('@/store/api/purchasingApi', () => ({
  useGetSuppliersQuery: () => ({
    data: {
      data: [{ id: 'supplier-1', companyName: 'Acme Supplies' }],
    },
  }),
  useCreatePurchaseOrderMutation: () => [mockCreatePurchaseOrder],
  useUpdatePurchaseOrderMutation: () => [mockUpdatePurchaseOrder],
  useLazyGetPurchaseOrderQuery: () => [mockFetchPurchaseOrder],
}))

describe('CreatePurchaseOrderPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockParams.mockReturnValue({})

    mockGet.mockImplementation(async (_url: string, config?: { params?: { search?: string } }) => {
      if (config?.params?.search?.startsWith(replacementSearchTerm)) {
        return {
          data: {
            data: [{ id: 'product-2', name: 'Beta Gadget', baseCost: 22 }],
          },
        }
      }

      return {
        data: {
          data: [{ id: 'product-1', name: 'Alpha Widget', baseCost: 11 }],
        },
      }
    })
  })

  it('replaces the autocomplete options with only the latest product search results', async () => {
    const user = userEvent.setup()

    render(
      <BrowserRouter>
        <CreatePurchaseOrderPage />
      </BrowserRouter>
    )

    const productInput = screen.getByPlaceholderText('Search by name or barcode...')
    await user.click(productInput)

    const initialListbox = await screen.findByRole('listbox')
    expect(within(initialListbox).getByText('Alpha Widget')).toBeInTheDocument()

    await user.clear(productInput)
    await user.type(productInput, replacementSearchTerm)

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/inventory/products', {
        params: { isActive: true, search: replacementSearchTerm },
      })
    })

    const updatedListbox = await screen.findByRole('listbox')
    expect(within(updatedListbox).getByText('Beta Gadget')).toBeInTheDocument()
    expect(within(updatedListbox).queryByText('Alpha Widget')).toBeNull()
  })

  it('keeps the selected product visible when another search replaces the shared options list', async () => {
    const user = userEvent.setup()

    render(
      <BrowserRouter>
        <CreatePurchaseOrderPage />
      </BrowserRouter>
    )

    const [firstProductInput] = screen.getAllByPlaceholderText('Search by name or barcode...')

    await user.click(firstProductInput)

    const initialListbox = await screen.findByRole('listbox')
    await user.click(within(initialListbox).getByText('Alpha Widget'))

    await waitFor(() => {
      expect(firstProductInput).toHaveValue('Alpha Widget')
    })

    await user.click(screen.getByRole('button', { name: /add item/i }))

    const productInputs = screen.getAllByPlaceholderText('Search by name or barcode...')
    const secondProductInput = productInputs[1]

    await user.click(secondProductInput)
    await user.type(secondProductInput, replacementSearchTerm)

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/inventory/products', {
        params: { isActive: true, search: replacementSearchTerm },
      })
    })

    await waitFor(() => {
      expect(firstProductInput).toHaveValue('Alpha Widget')
    })
  })

  it('keeps hydrated edit-mode product visible after shared search options are replaced', async () => {
    const user = userEvent.setup()

    mockParams.mockReturnValue({ id: 'po-1' })
    mockFetchPurchaseOrder.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({
        data: {
          id: 'po-1',
          supplierId: 'supplier-1',
          orderDate: '2026-03-01T00:00:00.000Z',
          shippingAmount: 0,
          items: [
            {
              productId: 'product-9',
              quantity: 2,
              unitPrice: 44,
              discountAmount: 0,
              discountPercent: 0,
              totalAmount: 88,
              product: { id: 'product-9', name: 'Hydrated Product', baseCost: 44 },
            },
          ],
        },
      }),
    })

    render(
      <BrowserRouter>
        <CreatePurchaseOrderPage />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(mockFetchPurchaseOrder).toHaveBeenCalledWith('po-1')
    })

    const [firstProductInput] = await screen.findAllByPlaceholderText('Search by name or barcode...')

    await waitFor(() => {
      expect(firstProductInput).toHaveValue('Hydrated Product')
    })

    await user.click(screen.getByRole('button', { name: /add item/i }))

    const productInputs = screen.getAllByPlaceholderText('Search by name or barcode...')
    const secondProductInput = productInputs[1]

    await user.click(secondProductInput)
    await user.type(secondProductInput, replacementSearchTerm)

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/inventory/products', {
        params: { isActive: true, search: replacementSearchTerm },
      })
    })

    await waitFor(() => {
      expect(firstProductInput).toHaveValue('Hydrated Product')
    })
  })

  it('ignores stale earlier product responses that finish after the latest search', async () => {
    const user = userEvent.setup()
    const initialProductsRequest = createDeferred<any>()
    const latestSearchRequest = createDeferred<any>()

    mockGet.mockImplementation(async (_url: string, config?: { params?: { search?: string } }) => {
      if (config?.params?.search === replacementSearchTerm) {
        return latestSearchRequest.promise
      }

      return initialProductsRequest.promise
    })

    render(
      <BrowserRouter>
        <CreatePurchaseOrderPage />
      </BrowserRouter>
    )

    const productInput = screen.getByPlaceholderText('Search by name or barcode...')

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/inventory/products', {
        params: { isActive: true },
      })
    })

    await user.click(productInput)
    await user.type(productInput, replacementSearchTerm)

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/inventory/products', {
        params: { isActive: true, search: replacementSearchTerm },
      })
    })

    await act(async () => {
      latestSearchRequest.resolve({
        data: {
          data: [{ id: 'product-2', name: 'Beta Gadget', baseCost: 22 }],
        },
      })
    })

    const listbox = await screen.findByRole('listbox')
    expect(within(listbox).getByText('Beta Gadget')).toBeInTheDocument()

    await act(async () => {
      initialProductsRequest.resolve({
        data: {
          data: [{ id: 'product-1', name: 'Alpha Widget', baseCost: 11 }],
        },
      })
    })

    await waitFor(() => {
      expect(within(listbox).getByText('Beta Gadget')).toBeInTheDocument()
      expect(within(listbox).queryByText('Alpha Widget')).toBeNull()
    })
  })
})
