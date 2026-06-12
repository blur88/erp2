import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter, MemoryRouter, Route, Routes } from 'react-router-dom'

import CreateSalesOrderPage from '../CreateSalesOrderPage'

const replacementSearchTerm = 'B'
const customersResponse = {
  data: { data: [{ id: 'customer-1', name: 'Test Customer' }] },
}

const {
  mockDispatch,
  mockNavigate,
  mockGet,
  mockCreateSalesOrder,
  mockUpdateSalesOrder,
  mockFetchSalesOrder,
  mockParams,
  mockGetDocumentNumberSettings,
  mockShowError,
} = vi.hoisted(() => ({
  mockDispatch: vi.fn(),
  mockNavigate: vi.fn(),
  mockGet: vi.fn(),
  mockCreateSalesOrder: vi.fn(),
  mockUpdateSalesOrder: vi.fn(),
  mockFetchSalesOrder: vi.fn(),
  mockParams: vi.fn(() => ({})),
  mockGetDocumentNumberSettings: vi.fn(),
  mockShowError: vi.fn(),
}))

const { mockBlockerState, mockBlockerProceed, mockBlockerReset } = vi.hoisted(() => ({
  mockBlockerState: { current: 'idle' as 'idle' | 'blocked' },
  mockBlockerProceed: vi.fn(),
  mockBlockerReset: vi.fn(),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')

  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => mockParams(),
    useBlocker: () => ({
      state: mockBlockerState.current,
      proceed: mockBlockerProceed,
      reset: mockBlockerReset,
    }),
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
    showError: mockShowError,
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
  useLazyGetSalesOrderByNumberQuery: () => [mockFetchSalesOrder],
}))

vi.mock('@/store/api/settingsApi', () => ({
  useGetDocumentNumberSettingsQuery: () => mockGetDocumentNumberSettings(),
}))

vi.mock('@/store/api/salesOrderCache', () => ({
  patchSalesOrderCaches: vi.fn(),
}))

vi.mock('@/store/slices/salesSlice', () => ({
  setSelectedOrder: vi.fn((value) => ({ type: 'sales/setSelectedOrder', payload: value })),
}))

beforeEach(() => {
  mockBlockerState.current = 'idle'
  mockGetDocumentNumberSettings.mockReturnValue({
    data: {
      configurations: [
        {
          documentName: 'Sales Orders',
          prefix: 'SO',
          paddingDigits: 3,
          nextNumber: 42,
          lastResetYear: 26,
        },
      ],
    },
    isLoading: false,
  })
})

