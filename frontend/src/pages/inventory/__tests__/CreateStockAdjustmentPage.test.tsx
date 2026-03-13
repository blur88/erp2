import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'

import CreateStockAdjustmentPage from '../CreateStockAdjustmentPage'

const replacementSearchTerm = 'B'

const { mockGet, mockParams } = vi.hoisted(() => ({
  mockGet: vi.fn(),
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

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}))

vi.mock('@/services/api', () => ({
  ApiService: {
    get: mockGet,
    post: vi.fn(),
    put: vi.fn(),
  },
}))

describe('CreateStockAdjustmentPage product search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockParams.mockReturnValue({})

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
        return {
          data: {
            data: [{ id: 'product-2', name: 'Beta Gadget', stockQuantity: 5 }],
          },
        }
      }

      return {
        data: {
          data: [{ id: 'product-1', name: 'Alpha Widget', stockQuantity: 10 }],
        },
      }
    })
  })

  it('replaces autocomplete options with only the latest search results', async () => {
    const user = userEvent.setup()

    render(
      <BrowserRouter>
        <CreateStockAdjustmentPage />
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
        params: { isActive: true, search: replacementSearchTerm },
      })
    })

    await waitFor(() => {
      expect(firstProductInput).toHaveValue('Alpha Widget')
    })
  })

  it('shows a loading indicator while edit-mode adjustment is being fetched', async () => {
    let resolveAdjustment!: (v: any) => void
    const adjustmentPromise = new Promise((res) => { resolveAdjustment = res })

    mockParams.mockReturnValue({ id: 'adj-1' })

    mockGet.mockImplementation(async (url: string) => {
      if (url === '/inventory/stock-adjustments/adj-1') {
        return adjustmentPromise
      }
      return { data: { data: [{ id: 'product-1', name: 'Alpha Widget', stockQuantity: 10 }] } }
    })

    render(
      <BrowserRouter>
        <CreateStockAdjustmentPage />
      </BrowserRouter>
    )

    expect(await screen.findByText('Loading stock adjustment...')).toBeInTheDocument()
    expect(screen.queryByRole('form')).not.toBeInTheDocument()

    resolveAdjustment({
      data: {
        id: 'adj-1',
        adjustmentDate: '2026-03-01T00:00:00.000Z',
        reason: 'Recount',
        items: [],
      },
    })

    await waitFor(() => {
      expect(screen.queryByText('Loading stock adjustment...')).not.toBeInTheDocument()
    })
  })

  it('keeps hydrated edit-mode product visible after search replaces options', async () => {
    const user = userEvent.setup()
    mockParams.mockReturnValue({ id: 'adj-1' })

    mockGet.mockImplementation(async (url: string, config?: { params?: { search?: string } }) => {
      if (url === '/inventory/stock-adjustments/adj-1') {
        return {
          data: {
            id: 'adj-1',
            adjustmentDate: '2026-03-01T00:00:00.000Z',
            reason: 'Recount',
            items: [
              {
                productId: 'product-9',
                oldQuantity: 5,
                newQuantity: 8,
                difference: 3,
                product: { id: 'product-9', name: 'Hydrated Product', stockQuantity: 5 },
              },
            ],
          },
        }
      }

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
        return {
          data: {
            data: [{ id: 'product-2', name: 'Beta Gadget', stockQuantity: 5 }],
          },
        }
      }

      return {
        data: {
          data: [{ id: 'product-1', name: 'Alpha Widget', stockQuantity: 10 }],
        },
      }
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
