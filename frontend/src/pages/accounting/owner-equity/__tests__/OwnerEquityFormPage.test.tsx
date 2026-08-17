import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'

import type { OwnerEquityDocument, OwnerEquityType } from '@/types'

import OwnerEquityFormPage from '../OwnerEquityFormPage'

const {
  mockNavigate,
  mockCreateOwnerEquity,
  mockUpdateOwnerEquity,
  mockGetOwnerEquity,
  mockGetDocumentNumberSettings,
  mockUseProductSearch,
  mockLoadProducts,
  mockSeedProducts,
  mockGetProduct,
  mockShowSuccess,
  mockShowError,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockCreateOwnerEquity: vi.fn(),
  mockUpdateOwnerEquity: vi.fn(),
  mockGetOwnerEquity: vi.fn(),
  mockGetDocumentNumberSettings: vi.fn(),
  mockUseProductSearch: vi.fn(),
  mockLoadProducts: vi.fn(),
  mockSeedProducts: vi.fn(),
  mockGetProduct: vi.fn(),
  mockShowSuccess: vi.fn(),
  mockShowError: vi.fn(),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@/store/api/accountingApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/accountingApi')>()
  return {
    ...actual,
    useGetOwnerEquityQuery: vi.fn((id) => mockGetOwnerEquity(id)),
    useCreateOwnerEquityMutation: vi.fn(() => [mockCreateOwnerEquity, { isLoading: false }]),
    useUpdateOwnerEquityMutation: vi.fn(() => [mockUpdateOwnerEquity, { isLoading: false }]),
  }
})

vi.mock('@/store/api/settingsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/settingsApi')>()
  return {
    ...actual,
    useGetDocumentNumberSettingsQuery: vi.fn(() => mockGetDocumentNumberSettings()),
  }
})

vi.mock('@/store/api/inventoryApi', () => ({
  useGetProductQuery: vi.fn((id) => mockGetProduct(id)),
}))

vi.mock('@/hooks/useProductSearch', () => ({
  useProductSearch: (options?: unknown) => mockUseProductSearch(options),
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}))

const DOC_SETTINGS = {
  data: {
    configurations: [
      { documentName: 'Owner Equity', prefix: 'EQ', nextNumber: 1, paddingDigits: 3, lastResetYear: 26 },
    ],
  },
  isLoading: false,
}

// What useProductSearch yields: a flat array already narrowed by the backend to
// active Stocked Product rows, so no Service product can appear here.
const PRODUCTS = [
  { id: 'p1', name: 'Widget', type: 'Stocked Product' as const, isActive: true, stockQuantity: 12 },
  { id: 'p3', name: 'Sprocket', type: 'Stocked Product' as const, isActive: true, stockQuantity: 4 },
]

const PRODUCT_P1 = { id: 'p1', name: 'Widget', type: 'Stocked Product' as const, stockQuantity: 12 }

function buildDoc(type: OwnerEquityType, overrides: Partial<OwnerEquityDocument> = {}): OwnerEquityDocument {
  return {
    id: 'eq-1',
    referenceNumber: 'EQ-26-001',
    equityDate: '2026-08-01',
    type,
    description: 'Description text',
    notes: null,
    documentStatus: overrides.documentStatus ?? (type === 'STOCK_DRAWING' ? 'DRAFT' : 'DRAFT'),
    settlementStatus: null,
    totalAmount: type === 'STOCK_DRAWING' ? null : '5000.0000',
    settledAmount: null,
    balance: type === 'STOCK_DRAWING' ? null : '5000.0000',
    productId: type === 'STOCK_DRAWING' ? 'p1' : null,
    quantity: type === 'STOCK_DRAWING' ? '10' : null,
    unitCost: null,
    totalCost: null,
    completedAt: null,
    completedBy: null,
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
    settlements: [],
    product: null,
    ...overrides,
  }
}

const TYPE_LABELS: Record<OwnerEquityType, string> = {
  CAPITAL_INJECTION: 'Capital Injection',
  CASH_DRAWING: 'Cash Drawing',
  STOCK_DRAWING: 'Stock Drawing',
}