describe('CreateSalesOrderPage product search', { timeout: 60000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockParams.mockReturnValue({})
    mockShowError.mockReset()
    customersResponse.data.data = [{ id: 'customer-1', name: 'Test Customer' }]

    mockGet.mockImplementation(async (_url: string, config?: { params?: { search?: string } }) => {
      if (config?.params?.search?.startsWith(replacementSearchTerm)) {
        return { data: [{ id: 'product-2', name: 'Beta Gadget', basePrice: 22 }] }
      }

      return { data: [{ id: 'product-1', name: 'Alpha Widget', basePrice: 11 }] }
    })
  })

  it('replaces autocomplete options with only the latest search results', async () => {
    render(
      <BrowserRouter>
        <CreateSalesOrderPage />
      </BrowserRouter>
    )

    const productInput = screen.getByPlaceholderText('Search by name or barcode...')
    fireEvent.mouseDown(productInput)

    const initialListbox = await screen.findByRole('listbox')
    expect(within(initialListbox).getByText('Alpha Widget')).toBeInTheDocument()

    fireEvent.change(productInput, { target: { value: replacementSearchTerm } })

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/inventory/products', {
        params: { isActive: true, sortBy: 'name', sortOrder: 'ASC', search: replacementSearchTerm },
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
        params: { isActive: true, sortBy: 'name', sortOrder: 'ASC', search: replacementSearchTerm },
      })
    })

    await waitFor(() => {
      expect(firstProductInput).toHaveValue('Alpha Widget')
    })
  })

  it('keeps hydrated edit-mode product visible after search replaces options', async () => {
    mockParams.mockReturnValue({ orderNumber: 'SO-1' })

    mockFetchSalesOrder.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({
        status: 'DRAFT',
        paymentStatus: 'UNPAID',
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

    fireEvent.click(screen.getByRole('button', { name: /add item/i }))

    const productInputs = screen.getAllByPlaceholderText('Search by name or barcode...')
    const secondProductInput = productInputs[1]

    fireEvent.mouseDown(secondProductInput)
    fireEvent.change(secondProductInput, { target: { value: replacementSearchTerm } })

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/inventory/products', {
        params: { isActive: true, sortBy: 'name', sortOrder: 'ASC', search: replacementSearchTerm },
      })
    })

    await waitFor(() => {
      expect(firstProductInput).toHaveValue('Hydrated Product')
    })
  })

  it('preserves edit-mode unit prices when the customer price list differs', async () => {
    mockParams.mockReturnValue({ orderNumber: 'SO-1' })
    customersResponse.data.data = [{ id: 'customer-1', name: 'Test Customer', priceListId: 'vip' }]

    mockFetchSalesOrder.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({
        status: 'DRAFT',
        paymentStatus: 'UNPAID',
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
            totalAmount: 88,
            product: {
              id: 'product-9',
              name: 'Hydrated Product',
              baseCost: 44,
              priceListItems: [{ priceListId: 'vip', price: '99.00' }],
            },
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

    await waitFor(() => {
      expect(screen.getByDisplayValue('44.00')).toBeInTheDocument()
      expect(screen.queryByDisplayValue('99.00')).not.toBeInTheDocument()
    })
  })

  it('dispatches the created order before navigating back to the orders list', async () => {
    const createdOrder = { id: 'new-order-id', orderNumber: 'SO-NEW' }
    mockCreateSalesOrder.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue(createdOrder),
    })

    render(
      <BrowserRouter>
        <CreateSalesOrderPage />
      </BrowserRouter>
    )

    const customerInput = screen.getByLabelText(/customer/i)
    fireEvent.mouseDown(customerInput)
    const customerListbox = await screen.findByRole('listbox')
    fireEvent.click(within(customerListbox).getByText('Test Customer'))

    const [productInput] = screen.getAllByPlaceholderText('Search by name or barcode...')
    fireEvent.mouseDown(productInput)
    const productListbox = await screen.findByRole('listbox')
    fireEvent.click(within(productListbox).getByText('Alpha Widget'))

    await userEvent.click(screen.getByRole('button', { name: /create order/i }))

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: expect.stringContaining('setSelectedOrder'),
          payload: expect.objectContaining({ id: 'new-order-id' }),
        }),
      )
    })

    expect(mockNavigate).toHaveBeenCalledWith('/sales/orders?highlight=new-order-id')
    const dispatchCallIndex = mockDispatch.mock.calls.findIndex((call) =>
      String(call[0]?.type).includes('setSelectedOrder'),
    )
    expect(dispatchCallIndex).toBeGreaterThanOrEqual(0)
    expect(mockDispatch.mock.invocationCallOrder[dispatchCallIndex]).toBeLessThan(
      mockNavigate.mock.invocationCallOrder[0],
    )
  })
})

