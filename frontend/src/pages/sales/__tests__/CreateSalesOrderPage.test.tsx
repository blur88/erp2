import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'

import CreateSalesOrderPage from '../CreateSalesOrderPage'

const replacementSearchTerm = 'B'
const customersResponse = {
  data: { data: [{ id: 'customer-1', name: 'Test Customer' }] },
}

const {
  mockDispatch,
  mockGet,
  mockCreateSalesOrder,
  mockUpdateSalesOrder,
  mockFetchSalesOrder,
  mockParams,
} = vi.hoisted(() => ({
  mockDispatch: vi.fn(),
  mockGet: vi.fn(),
  mockCreateSalesOrder: vi.fn(),
  mockUpdateSalesOrder: vi.fn(),
  mockFetchSalesOrder: vi.fn(),
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

vi.mock('react-redux', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>

  return {
    ...actual,
    useStore: () => ({
      getState: vi.fn(() => ({})),
    }),
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
  ApiService: { get: mockGet },
}))

vi.mock('@/store/api/salesApi', () => ({
  useGetCustomersQuery: () => customersResponse,
  useCreateSalesOrderMutation: () => [mockCreateSalesOrder],
  useUpdateSalesOrderMutation: () => [mockUpdateSalesOrder],
  useLazyGetSalesOrderQuery: () => [mockFetchSalesOrder],
}))

vi.mock('@/store/api/salesOrderCache', () => ({
  patchSalesOrderCaches: vi.fn(),
}))

vi.mock('@/store/slices/salesSlice', () => ({
  setSelectedOrder: vi.fn((value) => ({ type: 'sales/setSelectedOrder', payload: value })),
}))

describe('CreateSalesOrderPage product search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockParams.mockReturnValue({})

    mockGet.mockImplementation(async (_url: string, config?: { params?: { search?: string } }) => {
      if (config?.params?.search?.startsWith(replacementSearchTerm)) {
        return { data: [{ id: 'product-2', name: 'Beta Gadget', basePrice: 22 }] }
      }

      return { data: [{ id: 'product-1', name: 'Alpha Widget', basePrice: 11 }] }
    })
  })

  it('replaces autocomplete options with only the latest search results', async () => {
    const user = userEvent.setup()

    render(
      <BrowserRouter>
        <CreateSalesOrderPage />
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
        <CreateSalesOrderPage />
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

  it('keeps hydrated edit-mode product visible after search replaces options', async () => {
    const user = userEvent.setup()
    mockParams.mockReturnValue({ id: 'so-1' })

    mockFetchSalesOrder.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({
        items: [
          {
            productId: 'product-9',
            quantity: 2,
            unitPrice: 44,
            discountType: 'percentage',
            discountValue: 0,
            discountPercent: 0,
            discountAmount: 0,
            totalPrice: 88,
            product: { id: 'product-9', name: 'Hydrated Product', basePrice: 44 },
          },
        ],
        customerId: 'customer-1',
        orderDate: '2026-03-01T00:00:00.000Z',
        shippingAmount: 0,
      }),
    })

    render(
      <BrowserRouter>
        <CreateSalesOrderPage />
      </BrowserRouter>
    )

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
})