/**
 * Pick an option from a standard (non-native) MUI Select. These render a button
 * combobox plus a portalled listbox, so there is no <option> to fire a change
 * event at — the control must be opened and the option clicked (issue #1081).
 */
function selectOption(fieldLabel: RegExp, optionLabel: string) {
  fireEvent.mouseDown(screen.getByLabelText(fieldLabel))
  fireEvent.click(within(screen.getByRole('listbox')).getByText(optionLabel))
}

/**
 * Pick an option from the Product Autocomplete. Unlike a MUI Select it has a
 * real text input: opening it renders the (server-supplied) options, which are
 * then clicked by name. Issue #1086.
 */
function selectProduct(optionLabel: string) {
  fireEvent.mouseDown(screen.getByLabelText(/Product/))
  fireEvent.click(within(screen.getByRole('listbox')).getByText(optionLabel))
}

function renderForm({
  type,
  mode = 'create' as 'create' | 'edit',
  referenceNumber = 'EQ-26-001',
  productId,
}: {
  type?: OwnerEquityType
  mode?: 'create' | 'edit'
  referenceNumber?: string
  productId?: string
}) {
  const store = configureStore({ reducer: { empty: (s = null) => s } })
  const path =
    mode === 'create'
      ? '/accounting/owner-equity/create'
      : `/accounting/owner-equity/${referenceNumber}/edit`

  const result = render(
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Provider store={store}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/accounting/owner-equity/create" element={<OwnerEquityFormPage />} />
            <Route path="/accounting/owner-equity/:referenceNumber/edit" element={<OwnerEquityFormPage />} />
            <Route path="/accounting/owner-equity/:referenceNumber/view" element={<div>DETAIL</div>} />
          </Routes>
        </MemoryRouter>
      </Provider>
    </LocalizationProvider>,
  )

  if (mode === 'create' && type) {
    selectOption(/Type/, TYPE_LABELS[type])
  }
  if (mode === 'create' && productId && type === 'STOCK_DRAWING') {
    const product = PRODUCTS.find((p) => p.id === productId)
    if (!product) throw new Error(`No product fixture for id ${productId}`)
    selectProduct(product.name)
  }
  return result
}

