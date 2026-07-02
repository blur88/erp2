import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'

import CreateStockAdjustmentPage from '../CreateStockAdjustmentPage'

const {
  mockNavigate,
  mockParams,
  mockSearchParams,
  mockCreateAdjustment,
  mockUpdateAdjustment,
  mockShowError,
  mockShowSuccess,
  mockProductsQuery,
  mockAdjustmentQuery,
  mockDocNumberSettings,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockParams: vi.fn(() => ({})),
  mockSearchParams: vi.fn(() => [new URLSearchParams(), vi.fn()]),
  mockCreateAdjustment: vi.fn(),
  mockUpdateAdjustment: vi.fn(),
  mockShowError: vi.fn(),
  mockShowSuccess: vi.fn(),
  mockProductsQuery: vi.fn(),
  mockAdjustmentQuery: vi.fn(),
  mockDocNumberSettings: vi.fn(),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => mockParams(),
    useSearchParams: () => mockSearchParams(),
    useBlocker: () => ({ state: 'idle', proceed: vi.fn(), reset: vi.fn() }),
  }
})

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}))

const stableProductsEmpty = { data: { data: [], total: 0 }, isLoading: false }
const stableAdjNull = { data: null, isLoading: false, isError: false }

vi.mock('@/store/api/inventoryApi', () => ({
  useGetProductsQuery: (params?: any) =>
    (mockProductsQuery as any)(params) ?? stableProductsEmpty,
  useGetStockAdjustmentQuery: (id?: string) =>
    (mockAdjustmentQuery as any)(id) ?? stableAdjNull,
  useCreateStockAdjustmentMutation: () => [mockCreateAdjustment, { isLoading: false }],
  useUpdateStockAdjustmentMutation: () => [mockUpdateAdjustment, { isLoading: false }],
}))

vi.mock('@/store/api/settingsApi', () => ({
  useGetDocumentNumberSettingsQuery: () => mockDocNumberSettings(),
}))

const baseProduct1 = Object.freeze({
  id: 'p1', name: 'Alpha Widget', stockQuantity: 10, baseCost: 5,
})
const baseProduct2 = Object.freeze({
  id: 'p2', name: 'Beta Gadget', stockQuantity: 5, baseCost: 3,
})
const baseProduct3 = Object.freeze({
  id: 'p3', name: 'Low Stock Widget', stockQuantity: 3, baseCost: 8,
})

const stableAllProducts = Object.freeze({
  data: { data: [baseProduct1, baseProduct2, baseProduct3], total: 3 },
  isLoading: false,
})