describe('CreateSalesOrderPage - preselectCustomerId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockParams.mockReturnValue({})
    customersResponse.data.data = [
      { id: 'customer-1', name: 'Test Customer' },
      { id: 'customer-2', name: 'Other Customer' },
    ]
    mockGet.mockResolvedValue({ data: [] })
  })

  it('pre-selects the customer from location state on mount', async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/sales/sales-orders/create', state: { preselectCustomerId: 'customer-1' } }]}>
        <Routes>
          <Route path="/sales/sales-orders/create" element={<CreateSalesOrderPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /customer/i })).toHaveValue('Test Customer')
    })
  })

  it('does not re-apply preselect after the user manually changes the customer', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={[{ pathname: '/sales/sales-orders/create', state: { preselectCustomerId: 'customer-1' } }]}>
        <Routes>
          <Route path="/sales/sales-orders/create" element={<CreateSalesOrderPage />} />
        </Routes>
      </MemoryRouter>,
    )

    // Wait for initial preselect
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /customer/i })).toHaveValue('Test Customer')
    })

    // User manually selects a different customer
    const customerInput = screen.getByRole('combobox', { name: /customer/i })
    await user.clear(customerInput)
    await user.type(customerInput, 'Other')
    const listbox = await screen.findByRole('listbox')
    await user.click(within(listbox).getByText('Other Customer'))

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /customer/i })).toHaveValue('Other Customer')
    })

    // Simulate customers list re-fetching (new array reference) by triggering a re-render
    act(() => {
      customersResponse.data.data = [...customersResponse.data.data]
    })

    // Manual selection should be preserved — preselect must not re-fire
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /customer/i })).toHaveValue('Other Customer')
    })
  })
})

