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

  describe('submitted payload', () => {
    it('omits newQuantity and sends difference on create', async () => {
      const user = userEvent.setup()
      renderPage()

      const input = screen.getByPlaceholderText('Search product...')
      await user.click(input)
      const listbox = await screen.findByRole('listbox')
      await user.click(within(listbox).getByText('Alpha Widget'))
      await waitFor(() => {
        expect(input).toHaveValue('Alpha Widget')
      })

      const diffInput = screen.getByTestId('items.0.difference') as HTMLInputElement
      fireEvent.change(diffInput, { target: { value: '10' } })
      await waitFor(() => {
        expect(diffInput.value).toBe('10')
      })

      await user.click(screen.getByRole('button', { name: /create adjustment/i }))

      await waitFor(() => {
        expect(mockCreateAdjustment).toHaveBeenCalledTimes(1)
      })
      const payload = mockCreateAdjustment.mock.calls[0][0] as any
      expect(payload.items[0]).not.toHaveProperty('newQuantity')
      expect(payload.items[0]).toMatchObject({
        productId: 'p1',
        oldQuantity: 10,
        difference: 10,
      })
    })

    it('omits newQuantity on update', async () => {
      mockParams.mockReturnValue({ id: 'abc-123' })
      mockAdjustmentQuery.mockImplementation((id: string) =>
        id === 'abc-123'
          ? {
              data: {
                id: 'abc-123',
                adjustmentNumber: 'SA-001',
                adjustmentDate: '2026-03-15T00:00:00.000Z',
                notes: '',
                items: [{
                  product: { id: 'p1', name: 'Alpha Widget', barcode: 'A1' },
                  difference: 5, unitCost: 5, oldQuantity: 10, newQuantity: 15, liveStock: 10,
                }],
              },
              isLoading: false,
              isError: false,
            }
          : stableAdjNull,
      )

      const user = userEvent.setup()
      renderPage()
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search product...')).toHaveValue('Alpha Widget')
      })

      const diffInput = screen.getByTestId('items.0.difference') as HTMLInputElement
      fireEvent.change(diffInput, { target: { value: '4' } })
      await waitFor(() => {
        expect(diffInput.value).toBe('4')
      })

      await user.click(screen.getByRole('button', { name: /update adjustment/i }))

      await waitFor(() => {
        expect(mockUpdateAdjustment).toHaveBeenCalledTimes(1)
      })
      const { data } = mockUpdateAdjustment.mock.calls[0][0] as any
      expect(data.items[0]).not.toHaveProperty('newQuantity')
      expect(data.items[0].difference).toBe(4)
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

  // Row-level error-placement regression test for the line-items field array.
  //
  // Scope: this pins where a line-item validation error RENDERS -- on the row
  // that owns it, versus nested under the field-array root Alert. It is not
  // tied to any dependency version.
  //
  // Why it exists: the sibling test 'blocks submit when Qty Change is left
  // empty' asserts the message with a bare screen.getByText, which finds it
  // anywhere on the page and therefore passes under EITHER placement. Nothing
  // else in this file distinguishes a per-row error from a page-level one, so
  // a regression that relocated line-item errors to the root would go unnoticed.
  describe('line-item error placement', () => {
    const selectProductInRow = async (
      user: ReturnType<typeof userEvent.setup>,
      rowIndex: number,
      productName: string,
    ) => {
      const inputs = screen.getAllByPlaceholderText('Search product...')
      const input = inputs[rowIndex]
      await user.click(input)
      const listbox = await screen.findByRole('listbox')
      await user.click(within(listbox).getByText(productName))
      await waitFor(() => expect(input).toHaveValue(productName))
    }

    it('renders an invalid line-item quantity error on its own row, not under the field-array root', async () => {
      const user = userEvent.setup()
      renderPage()

      // Two rows, so "on its own row" is a real claim: a single-row form
      // cannot distinguish per-row placement from page-level placement.
      await selectProductInRow(user, 0, 'Alpha Widget')
      await user.click(screen.getByRole('button', { name: /add item/i }))
      await selectProductInRow(user, 1, 'Beta Gadget')

      const row0Input = screen.getByTestId('items.0.difference') as HTMLInputElement
      const row1Input = screen.getByTestId('items.1.difference') as HTMLInputElement

      // Row 0 stays valid; only row 1 violates notOneOf([0]).
      fireEvent.change(row0Input, { target: { value: '5' } })
      await waitFor(() => expect(row0Input.value).toBe('5'))
      fireEvent.change(row1Input, { target: { value: '0' } })
      await waitFor(() => expect(row1Input.value).toBe('0'))

      await user.click(screen.getByRole('button', { name: /create adjustment/i }))

      const row1 = row1Input.closest('tr') as HTMLElement
      await waitFor(() => {
        expect(
          within(row1).getByText(/quantity change cannot be zero/i),
        ).toBeInTheDocument()
      })

      // The error belongs to row 1 alone — it must not leak onto the valid row.
      const row0 = row0Input.closest('tr') as HTMLElement
      expect(
        within(row0).queryByText(/quantity change cannot be zero/i),
      ).not.toBeInTheDocument()

      // The field-array root Alert (CreateStockAdjustmentPage.tsx) renders only
      // when errors.items is a non-array (root) error. It must stay absent when
      // the only failure belongs to a specific row.
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()

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

  describe('edit shows product name from nested DTO (#875)', () => {
    const editWith = (item: any) => {
      mockParams.mockReturnValue({ id: 'abc-123' })
      mockAdjustmentQuery.mockImplementation((id: string) =>
        id === 'abc-123'
          ? {
              data: {
                id: 'abc-123',
                adjustmentNumber: 'SA-001',
                adjustmentDate: '2026-03-15T00:00:00.000Z',
                notes: '',
                items: [item],
              },
              isLoading: false,
              isError: false,
            }
          : stableAdjNull,
      )
    }

    it('restores the product name when the DTO item is nested-only (product.id, no flat productId)', async () => {
      editWith({
        product: { id: 'p1', name: 'Alpha Widget', barcode: 'A1' },
        difference: 5, unitCost: 5, oldQuantity: 10, newQuantity: 15, liveStock: 10,
      })
      renderPage()
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search product...')).toHaveValue('Alpha Widget')
      })
    })

    it('still shows the name when the restored product is absent from the products query', async () => {
      editWith({
        product: { id: 'gone', name: 'Retired Widget', barcode: 'Z9' },
        difference: 2, unitCost: 7, oldQuantity: 4, newQuantity: 6, liveStock: 4,
      })
      renderPage()
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search product...')).toHaveValue('Retired Widget')
      })
    })

    it('preserves liveStock/unitCost for a fallback-only product (no zeroing)', async () => {
      editWith({
        product: { id: 'gone', name: 'Retired Widget', barcode: 'Z9' },
        difference: 2, unitCost: 7, oldQuantity: 4, newQuantity: 6, liveStock: 4,
      })
      renderPage()
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search product...')).toHaveValue('Retired Widget')
      })
      expect(screen.getByTestId('liveStock-0')).toHaveTextContent('4')
      const row = (screen.getByTestId('items.0.difference') as HTMLInputElement).closest('tr') as HTMLElement
      expect(within(row).getByText(formatCurrency(7))).toBeInTheDocument()
    })

    it('leaves the row invalid (required) when the DTO item has no product at all', async () => {
      editWith({ difference: 2, unitCost: 7, oldQuantity: 4, newQuantity: 6, liveStock: 4 })
      renderPage()
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search product...')).toHaveValue('')
      })
      await userEvent.click(screen.getByRole('button', { name: /update adjustment/i }))
      await waitFor(() => {
        expect(screen.getByText(/product is required/i)).toBeInTheDocument()
      })
    })
  })

  describe('revert prefill from nested-only DTO (#875)', () => {
    it('groups revert items by nested product.id and shows the product name', async () => {
      mockSearchParams.mockReturnValue([new URLSearchParams('revertFrom=source-1'), vi.fn()])
      mockAdjustmentQuery.mockImplementation((id: string) =>
        id === 'source-1'
          ? {
              data: {
                id: 'source-1',
                status: 'completed',
                items: [
                  { product: { id: 'p1', name: 'Alpha Widget', barcode: 'A1' },
                    difference: 10, unitCost: 5, oldQuantity: 20, newQuantity: 30, liveStock: 30 },
                ],
              },
              isLoading: false,
              isError: false,
            }
          : stableAdjNull,
      )
      renderPage()
      await waitFor(() => {
        const diffInput = screen.getByTestId('items.0.difference') as HTMLInputElement
        expect(diffInput.value).toBe('-10')
      })
      expect(screen.getByPlaceholderText('Search product...')).toHaveValue('Alpha Widget')
    })

    it('prefills a revert product that is absent from the products query (empty products list)', async () => {
      mockSearchParams.mockReturnValue([new URLSearchParams('revertFrom=source-1'), vi.fn()])
      mockAdjustmentQuery.mockImplementation((id: string) =>
        id === 'source-1'
          ? {
              data: {
                id: 'source-1',
                status: 'completed',
                items: [
                  { product: { id: 'gone', name: 'Retired Widget', barcode: 'Z9' },
                    difference: 10, unitCost: 5, oldQuantity: 20, newQuantity: 30, liveStock: 30 },
                ],
              },
              isLoading: false,
              isError: false,
            }
          : stableAdjNull,
      )
      mockProductsQuery.mockReturnValue(stableProductsEmpty)
      renderPage()
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search product...')).toHaveValue('Retired Widget')
      })
      const diffInput = screen.getByTestId('items.0.difference') as HTMLInputElement
      expect(diffInput.value).toBe('-10')
      expect(screen.getByTestId('liveStock-0')).toHaveTextContent('30')
    })
  })

  describe('live stock refresh on refetch (issue #873)', () => {
    it('syncs Current Stock from a same-id refetch while preserving the entered qty change', async () => {
      mockParams.mockReturnValue({ id: 'abc-123' })

      const ui = (
        <BrowserRouter>
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <CreateStockAdjustmentPage />
          </LocalizationProvider>
        </BrowserRouter>
      )

      const initialEdit = {
        data: {
          id: 'abc-123',
          adjustmentNumber: 'SA-001',
          adjustmentDate: '2026-03-15T00:00:00.000Z',
          notes: '',
          items: [
            { productId: 'p1', difference: 0, unitCost: 5, oldQuantity: 10, newQuantity: 10, liveStock: 10 },
          ],
        },
        isLoading: false,
        isError: false,
      }
      mockAdjustmentQuery.mockImplementation((id: string) =>
        id === 'abc-123' ? initialEdit : stableAdjNull,
      )

      const { rerender } = render(ui)

      await waitFor(() => {
        expect(screen.getByTestId('liveStock-0')).toHaveTextContent('10')
      })

      const diffInput = screen.getByTestId('items.0.difference') as HTMLInputElement
      await userEvent.clear(diffInput)
      await userEvent.type(diffInput, '7')
      await waitFor(() => expect(diffInput.value).toBe('7'))

      const refetchedEdit = {
        data: {
          ...initialEdit.data,
          items: [
            { productId: 'p1', difference: 0, unitCost: 5, oldQuantity: 10, newQuantity: 10, liveStock: 25 },
          ],
        },
        isLoading: false,
        isError: false,
      }
      mockAdjustmentQuery.mockImplementation((id: string) =>
        id === 'abc-123' ? refetchedEdit : stableAdjNull,
      )
      rerender(
        <BrowserRouter>
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <CreateStockAdjustmentPage />
          </LocalizationProvider>
        </BrowserRouter>,
      )

      await waitFor(() => {
        expect(screen.getByTestId('liveStock-0')).toHaveTextContent('25')
      })
      expect((screen.getByTestId('items.0.difference') as HTMLInputElement).value).toBe('7')
      expect(screen.getByTestId('qtyAfter-0')).toHaveTextContent('32')
    })

    it('matches refreshed live stock by productId, not server array index', async () => {
      mockParams.mockReturnValue({ id: 'abc-123' })

      const ui = (
        <BrowserRouter>
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <CreateStockAdjustmentPage />
          </LocalizationProvider>
        </BrowserRouter>
      )

      // Two rows: p1 (row 0, live 10), p2 (row 1, live 5)
      const initialEdit = {
        data: {
          id: 'abc-123',
          adjustmentNumber: 'SA-001',
          adjustmentDate: '2026-03-15T00:00:00.000Z',
          notes: '',
          items: [
            { productId: 'p1', difference: 0, unitCost: 5, oldQuantity: 10, newQuantity: 10, liveStock: 10 },
            { productId: 'p2', difference: 0, unitCost: 3, oldQuantity: 5, newQuantity: 5, liveStock: 5 },
          ],
        },
        isLoading: false,
        isError: false,
      }
      mockAdjustmentQuery.mockImplementation((id: string) =>
        id === 'abc-123' ? initialEdit : stableAdjNull,
      )

      const { rerender } = render(ui)

      await waitFor(() => {
        expect(screen.getByTestId('liveStock-0')).toHaveTextContent('10')
        expect(screen.getByTestId('liveStock-1')).toHaveTextContent('5')
      })

      // Refetch returns the SAME products but in REVERSED array order, each with
      // new live stock: p2 -> 8, p1 -> 25. An index-based sync would put p2's 8
      // into row 0 (p1) and p1's 25 into row 1 (p2). productId matching keeps
      // row 0 (p1) = 25 and row 1 (p2) = 8.
      const refetchedEdit = {
        data: {
          ...initialEdit.data,
          items: [
            { productId: 'p2', difference: 0, unitCost: 3, oldQuantity: 5, newQuantity: 5, liveStock: 8 },
            { productId: 'p1', difference: 0, unitCost: 5, oldQuantity: 10, newQuantity: 10, liveStock: 25 },
          ],
        },
        isLoading: false,
        isError: false,
      }
      mockAdjustmentQuery.mockImplementation((id: string) =>
        id === 'abc-123' ? refetchedEdit : stableAdjNull,
      )
      rerender(
        <BrowserRouter>
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <CreateStockAdjustmentPage />
          </LocalizationProvider>
        </BrowserRouter>,
      )

      await waitFor(() => {
        expect(screen.getByTestId('liveStock-0')).toHaveTextContent('25')
      })
      // row 0 is p1 -> 25 (not p2's 8), row 1 is p2 -> 8 (not p1's 25)
      expect(screen.getByTestId('liveStock-0')).toHaveTextContent('25')
      expect(screen.getByTestId('liveStock-1')).toHaveTextContent('8')
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

  describe('view-origin edit returns to view page (#877)', () => {
    const editData = (id: string) => ({
      data: {
        id,
        adjustmentNumber: 'SA-001',
        adjustmentDate: '2026-03-15T00:00:00.000Z',
        notes: '',
        items: [{ productId: 'p1', difference: 5, unitCost: 5, oldQuantity: 10, newQuantity: 15 }],
      },
      isLoading: false,
      isError: false,
    })

    beforeEach(() => {
      mockParams.mockReturnValue({ id: 'abc-123' })
      mockSearchParams.mockReturnValue([new URLSearchParams('from=view'), vi.fn()])
      mockAdjustmentQuery.mockImplementation((id: string) =>
        id === 'abc-123' ? editData('abc-123') : stableAdjNull,
      )
      mockUpdateAdjustment.mockReturnValue({
        unwrap: vi.fn().mockResolvedValue({ id: 'abc-123', adjustmentNumber: 'SA-001' }),
      })
    })

    it('Save returns to the view page instead of the list', async () => {
      renderPage()
      await waitFor(() => expect(screen.getByText(/edit stock adjustment/i)).toBeInTheDocument())
      fireEvent.click(screen.getByRole('button', { name: /update adjustment/i }))
      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith('/inventory/stock-adjustments/abc-123/view'),
      )
    })

    it('Cancel returns to the view page', async () => {
      renderPage()
      await waitFor(() => expect(screen.getByText(/edit stock adjustment/i)).toBeInTheDocument())
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
      expect(mockNavigate).toHaveBeenCalledWith('/inventory/stock-adjustments/abc-123/view')
    })

    it('Back returns to the view page', async () => {
      const { container } = renderPage()
      await waitFor(() => expect(screen.getByText(/edit stock adjustment/i)).toBeInTheDocument())
      // Back is an icon-only IconButton (ArrowBackIcon) in PageHeader with no
      // accessible name; it is the button holding the ArrowBackIcon svg.
      const backIcon = container.querySelector('[data-testid="ArrowBackIcon"]')
      fireEvent.click(backIcon!.closest('button')!)
      expect(mockNavigate).toHaveBeenCalledWith('/inventory/stock-adjustments/abc-123/view')
    })
  })
})
