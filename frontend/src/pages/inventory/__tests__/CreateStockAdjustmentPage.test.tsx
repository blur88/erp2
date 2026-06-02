import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'

import CreateStockAdjustmentPage from '../CreateStockAdjustmentPage'

const replacementSearchTerm = 'B'

const { mockGet, mockNavigate, mockParams, mockFetchAdjustment, mockCreateAdjustment, mockUpdateAdjustment, mockShowError, mockShowSuccess } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockNavigate: vi.fn(),
  mockParams: vi.fn(() => ({})),
  mockFetchAdjustment: vi.fn(),
  mockCreateAdjustment: vi.fn(),
  mockUpdateAdjustment: vi.fn(),
  mockShowError: vi.fn(),
  mockShowSuccess: vi.fn(),
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
    showSuccess: mockShowSuccess,
    showError: mockShowError,
  }),
}))

vi.mock('@/services/api', () => ({
  ApiService: {
    get: mockGet,
    post: vi.fn(),
    put: vi.fn(),
  },
}))

vi.mock('@/store/api/inventoryApi', () => ({
  useLazyGetStockAdjustmentByNumberQuery: () => [mockFetchAdjustment],
  useCreateStockAdjustmentMutation: () => [mockCreateAdjustment, { isLoading: false }],
  useUpdateStockAdjustmentMutation: () => [mockUpdateAdjustment, { isLoading: false }],
}))