describe('CreateSalesOrderPage — new features', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockParams.mockReturnValue({})
    customersResponse.data.data = [{ id: 'customer-1', name: 'Test Customer' }]
    mockGet.mockResolvedValue({ data: [] })
    mockGetDocumentNumberSettings.mockReturnValue({
      data: {
        configurations: [
          {
            documentName: 'Sales Orders',
            prefix: 'SO',
            paddingDigits: 3,
            nextNumber: 42,
            lastResetYear: 26,
          },
        ],
      },
      isLoading: false,
    })
  })

  it('shows order number preview from DocumentNumberSettings', async () => {
    render(
      <BrowserRouter>
        <CreateSalesOrderPage />
      </BrowserRouter>,
    )

    const yy = String(new Date().getFullYear() % 100).padStart(2, '0')
    await waitFor(() => {
      expect(screen.getByDisplayValue(`SO-${yy}-042`)).toBeInTheDocument()
    })
  })

  it('shows discard dialog when blocker intercepts navigation on dirty form', () => {
    mockBlockerState.current = 'blocked'
    render(
      <BrowserRouter>
        <CreateSalesOrderPage />
      </BrowserRouter>,
    )

    expect(screen.getByText(/discard changes/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /discard/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /keep editing/i })).toBeInTheDocument()
    mockBlockerState.current = 'idle'
  })

  it('navigates immediately on cancel when form is untouched', async () => {
    const user = userEvent.setup()
    render(
      <BrowserRouter>
        <CreateSalesOrderPage />
      </BrowserRouter>,
    )

    await user.click(screen.getByRole('button', { name: /^cancel$/i }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/sales/orders')
    })
    expect(screen.queryByText(/discard changes/i)).not.toBeInTheDocument()
  })

  it('shows customer validation error when submitting without a customer', async () => {
    const user = userEvent.setup()
    render(
      <BrowserRouter>
        <CreateSalesOrderPage />
      </BrowserRouter>,
    )

    await user.click(screen.getByRole('button', { name: /create order/i }))

    await waitFor(() => {
      expect(screen.getByText(/customer is required/i)).toBeInTheDocument()
    })
    expect(mockCreateSalesOrder).not.toHaveBeenCalled()
  })

  it('shows item validation error when product is not selected', async () => {
    const user = userEvent.setup()
    render(
      <BrowserRouter>
        <CreateSalesOrderPage />
      </BrowserRouter>,
    )

    const customerInput = screen.getByLabelText(/customer/i)
    fireEvent.mouseDown(customerInput)
    const listbox = await screen.findByRole('listbox')
    fireEvent.click(within(listbox).getByText('Test Customer'))

    await user.click(screen.getByRole('button', { name: /create order/i }))

    await waitFor(() => {
      expect(screen.getByText(/product is required/i)).toBeInTheDocument()
    })
    expect(mockCreateSalesOrder).not.toHaveBeenCalled()
  })

  it('Tab on last column moves focus to first column of the next row', async () => {
    render(
      <BrowserRouter>
        <CreateSalesOrderPage />
      </BrowserRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: /add row/i }))

    const lastColFirstRow = document.querySelector('[data-cell="r0-c3"]')
    expect(lastColFirstRow).not.toBeNull()

    const input = lastColFirstRow!.querySelector('input')!
    fireEvent.keyDown(input, { key: 'Tab', bubbles: true })

    await waitFor(() => {
      const firstColSecondRow = document.querySelector('[data-cell="r1-c0"] input')
      expect(firstColSecondRow).toHaveFocus()
    })
  })

  it('Enter on last col of last row appends a new row', async () => {
    render(
      <BrowserRouter>
        <CreateSalesOrderPage />
      </BrowserRouter>,
    )

    const rows = () => document.querySelectorAll('[data-cell^="r"][data-cell$="-c0"]')
    expect(rows()).toHaveLength(1)

    const discountInput = document.querySelector('[data-cell="r0-c3"] input')!
    fireEvent.keyDown(discountInput, { key: 'Enter', bubbles: true })

    await waitFor(() => {
      expect(rows()).toHaveLength(2)
    })
  })

  it('updates subtotal and total immediately when a product is selected', async () => {
    mockGet.mockResolvedValue({ data: [{ id: 'product-1', name: 'Alpha Widget', basePrice: 11 }] })

    render(
      <BrowserRouter>
        <CreateSalesOrderPage />
      </BrowserRouter>,
    )

    const productInput = screen.getByPlaceholderText('Search by name or barcode...')
    fireEvent.mouseDown(productInput)
    const listbox = await screen.findByRole('listbox')
    fireEvent.click(within(listbox).getByText('Alpha Widget'))

    // Subtotal cell shows qty(1) × price(11) = RM 11.00 immediately after selection
    await waitFor(() => {
      expect(screen.getByText('RM 11.00')).toBeInTheDocument()
    })

    // Total Amount field also reflects the subtotal (no shipping)
    await waitFor(() => {
      const totalField = screen.getByRole('textbox', { name: /total amount/i })
      expect(totalField).toHaveDisplayValue('11.00')
    })
  })

  it('recalculates row total to 0.00 when quantity is set to 0', async () => {
    mockGet.mockResolvedValue({ data: [{ id: 'product-1', name: 'Alpha Widget', basePrice: 11 }] })

    render(
      <BrowserRouter>
        <CreateSalesOrderPage />
      </BrowserRouter>,
    )

    const productInput = screen.getByPlaceholderText('Search by name or barcode...')
    fireEvent.mouseDown(productInput)
    const listbox = await screen.findByRole('listbox')
    fireEvent.click(within(listbox).getByText('Alpha Widget'))

    const row = document.querySelector('[data-cell="r0-c1"]')?.closest('tr')
    expect(row).not.toBeNull()

    await waitFor(() => {
      expect(within(row as HTMLTableRowElement).getByText('RM 11.00')).toBeInTheDocument()
    })

    const qtyInput = document.querySelector('[data-cell="r0-c1"] input') as HTMLInputElement
    expect(qtyInput).not.toBeNull()
    fireEvent.change(qtyInput, { target: { value: '0' } })

    await waitFor(() => {
      expect(within(row as HTMLTableRowElement).getByText('RM 0.00')).toBeInTheDocument()
    })
    expect(within(row as HTMLTableRowElement).queryByText('RM 11.00')).not.toBeInTheDocument()

    const totalField = screen.getByRole('textbox', { name: /total amount/i })
    expect(totalField).toHaveDisplayValue('0.00')
  })

  it('shows out-of-stock warning banner and chip when a selected product has no stock', async () => {
    mockGet.mockResolvedValue({
      data: [{ id: 'product-1', name: 'Zero Widget', baseCost: 10, stockQuantity: 0 }],
    })

    render(
      <BrowserRouter>
        <CreateSalesOrderPage />
      </BrowserRouter>,
    )

    const productInput = screen.getByPlaceholderText('Search by name or barcode...')
    fireEvent.mouseDown(productInput)
    const listbox = await screen.findByRole('listbox')
    fireEvent.click(within(listbox).getByText('Zero Widget'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/out of stock/i)
      expect(screen.getByText('Out of stock (0)')).toBeInTheDocument()
    })
  })
})

