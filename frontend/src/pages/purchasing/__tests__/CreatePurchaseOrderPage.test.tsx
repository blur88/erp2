import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'

import CreatePurchaseOrderPage from '../CreatePurchaseOrderPage'

const {
  mockDispatch,
  mockGet,
  mockCreatePurchaseOrder,
  mockUpdatePurchaseOrder,
  mockFetchPurchaseOrder,
} = vi.hoisted(() => ({
  mockDispatch: vi.fn(),
  mockGet: vi.fn(),
  mockCreatePurchaseOrder: vi.fn(),
  mockUpdatePurchaseOrder: vi.fn(),
  mockFetchPurchaseOrder: vi.fn(),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({}),
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

    mockGet.mockImplementation(async (_url: string, config?: { params?: { search?: string } }) => {
      if (config?.params?.search === 'Beta Gadget') {
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
    await user.type(productInput, 'Beta Gadget')

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/inventory/products', {
        params: { isActive: true, search: 'Beta Gadget' },
      })
    })

    const updatedListbox = await screen.findByRole('listbox')
    expect(within(updatedListbox).getByText('Beta Gadget')).toBeInTheDocument()
    expect(within(updatedListbox).queryByText('Alpha Widget')).toBeNull()
  })
})