describe('CreateStockAdjustmentPage product search', { timeout: 60000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockParams.mockReturnValue({})
    mockCreateAdjustment.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({
        id: 'adj-new',
        adjustmentNumber: 'SA-001',
        itemCount: 1,
        status: 'draft',
      }),
    })
    mockUpdateAdjustment.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({
        id: 'adj-1',
        adjustmentNumber: 'SA-001',
      }),
    })

    mockGet.mockImplementation(async (url: string, config?: { params?: { search?: string } }) => {
      if (url.includes('/inventory/products/')) {
        const id = url.split('/').pop()

        return {
          data: {
            id,
            name: id === 'product-1' ? 'Alpha Widget' : 'Beta Gadget',
            stockQuantity: 10,
          },
        }
      }

      if (config?.params?.search?.startsWith(replacementSearchTerm)) {
        return { data: [{ id: 'product-2', name: 'Beta Gadget', stockQuantity: 5 }] }
      }

      return { data: [{ id: 'product-1', name: 'Alpha Widget', stockQuantity: 10 }] }
    })
  })

  it('renders PageHeader with title "Create Stock Adjustment" in create mode', () => {
    render(
      <BrowserRouter>
        <CreateStockAdjustmentPage />
      </BrowserRouter>
    )

    expect(screen.getByRole('heading', { name: 'Create Stock Adjustment' })).toBeInTheDocument()
  })

  it('replaces autocomplete options with only the latest search results', async () => {
    render(
      <BrowserRouter>
        <CreateStockAdjustmentPage />
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
        <CreateStockAdjustmentPage />
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

  it('shows a loading indicator while edit-mode adjustment is being fetched', async () => {
    let resolveAdjustment!: (v: any) => void
    const adjustmentPromise = new Promise((res) => { resolveAdjustment = res })

    mockParams.mockReturnValue({ adjustmentNumber: 'SA-001' })
    mockFetchAdjustment.mockReturnValue({ unwrap: () => adjustmentPromise })

    mockGet.mockImplementation(async () => {
      return { data: [{ id: 'product-1', name: 'Alpha Widget', stockQuantity: 10 }] }
    })

    render(
      <BrowserRouter>
        <CreateStockAdjustmentPage />
      </BrowserRouter>
    )

    expect(await screen.findByText('Loading stock adjustment...')).toBeInTheDocument()
    expect(screen.queryByRole('form')).not.toBeInTheDocument()

    resolveAdjustment({
      id: 'adj-1',
      adjustmentDate: '2026-03-01T00:00:00.000Z',
      notes: 'Recount',
      items: [],
    })

    await waitFor(() => {
      expect(screen.queryByText('Loading stock adjustment...')).not.toBeInTheDocument()
    })
  })

  it('keeps hydrated edit-mode product visible after search replaces options', async () => {
    mockParams.mockReturnValue({ adjustmentNumber: 'SA-001' })
    mockFetchAdjustment.mockReturnValue({
      unwrap: async () => ({
        id: 'adj-1',
        adjustmentDate: '2026-03-01T00:00:00.000Z',
        notes: 'Recount',
        items: [
          {
            productId: 'product-9',
            oldQuantity: 5,
            newQuantity: 8,
            difference: 3,
            product: { id: 'product-9', name: 'Hydrated Product', stockQuantity: 5 },
          },
        ],
      }),
    })

    mockGet.mockImplementation(async (url: string, config?: { params?: { search?: string } }) => {
      if (url.includes('/inventory/products/')) {
        const id = url.split('/').pop()

        return {
          data: {
            id,
            name: id === 'product-1' ? 'Alpha Widget' : 'Beta Gadget',
            stockQuantity: 10,
          },
        }
      }

      if (config?.params?.search?.startsWith(replacementSearchTerm)) {
        return { data: [{ id: 'product-2', name: 'Beta Gadget', stockQuantity: 5 }] }
      }

      return { data: [{ id: 'product-1', name: 'Alpha Widget', stockQuantity: 10 }] }
    })

    render(
      <BrowserRouter>
        <CreateStockAdjustmentPage />
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
})

describe('CreateStockAdjustmentPage submit', { timeout: 60000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockParams.mockReturnValue({})
    mockCreateAdjustment.mockReturnValue({
      unwrap: async () => ({
        id: 'adj-new',
        adjustmentNumber: 'SA-001',
        itemCount: 1,
        status: 'draft',
      }),
    })
    mockUpdateAdjustment.mockReturnValue({
      unwrap: async () => ({
        id: 'adj-1',
        adjustmentNumber: 'SA-001',
      }),
    })

    mockGet.mockImplementation(async (url: string) => {
      if (url.includes('/inventory/products/')) {
        return { data: { id: 'product-1', name: 'Alpha Widget', stockQuantity: 10 } }
      }

      return { data: [{ id: 'product-1', name: 'Alpha Widget', stockQuantity: 10 }] }
    })
  })

  it('calls createStockAdjustment mutation on submit in create mode', async () => {
    const user = userEvent.setup()

    render(
      <BrowserRouter>
        <CreateStockAdjustmentPage />
      </BrowserRouter>
    )

    const productInput = screen.getByPlaceholderText('Search by name or barcode...')
    await user.click(productInput)

    const listbox = await screen.findByRole('listbox')
    await user.click(within(listbox).getByText('Alpha Widget'))

    await waitFor(() => {
      expect(productInput).toHaveValue('Alpha Widget')
    })

    const newQtyInput = screen.getAllByRole('textbox').find(
      (element) => element !== productInput && (element as HTMLInputElement).value === '10'
    ) as HTMLInputElement

    await user.clear(newQtyInput)
    await user.type(newQtyInput, '15')
    await user.click(screen.getByRole('button', { name: /create adjustment/i }))

    await waitFor(() => {
      expect(mockCreateAdjustment).toHaveBeenCalledWith(
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ productId: 'product-1' }),
          ]),
        })
      )
    })
  })

  it('submits successfully when the selected product has negative stock', async () => {
    const user = userEvent.setup()

    mockGet.mockImplementation(async (url: string) => {
      if (url.includes('/inventory/products/')) {
        return { data: { id: 'product-neg', name: 'Overdrawn Widget', stockQuantity: -5 } }
      }
      return { data: [{ id: 'product-neg', name: 'Overdrawn Widget', stockQuantity: -5 }] }
    })

    render(
      <BrowserRouter>
        <CreateStockAdjustmentPage />
      </BrowserRouter>
    )

    const productInput = screen.getByPlaceholderText('Search by name or barcode...')
    await user.click(productInput)

    const listbox = await screen.findByRole('listbox')
    await user.click(within(listbox).getByText('Overdrawn Widget'))

    await waitFor(() => {
      expect(productInput).toHaveValue('Overdrawn Widget')
    })

    const newQtyInput = screen.getByTestId('items.0.newQuantity') as HTMLInputElement

    fireEvent.change(newQtyInput, { target: { value: '10' } })
    await user.click(screen.getByRole('button', { name: /create adjustment/i }))

    await waitFor(() => {
      expect(mockCreateAdjustment).toHaveBeenCalledWith(
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ productId: 'product-neg', oldQuantity: -5, newQuantity: 10 }),
          ]),
        })
      )
    })
  })

  it('calls updateStockAdjustment mutation on submit in edit mode', async () => {
    const user = userEvent.setup()
    mockParams.mockReturnValue({ adjustmentNumber: 'SA-001' })
    mockFetchAdjustment.mockReturnValue({
      unwrap: async () => ({
        id: 'adj-1',
        adjustmentNumber: 'SA-001',
        adjustmentDate: '2026-03-01T00:00:00.000Z',
        notes: 'Recount',
        items: [
          {
            productId: 'product-1',
            oldQuantity: 10,
            newQuantity: 10,
            difference: 0,
            product: { id: 'product-1', name: 'Alpha Widget', stockQuantity: 10 },
          },
        ],
      }),
    })

    render(
      <BrowserRouter>
        <CreateStockAdjustmentPage />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(screen.queryByText('Loading stock adjustment...')).not.toBeInTheDocument()
    })

    const newQtyInput = screen.getAllByRole('textbox').find(
      (element) => (element as HTMLInputElement).value === '10'
    ) as HTMLInputElement

    await user.clear(newQtyInput)
    await user.type(newQtyInput, '20')
    await user.click(screen.getByRole('button', { name: /update adjustment/i }))

    await waitFor(() => {
      expect(mockUpdateAdjustment).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'adj-1',
          data: expect.objectContaining({
            items: expect.arrayContaining([
              expect.objectContaining({ productId: 'product-1' }),
            ]),
          }),
        })
      )
    })
  })

  it('calls showError when form is submitted with no product selected', async () => {
    const user = userEvent.setup()

    render(
      <BrowserRouter>
        <CreateStockAdjustmentPage />
      </BrowserRouter>
    )

    await user.click(screen.getByRole('button', { name: /create adjustment/i }))

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith(expect.stringMatching(/fix.*error|error.*fix/i))
    })
  })

  it('shows helper text under the product field when submitted with no product selected', async () => {
    const user = userEvent.setup()

    render(
      <BrowserRouter>
        <CreateStockAdjustmentPage />
      </BrowserRouter>
    )

    await user.click(screen.getByRole('button', { name: /create adjustment/i }))

    await waitFor(() => {
      expect(screen.getByText('Product is required')).toBeInTheDocument()
    })
  })

  it('navigates back with the edited adjustment id in the saId query param so the list can highlight it', async () => {
    const user = userEvent.setup()
    mockParams.mockReturnValue({ adjustmentNumber: 'SA-001' })
    mockFetchAdjustment.mockReturnValue({
      unwrap: async () => ({
        id: 'adj-1',
        adjustmentNumber: 'SA-001',
        adjustmentDate: '2026-03-01T00:00:00.000Z',
        notes: 'Recount',
        items: [
          {
            productId: 'product-1',
            oldQuantity: 10,
            newQuantity: 10,
            difference: 0,
            product: { id: 'product-1', name: 'Alpha Widget', stockQuantity: 10 },
          },
        ],
      }),
    })

    render(
      <BrowserRouter>
        <CreateStockAdjustmentPage />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(screen.queryByText('Loading stock adjustment...')).not.toBeInTheDocument()
    })

    const newQtyInput = screen.getAllByRole('textbox').find(
      (element) => (element as HTMLInputElement).value === '10'
    ) as HTMLInputElement

    await user.clear(newQtyInput)
    await user.type(newQtyInput, '20')
    await user.click(screen.getByRole('button', { name: /update adjustment/i }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        '/inventory/stock-adjustments?highlight=adj-1'
      )
    })
  })
})
