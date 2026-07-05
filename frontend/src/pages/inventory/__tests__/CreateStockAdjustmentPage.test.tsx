import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'

import CreateStockAdjustmentPage from '../CreateStockAdjustmentPage'
import { formatCurrency } from '@/utils/currency'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'

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

const renderPage = () =>
  render(
    <BrowserRouter>
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <CreateStockAdjustmentPage />
      </LocalizationProvider>
    </BrowserRouter>,
  )

describe('CreateStockAdjustmentPage', { timeout: 30000 }, () => {
  beforeEach(() => {
    localStorage.clear()
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
    renderPage()
    expect(screen.getByRole('heading', { name: /create stock adjustment/i })).toBeInTheDocument()
  })

  it('renders the Adjustment Date in the regional format (DD/MM/YYYY)', async () => {
    localStorage.setItem('dateFormat', 'DD/MM/YYYY')
    mockParams.mockReturnValue({ id: 'adj-1' })
    mockAdjustmentQuery.mockReturnValue({
      data: {
        id: 'adj-1',
        adjustmentNumber: 'SA-25-0042',
        adjustmentDate: '2026-07-01',
        notes: '',
        items: [],
      },
      isLoading: false,
    })
    renderPage()
    await waitFor(() => {
      const dateField = screen.getByDisplayValue('01/07/2026')
      expect(dateField).toBeInTheDocument()
    })
  })

  it('requests only stocked products (excludes services)', () => {
    renderPage()
    expect(mockProductsQuery).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: true, type: 'Stocked Product' }),
    )
  })

  describe('product exclusion', () => {
    it('hides an already-selected product from other rows', async () => {
      const user = userEvent.setup()
      renderPage()

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

      // Alpha Widget (taken in row 1) is absent; other products still present
      expect(within(listbox2).queryByText('Alpha Widget')).not.toBeInTheDocument()
      expect(within(listbox2).getByText('Beta Gadget')).toBeInTheDocument()
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
      renderPage()

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

  describe('clear Qty Change (#864)', () => {
    // Products come from the beforeEach default (stableAllProducts, which
    // already includes 'Low Stock Widget'). Don't re-mock products after render:
    // the useGetProductsQuery hook already ran during renderPage().
    const selectFirstProduct = async (user: ReturnType<typeof userEvent.setup>) => {
      const input = screen.getByPlaceholderText('Search product...')
      await user.click(input)
      const listbox = await screen.findByRole('listbox')
      await user.click(within(listbox).getByText('Low Stock Widget'))
      await waitFor(() => expect(input).toHaveValue('Low Stock Widget'))
    }

    it('lets the user clear the field to empty instead of snapping back to 0', async () => {
      const user = userEvent.setup()
      renderPage()
      await selectFirstProduct(user)

      const diffInput = screen.getByTestId('items.0.difference') as HTMLInputElement
      fireEvent.change(diffInput, { target: { value: '5' } })
      await waitFor(() => expect(diffInput.value).toBe('5'))

      fireEvent.change(diffInput, { target: { value: '' } })
      await waitFor(() => expect(diffInput.value).toBe(''))
    })

    it('accepts a lone minus without breaking the row (smoke test)', async () => {
      const user = userEvent.setup()
      renderPage()
      await selectFirstProduct(user)

      const diffInput = screen.getByTestId('items.0.difference') as HTMLInputElement
      fireEvent.change(diffInput, { target: { value: '-' } })
      await waitFor(() => expect(diffInput.value).toBe('-'))

      // Weak smoke test only: it asserts the row does not render the literal
      // string "NaN". It does NOT prove step 6's guard, because formatCurrency
      // maps NaN -> "RM 0.00", so the total cell reads "RM 0.00" whether the
      // code uses Math.abs('-') (NaN) or Math.abs(Number('-') || 0) (0). The
      // real protection for step 6 is the type-check in Step 9: Math.abs('-')
      // is a TS error under the `number | '' | '-'` type, forcing the guard.
      const row = diffInput.closest('tr') as HTMLElement
      expect(within(row).queryByText(/NaN/)).not.toBeInTheDocument()
    })

    it('blocks submit when Qty Change is left empty', async () => {
      const user = userEvent.setup()
      renderPage()
      await selectFirstProduct(user)

      const diffInput = screen.getByTestId('items.0.difference') as HTMLInputElement
      fireEvent.change(diffInput, { target: { value: '' } })
      await waitFor(() => expect(diffInput.value).toBe(''))

      await user.click(screen.getByRole('button', { name: /create adjustment/i }))

      await waitFor(() => {
        expect(screen.getByText(/quantity change is required/i)).toBeInTheDocument()
      })
      // Validation blocked submit — mutation never fired.
      expect(mockCreateAdjustment).not.toHaveBeenCalled()
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

      renderPage()

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

      renderPage()

      await waitFor(() => {
        expect(mockAdjustmentQuery).toHaveBeenCalledWith('abc-123')
      })

      await waitFor(() => {
        expect(screen.getByText(/edit stock adjustment/i)).toBeInTheDocument()
      })
    })
  })

  it('renders a read-only Adjustment Number field in create mode', () => {
    renderPage()
    const field = screen.getByLabelText(/adjustment number/i) as HTMLInputElement
    expect(field).toBeInTheDocument()
    expect(field).toHaveAttribute('readonly')
  })

  it('shows the SA-YY-NNNN preview from document number settings in create mode', () => {
    mockDocNumberSettings.mockReturnValue({
      data: {
        configurations: [
          { documentName: 'Stock Adjustment', prefix: 'SA', nextNumber: 7, paddingDigits: 4 },
        ],
      },
      isLoading: false,
    })
    renderPage()
    const yy = String(new Date().getFullYear() % 100).padStart(2, '0')
    const field = screen.getByLabelText(/adjustment number/i) as HTMLInputElement
    expect(field.value).toBe(`SA-${yy}-0007`)
  })

  it('falls back to Auto-generated when settings are unavailable', () => {
    mockDocNumberSettings.mockReturnValue({ data: undefined, isLoading: false })
    renderPage()
    const field = screen.getByLabelText(/adjustment number/i) as HTMLInputElement
    expect(field.value).toBe('Auto-generated')
  })

  it('shows the loaded adjustmentNumber in edit mode', () => {
    mockParams.mockReturnValue({ id: 'adj-1' })
    mockAdjustmentQuery.mockReturnValue({
      data: {
        id: 'adj-1',
        adjustmentNumber: 'SA-25-0042',
        adjustmentDate: '2026-07-01',
        notes: '',
        items: [],
      },
      isLoading: false,
    })
    renderPage()
    const field = screen.getByLabelText(/adjustment number/i) as HTMLInputElement
    expect(field.value).toBe('SA-25-0042')
  })

  describe('product clear (#857)', () => {
    it('keeps the row empty after clearing a selected product', async () => {
      const user = userEvent.setup()
      renderPage()

      const input = screen.getByPlaceholderText('Search product...')
      await user.click(input)
      const listbox = await screen.findByRole('listbox')
      await user.click(within(listbox).getByText('Alpha Widget'))

      await waitFor(() => {
        expect(input).toHaveValue('Alpha Widget')
      })
      // Product-derived fields seeded (stockQuantity: 10, baseCost: 5)
      expect(screen.getByTestId('liveStock-0')).toHaveTextContent('10')

      // Enter a non-zero qty change BEFORE clearing. This makes the Unit Cost assertion
      // discriminating: if unitCost is NOT reset (stale 5), Unit Cost cell shows
      // formatCurrency(5) and Total shows formatCurrency(15) — neither is formatCurrency(0),
      // so the assertion below fails. Only a real unitCost reset produces a zero-currency cell.
      const diffInput = screen.getByTestId('items.0.difference') as HTMLInputElement
      fireEvent.change(diffInput, { target: { value: '3' } })
      await waitFor(() => expect(diffInput.value).toBe('3'))

      const zeroCurrency = formatCurrency(0)
      const staleUnitCost = formatCurrency(5)

      // Clear via the Autocomplete clear (X) button, then blur the field
      const clearBtn = screen.getByTitle('Clear')
      await user.click(clearBtn)
      fireEvent.blur(input)

      // No snap-back: re-query the input after blur and assert the product did not come back
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search product...')).toHaveValue('')
      })
      // liveStock reset
      expect(screen.getByTestId('liveStock-0')).toHaveTextContent('0')
      // unitCost reset — scope to THIS row so an unrelated formatCurrency(5) elsewhere can't
      // mask a failure to reset. Stale unit cost gone from the row; a zero-currency cell present.
      const row = diffInput.closest('tr') as HTMLElement
      expect(within(row).queryByText(staleUnitCost)).not.toBeInTheDocument()
      expect(within(row).getAllByText(zeroCurrency).length).toBeGreaterThan(0)
      // qty change preserved
      expect(diffInput.value).toBe('3')
    })

    it('blocks save for a lone cleared row instead of dropping it', async () => {
      const user = userEvent.setup()
      renderPage()

      const input = screen.getByPlaceholderText('Search product...')
      await user.click(input)
      const listbox = await screen.findByRole('listbox')
      await user.click(within(listbox).getByText('Alpha Widget'))
      await waitFor(() => expect(input).toHaveValue('Alpha Widget'))

      const diffInput = screen.getByTestId('items.0.difference') as HTMLInputElement
      fireEvent.change(diffInput, { target: { value: '5' } })

      await user.click(screen.getByTitle('Clear'))
      await waitFor(() => expect(input).toHaveValue(''))
      // qty change survives the product clear
      expect(diffInput.value).toBe('5')

      await user.click(screen.getByRole('button', { name: /create adjustment/i }))

      // Validation blocks: mutation never fires, required error surfaces
      await waitFor(() => {
        expect(screen.getByText(/product is required/i)).toBeInTheDocument()
      })
      expect(mockCreateAdjustment).not.toHaveBeenCalled()
    })
  })

  describe('Qty After column', () => {
    it('shows Qty After = current stock + qty change', async () => {
      const user = userEvent.setup()
      renderPage()

      const input = screen.getByPlaceholderText('Search product...')
      await user.click(input)
      const listbox = await screen.findByRole('listbox')
      await user.click(within(listbox).getByText('Alpha Widget'))

      await waitFor(() => {
        expect(input).toHaveValue('Alpha Widget')
      })

      const diff = screen.getByTestId('items.0.difference')
      fireEvent.change(diff, { target: { value: '-3' } })
      await waitFor(() => {
        expect(screen.getByTestId('qtyAfter-0')).toHaveTextContent('7')
      })
    })
  })

  describe('section alignment (#858)', () => {
    it('renders PO/SO-aligned section headers', () => {
      renderPage()
      expect(screen.getByRole('heading', { name: /^adjustment info$/i })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /^line items$/i })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /^additional$/i })).toBeInTheDocument()
    })
  })
})