describe('CreateSalesOrderPage — edit mode', { timeout: 60000 }, () => {
  const existingOrder = {
    id: 'order-id-1',
    orderNumber: 'SO-26-001',
    status: 'DRAFT',
    paymentStatus: 'UNPAID',
    customerId: 'customer-1',
    orderDate: '2026-03-15T00:00:00.000Z',
    shippingAmount: 25,
    notes: 'Handle with care',
    items: [
      {
        productId: 'product-1',
        quantity: 3,
        unitPrice: 11,
        discountType: 'percentage',
        discountValue: 0,
        discountPercent: 0,
        discountAmount: 0,
        totalPrice: 33,
        totalAmount: 33,
        product: { id: 'product-1', name: 'Alpha Widget', basePrice: 11 },
      },
    ],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockParams.mockReturnValue({ orderNumber: 'SO-26-001' })
    customersResponse.data.data = [{ id: 'customer-1', name: 'Test Customer' }]
    mockGet.mockResolvedValue({ data: [] })
    mockGetDocumentNumberSettings.mockReturnValue({ data: { configurations: [] }, isLoading: false })
  })

  it('shows CircularProgress while loading the order', async () => {
    mockFetchSalesOrder.mockReturnValue({
      unwrap: vi.fn(() => new Promise(() => {})), // never resolves
    })

    render(
      <BrowserRouter>
        <CreateSalesOrderPage />
      </BrowserRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('progressbar')).toBeInTheDocument()
    })
  })

  it('shows error Alert when order load fails', async () => {
    mockFetchSalesOrder.mockReturnValue({
      unwrap: vi.fn().mockRejectedValue({ data: { message: 'Order not found' } }),
    })

    render(
      <BrowserRouter>
        <CreateSalesOrderPage />
      </BrowserRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText('Order not found')).toBeInTheDocument()
    })
  })

  it('pre-fills all 4 sections with existing order data', async () => {
    mockFetchSalesOrder.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue(existingOrder),
    })

    render(
      <BrowserRouter>
        <CreateSalesOrderPage />
      </BrowserRouter>,
    )

    // Section 1 — Order Info
    await waitFor(() => {
      expect(screen.getByDisplayValue('SO-26-001')).toBeInTheDocument()
      expect(screen.getByDisplayValue('2026-03-15')).toBeInTheDocument()
      expect(screen.getByRole('combobox', { name: /customer/i })).toHaveValue('Test Customer')
    })

    // Section 2 — Line Items
    await waitFor(() => {
      const productInput = screen.getByPlaceholderText('Search by name or barcode...')
      expect(productInput).toHaveValue('Alpha Widget')
    })

    // Section 3 — Shipping
    await waitFor(() => {
      expect(screen.getByDisplayValue('25.00')).toBeInTheDocument()
    })

    // Section 4 — Notes
    await waitFor(() => {
      expect(screen.getByDisplayValue('Handle with care')).toBeInTheDocument()
    })
  })

  it('save calls updateSalesOrder and redirects to list', async () => {
    mockFetchSalesOrder.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue(existingOrder),
    })
    mockUpdateSalesOrder.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({ id: 'order-id-1', orderNumber: 'SO-26-001' }),
    })

    render(
      <BrowserRouter>
        <CreateSalesOrderPage />
      </BrowserRouter>,
    )

    // Wait for form to pre-fill
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /customer/i })).toHaveValue('Test Customer')
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /update order/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /update order/i }))

    await waitFor(() => {
      expect(mockUpdateSalesOrder).toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith('/sales/orders?highlight=order-id-1')
    })
  })

  it('shows the backend message and an update-specific fallback when an edit submit fails', async () => {
    mockFetchSalesOrder.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue(existingOrder),
    })

    render(
      <BrowserRouter>
        <CreateSalesOrderPage />
      </BrowserRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /customer/i })).toHaveValue('Test Customer')
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /update order/i })).toBeInTheDocument()
    })

    // RTK Query error shape: { status, data: '<message>' }
    mockUpdateSalesOrder.mockReturnValue({
      unwrap: vi.fn().mockRejectedValue({ status: 400, data: 'Order is not editable' }),
    })

    await userEvent.click(screen.getByRole('button', { name: /update order/i }))

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith('Order is not editable')
    })

    // No message → fallback names the update action, not create.
    mockShowError.mockClear()
    mockUpdateSalesOrder.mockClear()
    mockUpdateSalesOrder.mockReturnValue({
      unwrap: vi.fn().mockRejectedValue({ status: 500 }),
    })

    await userEvent.click(screen.getByRole('button', { name: /update order/i }))

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith('Failed to update sales order')
    })
  })

  it('shows discard dialog when blocker intercepts navigation in edit mode', async () => {
    mockBlockerState.current = 'blocked'
    mockFetchSalesOrder.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue(existingOrder),
    })

    render(
      <BrowserRouter>
        <CreateSalesOrderPage />
      </BrowserRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText(/discard changes/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /discard/i })).toBeInTheDocument()
  })

  it('cancel without changes navigates immediately without dialog', async () => {
    const user = userEvent.setup()
    mockFetchSalesOrder.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue(existingOrder),
    })

    render(
      <BrowserRouter>
        <CreateSalesOrderPage />
      </BrowserRouter>,
    )

    // Wait for pre-fill to complete
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /customer/i })).toHaveValue('Test Customer')
    })

    await user.click(screen.getByRole('button', { name: /^cancel$/i }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/sales/orders')
    })
    expect(screen.queryByText(/discard changes/i)).not.toBeInTheDocument()
  })

  it('shows discard dialog when blocker intercepts navigation in create mode', () => {
    mockBlockerState.current = 'blocked'
    mockParams.mockReturnValue({}) // create mode — no orderNumber

    render(
      <BrowserRouter>
        <CreateSalesOrderPage />
      </BrowserRouter>,
    )

    expect(screen.getByText(/discard changes/i)).toBeInTheDocument()
    mockBlockerState.current = 'idle'
  })
})

