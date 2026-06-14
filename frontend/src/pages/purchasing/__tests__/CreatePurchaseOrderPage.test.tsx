import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'

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
  mockNavigate,
  mockGet,
  mockCreatePurchaseOrder,
  mockUpdatePurchaseOrder,
  mockFetchPurchaseOrder,
  mockParams,
  mockGetDocumentNumberSettings,
  mockShowError,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockGet: vi.fn(),
  mockCreatePurchaseOrder: vi.fn(),
  mockUpdatePurchaseOrder: vi.fn(),
  mockFetchPurchaseOrder: vi.fn(),
  mockParams: vi.fn(() => ({})),
  mockGetDocumentNumberSettings: vi.fn(),
  mockShowError: vi.fn(),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => mockParams(),
    useBlocker: () => ({ state: 'idle', proceed: vi.fn(), reset: vi.fn() }),
  }
})



vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: mockShowError,
  }),
}))

vi.mock('@/hooks/useCurrency', () => ({
  useCurrency: () => ({ currency: '$' }),
}))

vi.mock('@/store/api/settingsApi', () => ({
  useGetDocumentNumberSettingsQuery: () => mockGetDocumentNumberSettings(),
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
  useLazyGetPurchaseOrderByNumberQuery: () => [mockFetchPurchaseOrder],
}))

const PO_DOC_SETTINGS = {
  data: {
    configurations: [
      { documentName: 'Purchase Orders', prefix: 'PO', nextNumber: 42, paddingDigits: 4 },
    ],
  },
  isLoading: false,
}