describe('OwnerEquityFormPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetOwnerEquity.mockReturnValue({ data: undefined, isLoading: false, isFetching: false })
    mockGetDocumentNumberSettings.mockReturnValue(DOC_SETTINGS)
    mockLoadProducts.mockReset()
    mockSeedProducts.mockReset()
    mockUseProductSearch.mockReturnValue({
      products: PRODUCTS,
      loadProducts: mockLoadProducts,
      seedProducts: mockSeedProducts,
    })
    mockGetProduct.mockReturnValue({ data: PRODUCT_P1, isFetching: false })
    mockCreateOwnerEquity.mockReturnValue({ unwrap: vi.fn().mockResolvedValue(buildDoc('CAPITAL_INJECTION')) })
    mockUpdateOwnerEquity.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({}) })
    mockNavigate.mockReset()
  })

  it('shows Amount for a capital injection', () => {
    renderForm({ type: 'CAPITAL_INJECTION' })
    expect(screen.getByLabelText(/Amount/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/Product/)).not.toBeInTheDocument()
  })

  it('shows Product and Quantity for a stock drawing, and no amount', () => {
    renderForm({ type: 'STOCK_DRAWING' })
    expect(screen.getByLabelText(/Product/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Amount/)).not.toBeInTheDocument()
  })

  it('shows current available stock for the chosen product', () => {
    renderForm({ type: 'STOCK_DRAWING', productId: 'p1' })
    expect(screen.getByText(/Available: 12/)).toBeInTheDocument()
  })

  it('locks the type control in edit mode', () => {
    mockGetOwnerEquity.mockReturnValue({ data: buildDoc('CASH_DRAWING'), isLoading: false })
    renderForm({ mode: 'edit', type: 'CASH_DRAWING' })
    // A non-native MUI Select is a div combobox: it marks disablement with
    // aria-disabled, not the `disabled` attribute toBeDisabled() looks for.
    expect(screen.getByLabelText(/Type/)).toHaveAttribute('aria-disabled', 'true')
  })

  // Issue #1081 defect 1: Type and Product rendered as native selects with a raw
  // `Input`, which skips the outlined border and label notch every other field
  // on this form uses. jsdom has no layout engine, so the visual match itself
  // needs a browser pass — what is assertable is the control shape that
  // produces it: a MUI combobox with MenuItem options, not a native <select>.
  it('renders Type as a standard MUI select offering exactly the three equity types', () => {
    renderForm({})

    const typeField = screen.getByLabelText(/Type/)
    expect(typeField.closest('.MuiOutlinedInput-root')).not.toBeNull()

    fireEvent.mouseDown(screen.getByLabelText(/Type/))
    const options = within(screen.getByRole('listbox')).getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual([
      'Capital Injection',
      'Cash Drawing',
      'Stock Drawing',
    ])
    expect(document.querySelector('select')).toBeNull()
  })

  // Issue #1086: Product moved from a plain Select over the whole catalogue to a
  // searchable Autocomplete backed by a server-side query.
  it('renders Product as a searchable Autocomplete listing stocked products', () => {
    renderForm({ type: 'STOCK_DRAWING' })

    const productField = screen.getByLabelText(/Product/)
    expect(productField.closest('.MuiOutlinedInput-root')).not.toBeNull()
    expect(productField.tagName).toBe('INPUT')
    expect(productField).toHaveAttribute('placeholder', 'Search by name or barcode...')

    fireEvent.mouseDown(productField)
    expect(within(screen.getByRole('listbox')).getByText('Widget')).toBeInTheDocument()
    expect(document.querySelector('select')).toBeNull()
  })

  it('restricts the search to active stocked products so services cannot be picked', () => {
    renderForm({ type: 'STOCK_DRAWING' })

    expect(mockUseProductSearch).toHaveBeenCalledWith({
      onlyActive: true,
      type: 'Stocked Product',
    })
  })

  it('queries the backend with the typed search term', () => {
    renderForm({ type: 'STOCK_DRAWING' })

    fireEvent.change(screen.getByLabelText(/Product/), { target: { value: 'spro' } })

    expect(mockLoadProducts).toHaveBeenCalledWith('spro')
  })

  it('selecting a searched product records it and shows its available stock', () => {
    renderForm({ type: 'STOCK_DRAWING' })
    selectProduct('Widget')

    expect(screen.getByLabelText(/Product/)).toHaveValue('Widget')
    expect(screen.getByText(/Available: 12/)).toBeInTheDocument()
  })

  it('tells the user when a search matches nothing', () => {
    mockUseProductSearch.mockReturnValue({
      products: [],
      loadProducts: mockLoadProducts,
      seedProducts: mockSeedProducts,
    })
    renderForm({ type: 'STOCK_DRAWING' })

    fireEvent.change(screen.getByLabelText(/Product/), { target: { value: 'zzz' } })

    expect(screen.getByText('No matching products')).toBeInTheDocument()
  })

  // Edit mode opens with an unfiltered page that need not contain the saved
  // product, so it is seeded into the option list from useGetProductQuery.
  it('keeps the saved product visible in edit mode', () => {
    mockGetOwnerEquity.mockReturnValue({ data: buildDoc('STOCK_DRAWING'), isLoading: false })
    mockUseProductSearch.mockReturnValue({
      products: [],
      loadProducts: mockLoadProducts,
      seedProducts: mockSeedProducts,
    })
    renderForm({ mode: 'edit', type: 'STOCK_DRAWING' })

    expect(mockSeedProducts).toHaveBeenCalledWith([expect.objectContaining({ id: 'p1' })])
    expect(screen.getByLabelText(/Product/)).toHaveValue('Widget')
  })

  // RTK Query retains the last result once useGetProductQuery is skipped, so the
  // selectedProduct fallback must stay gated on the form value or clearing the
  // field silently re-displays the product the user just removed.
  it('clearing the product does not resurrect the previous selection', () => {
    renderForm({ type: 'STOCK_DRAWING', productId: 'p1' })
    expect(screen.getByLabelText(/Product/)).toHaveValue('Widget')

    fireEvent.change(screen.getByLabelText(/Product/), { target: { value: '' } })

    expect(screen.getByLabelText(/Product/)).toHaveValue('')
  })
})