describe('CreateSalesOrderPage edit guard', { timeout: 60000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockShowError.mockReset()
    mockParams.mockReturnValue({ orderNumber: 'SO-1' })
    mockGetDocumentNumberSettings.mockReturnValue({
      data: { configurations: [] },
      isLoading: false,
    })
  })

  it('loads the editor (no redirect/error) when order is paid', async () => {
    mockFetchSalesOrder.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({
        id: 'order-123',
        status: 'DRAFT',
        paymentStatus: 'PAID',
        items: [],
        customerId: 'customer-1',
        orderDate: '2026-01-01T00:00:00.000Z',
        shippingAmount: 0,
      }),
    })

    render(
      <BrowserRouter>
        <CreateSalesOrderPage />
      </BrowserRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /customer/i })).toHaveValue('Test Customer')
    })

    expect(mockNavigate).not.toHaveBeenCalledWith('/sales/orders/SO-1/view', { replace: true })
    expect(mockShowError).not.toHaveBeenCalled()
  })

  it('redirects to order detail and shows error when order is fulfilled', async () => {
    mockFetchSalesOrder.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({
        id: 'order-456',
        status: 'FULFILLED',
        paymentStatus: 'PAID',
        items: [],
        customerId: 'customer-1',
        orderDate: '2026-01-01T00:00:00.000Z',
        shippingAmount: 0,
      }),
    })

    render(
      <BrowserRouter>
        <CreateSalesOrderPage />
      </BrowserRouter>,
    )

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/sales/orders/SO-1/view', { replace: true })
    })

    expect(mockShowError).toHaveBeenCalledWith('Cannot edit this sales order')
  })
})