describe('CreatePurchaseOrderPage', { timeout: 60000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockParams.mockReturnValue({})

    mockGetDocumentNumberSettings.mockReturnValue(PO_DOC_SETTINGS)

    mockGet.mockImplementation(async (_url: string, config?: { params?: { search?: string } }) => {
      if (config?.params?.search?.startsWith(replacementSearchTerm)) {
        return { data: [{ id: 'product-2', name: 'Beta Gadget', baseCost: 22 }] }
      }

      return { data: [{ id: 'product-1', name: 'Alpha Widget', baseCost: 11 }] }
    })
  })

  it('renders PageHeader with title "Create Purchase Order" in create mode', () => {
    render(
      <BrowserRouter>
        <CreatePurchaseOrderPage />
      </BrowserRouter>
    )

    expect(screen.getByRole('heading', { name: 'Create Purchase Order' })).toBeInTheDocument()
  })

  it('renders PageHeader with title "Edit Purchase Order" in edit mode', async () => {
    mockParams.mockReturnValue({ orderNumber: 'PO-TEST' })
    mockFetchPurchaseOrder.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({
        id: 'po-test-id',
        supplierId: 'supplier-1',
        orderDate: '2026-03-01T00:00:00.000Z',
        shippingAmount: 0,
        items: [],
      }),
    })

    render(
      <BrowserRouter>
        <CreatePurchaseOrderPage />
      </BrowserRouter>
    )

    expect(await screen.findByRole('heading', { name: 'Edit Purchase Order' })).toBeInTheDocument()
  })

  it('shows the backend message and an update-specific fallback when an edit submit fails', async () => {
    mockParams.mockReturnValue({ orderNumber: 'PO-TEST' })
    mockFetchPurchaseOrder.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({
        id: 'po-test-id',
        supplierId: 'supplier-1',
        orderDate: '2026-03-01T00:00:00.000Z',
        shippingAmount: 0,
        items: [
          {
            lineNumber: 1,
            productId: 'product-1',
            product: { id: 'product-1', name: 'Alpha Widget', baseCost: 11 },
            quantity: 1,
            unitPrice: 11,
            discountType: 'percentage',
            discountPercent: 0,
            discountAmount: 0,
            totalAmount: 11,
          },
        ],
      }),
    })

    render(
      <BrowserRouter>
        <CreatePurchaseOrderPage />
      </BrowserRouter>,
    )

    await screen.findByRole('heading', { name: 'Edit Purchase Order' })

    // RTK Query error shape: { status, data: '<message>' }
    mockUpdatePurchaseOrder.mockReturnValue({
      unwrap: vi.fn().mockRejectedValue({ status: 400, data: 'Order is not in a draft state' }),
    })

    await userEvent.click(screen.getByRole('button', { name: /update order/i }))

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith('Order is not in a draft state')
    })
    expect(mockShowError).not.toHaveBeenCalledWith('Failed to create purchase order')

    // No message → fallback names the update action, not create.
    mockShowError.mockClear()
    mockUpdatePurchaseOrder.mockClear()
    mockUpdatePurchaseOrder.mockReturnValue({
      unwrap: vi.fn().mockRejectedValue({ status: 500 }),
    })

    await userEvent.click(screen.getByRole('button', { name: /update order/i }))

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith('Failed to update purchase order')
    })
  })

  it('replaces the autocomplete options with only the latest product search results', async () => {
    render(
      <BrowserRouter>
        <CreatePurchaseOrderPage />
      </BrowserRouter>
    )

    const productInput = screen.getByPlaceholderText('Search by name or barcode...')
    fireEvent.mouseDown(productInput)

    const initialListbox = await screen.findByRole('listbox')
    expect(within(initialListbox).getByText('Alpha Widget')).toBeInTheDocument()

    fireEvent.change(productInput, { target: { value: replacementSearchTerm } })

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/inventory/products', {
        params: { sortBy: 'name', sortOrder: 'ASC', search: replacementSearchTerm },
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
        params: { sortBy: 'name', sortOrder: 'ASC', search: replacementSearchTerm },
      })
    })

    await waitFor(() => {
      expect(firstProductInput).toHaveValue('Alpha Widget')
    })
  })

  it('keeps hydrated edit-mode product visible after shared search options are replaced', async () => {
    mockParams.mockReturnValue({ orderNumber: 'PO-1' })
    mockFetchPurchaseOrder.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({
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
      }),
    })

    render(
      <BrowserRouter>
        <CreatePurchaseOrderPage />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(mockFetchPurchaseOrder).toHaveBeenCalledWith('PO-1')
    })

    const [firstProductInput] = await screen.findAllByPlaceholderText('Search by name or barcode...')

    await waitFor(() => {
      expect(firstProductInput).toHaveValue('Hydrated Product')
    })

    fireEvent.click(screen.getByRole('button', { name: /add item/i }))

    const productInputs = screen.getAllByPlaceholderText('Search by name or barcode...')
    const secondProductInput = productInputs[1]

    fireEvent.mouseDown(secondProductInput)
    fireEvent.change(secondProductInput, { target: { value: replacementSearchTerm } })

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/inventory/products', {
        params: { sortBy: 'name', sortOrder: 'ASC', search: replacementSearchTerm },
      })
    })

    await waitFor(() => {
      expect(firstProductInput).toHaveValue('Hydrated Product')
    })
  })

  it('ignores stale earlier product responses that finish after the latest search', async () => {
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
        params: { sortBy: 'name', sortOrder: 'ASC' },
      })
    })

    fireEvent.mouseDown(productInput)
    fireEvent.change(productInput, { target: { value: replacementSearchTerm } })

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/inventory/products', {
        params: { sortBy: 'name', sortOrder: 'ASC', search: replacementSearchTerm },
      })
    })

    await act(async () => {
      latestSearchRequest.resolve({
        data: [{ id: 'product-2', name: 'Beta Gadget', baseCost: 22 }],
      })
    })

    const listbox = await screen.findByRole('listbox')
    expect(within(listbox).getByText('Beta Gadget')).toBeInTheDocument()

    await act(async () => {
      initialProductsRequest.resolve({
        data: [{ id: 'product-1', name: 'Alpha Widget', baseCost: 11 }],
      })
    })

    await waitFor(() => {
      expect(within(listbox).getByText('Beta Gadget')).toBeInTheDocument()
      expect(within(listbox).queryByText('Alpha Widget')).toBeNull()
    })
  })

  it('navigates to the orders list with a highlight after creating an order', async () => {
    const createdOrder = { id: 'new-po-id', orderNumber: 'PO-NEW' }
    mockCreatePurchaseOrder.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue(createdOrder),
    })

    render(
      <BrowserRouter>
        <CreatePurchaseOrderPage />
      </BrowserRouter>
    )

    const supplierInput = screen.getByLabelText(/supplier/i)
    fireEvent.mouseDown(supplierInput)
    const supplierListbox = await screen.findByRole('listbox')
    fireEvent.click(within(supplierListbox).getByText('Acme Supplies'))

    const productInput = screen.getByPlaceholderText('Search by name or barcode...')
    fireEvent.mouseDown(productInput)
    const productListbox = await screen.findByRole('listbox')
    fireEvent.click(within(productListbox).getByText('Alpha Widget'))

    await userEvent.click(screen.getByRole('button', { name: /create order/i }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/purchasing/orders?highlight=new-po-id')
    })
  })

  it('recalculates row total to 0.00 when quantity is set to 0', async () => {
    render(
      <BrowserRouter>
        <CreatePurchaseOrderPage />
      </BrowserRouter>,
    )

    const supplierInput = screen.getByLabelText(/supplier/i)
    fireEvent.mouseDown(supplierInput)
    const supplierListbox = await screen.findByRole('listbox')
    fireEvent.click(within(supplierListbox).getByText('Acme Supplies'))

    const productInput = screen.getByPlaceholderText('Search by name or barcode...')
    fireEvent.mouseDown(productInput)
    const productListbox = await screen.findByRole('listbox')
    fireEvent.click(within(productListbox).getByText('Alpha Widget'))

    const qtyInput = screen.getByDisplayValue('1') as HTMLInputElement
    const row = qtyInput.closest('tr')
    expect(row).not.toBeNull()

    await waitFor(() => {
      expect(within(row as HTMLTableRowElement).getByText('RM 11.00')).toBeInTheDocument()
    })

    fireEvent.change(qtyInput, { target: { value: '0' } })

    await waitFor(() => {
      expect(within(row as HTMLTableRowElement).getByText('RM 0.00')).toBeInTheDocument()
    })
    expect(within(row as HTMLTableRowElement).queryByText('RM 11.00')).not.toBeInTheDocument()
  })

  it('shows order number preview from DocumentNumberSettings', async () => {
    render(
      <BrowserRouter>
        <CreatePurchaseOrderPage />
      </BrowserRouter>,
    )

    const yy = String(new Date().getFullYear() % 100).padStart(2, '0')
    const orderNumberInput = screen.getByLabelText('Order Number') as HTMLInputElement
    await waitFor(() => {
      expect(orderNumberInput.value).toBe(`PO-${yy}-0042`)
    })
  })

  it('preselects the supplier from navigation state', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          { pathname: '/purchasing/orders/create', state: { preselectSupplierId: 'supplier-1' } },
        ]}
      >
        <CreatePurchaseOrderPage />
      </MemoryRouter>,
    )

    const supplierInput = screen.getByLabelText(/supplier/i) as HTMLInputElement
    await waitFor(() => {
      expect(supplierInput.value).toBe('Acme Supplies')
    })
  })

  // NOTE: The "does not re-apply preselect after manual change" guard for
  // `preselectAppliedRef` is covered by the shared pattern's test in
  // CreateSalesOrderPage.test.tsx (the preselect effect is identical). A
  // PO-local version could not be made non-vacuous here without a real store
  // re-render trigger, so it is intentionally omitted rather than left as a
  // false-passing test.

  it('does not show stock warnings when ordered quantity exceeds stock (purchasing, not selling)', async () => {
    // Default create-mode mocks are set in beforeEach. Override the product
    // search to return a low-stock product so the (removed) warning code path
    // would otherwise fire.
    mockGet.mockImplementation(async (_url: string) => ({
      data: [{ id: 'product-1', name: 'Alpha Widget', baseCost: 11, stockQuantity: 4 }],
    }))

    render(
      <BrowserRouter>
        <CreatePurchaseOrderPage />
      </BrowserRouter>
    )

    const productInput = screen.getByPlaceholderText('Search by name or barcode...')
    fireEvent.mouseDown(productInput)
    fireEvent.change(productInput, { target: { value: 'Alpha' } })

    const listbox = await screen.findByRole('listbox')
    fireEvent.click(within(listbox).getByText('Alpha Widget'))

    // Set the line-item quantity to 20 (above stock of 4).
    const qtyInput = await screen.findByDisplayValue('1')
    fireEvent.change(qtyInput, { target: { value: '20' } })

    // Page-level "N item(s) out of stock: ..." Alert must not render.
    expect(screen.queryByText(/out of stock/i)).not.toBeInTheDocument()
    // Per-line StockIndicatorChip "Only 4 left (need 20)" must not render.
    expect(screen.queryByText(/left \(need/i)).not.toBeInTheDocument()
  })
})