describe('CreateStockAdjustmentPage', { timeout: 30000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockParams.mockReturnValue({})
    mockSearchParams.mockReturnValue([new URLSearchParams(), vi.fn()])
    mockProductsQuery.mockReturnValue(stableAllProducts)
    mockAdjustmentQuery.mockReturnValue(stableAdjNull)
    mockDocNumberSettings.mockReturnValue({ data: undefined, isLoading: false })
    mockCreateAdjustment.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({ id: 'adj-new', adjustmentNumber: 'SA-001' }),
    })
    mockUpdateAdjustment.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({ id: 'adj-1', adjustmentNumber: 'SA-001' }),
    })
  })

  it('renders the page header in create mode', () => {
    render(
      <BrowserRouter>
        <CreateStockAdjustmentPage />
      </BrowserRouter>,
    )
    expect(screen.getByRole('heading', { name: /create stock adjustment/i })).toBeInTheDocument()
  })

  describe('duplicate product guard', () => {
    it('blocks adding a product already in the items table', async () => {
      const user = userEvent.setup()
      render(
        <BrowserRouter>
          <CreateStockAdjustmentPage />
        </BrowserRouter>,
      )

      const inputs = screen.getAllByPlaceholderText('Search product...')
      await user.click(inputs[0])
      const listbox = await screen.findByRole('listbox')
      await user.click(within(listbox).getByText('Alpha Widget'))

      await waitFor(() => {
        expect(inputs[0]).toHaveValue('Alpha Widget')
      })

      await user.click(screen.getByRole('button', { name: /add item/i }))

      const inputs2 = screen.getAllByPlaceholderText('Search product...')
      await user.click(inputs2[1])
      const listbox2 = await screen.findByRole('listbox')
      await user.click(within(listbox2).getByText('Alpha Widget'))

      await waitFor(() => {
        expect(screen.getByText(/already in the items list/i)).toBeInTheDocument()
      })
    })
  })

  describe('negative stock block', () => {
    it('disables Save when a row would drive stock below zero', async () => {
      const user = userEvent.setup()
      const stableSingleProduct = Object.freeze({
        data: { data: [baseProduct3], total: 1 },
        isLoading: false,
      })
      mockProductsQuery.mockReturnValue(stableSingleProduct)
      render(
        <BrowserRouter>
          <CreateStockAdjustmentPage />
        </BrowserRouter>,
      )

      const input = screen.getByPlaceholderText('Search product...')
      await user.click(input)
      const listbox = await screen.findByRole('listbox')
      await user.click(within(listbox).getByText('Low Stock Widget'))

      await waitFor(() => {
        expect(input).toHaveValue('Low Stock Widget')
      })

      const diffInput = screen.getByTestId('items.0.difference') as HTMLInputElement
      fireEvent.change(diffInput, { target: { value: '-5' } })

      await waitFor(() => {
        expect(diffInput.value).toBe('-5')
      })

      await waitFor(() => {
        expect(screen.getByText(/negative stock/i)).toBeInTheDocument()
      })

      const saveButton = screen.getByRole('button', { name: /create adjustment/i })
      expect(saveButton).toBeDisabled()
    })
  })

  describe('revert prefill', () => {
    it('prefills negative qty changes from a completed source when ?revertFrom is set', async () => {
      mockSearchParams.mockReturnValue([new URLSearchParams('revertFrom=source-1'), vi.fn()])

      const stableRevertSource = Object.freeze({
        data: {
          id: 'source-1',
          status: 'completed',
          items: [
            { productId: 'p1', difference: 10, unitCost: 5, oldQuantity: 20, newQuantity: 30 },
          ],
        },
        isLoading: false,
        isError: false,
      })
      mockAdjustmentQuery.mockImplementation((id: string) => {
        if (id === 'source-1') return stableRevertSource
        return stableAdjNull
      })

      const stableRevertProducts = Object.freeze({
        data: { data: [baseProduct1], total: 1 },
        isLoading: false,
      })
      mockProductsQuery.mockReturnValue(stableRevertProducts)

      render(
        <BrowserRouter>
          <CreateStockAdjustmentPage />
        </BrowserRouter>,
      )

      await waitFor(() => {
        const diffInput = screen.getByTestId('items.0.difference') as HTMLInputElement
        expect(diffInput.value).toBe('-10')
      })
    })
  })

  describe('edit mode route contract', () => {
    it('loads adjustment via useGetStockAdjustmentQuery(id) using the route :id param', async () => {
      mockParams.mockReturnValue({ id: 'abc-123' })

      const stableEditData = Object.freeze({
        data: {
          id: 'abc-123',
          adjustmentNumber: 'SA-001',
          adjustmentDate: '2026-03-15T00:00:00.000Z',
          notes: 'Test',
          items: [
            {
              productId: 'p1',
              difference: 5,
              unitCost: 5,
              oldQuantity: 10,
              newQuantity: 15,
            },
          ],
        },
        isLoading: false,
        isError: false,
      })
      mockAdjustmentQuery.mockImplementation((id: string) => {
        if (id === 'abc-123') return stableEditData
        return stableAdjNull
      })

      render(
        <BrowserRouter>
          <CreateStockAdjustmentPage />
        </BrowserRouter>,
      )

      await waitFor(() => {
        expect(mockAdjustmentQuery).toHaveBeenCalledWith('abc-123')
      })

      await waitFor(() => {
        expect(screen.getByText(/edit stock adjustment/i)).toBeInTheDocument()
      })
    })
  })
})
