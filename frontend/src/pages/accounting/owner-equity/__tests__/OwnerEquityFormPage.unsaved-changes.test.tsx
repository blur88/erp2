import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'

import type { OwnerEquityDocument, OwnerEquityType } from '@/types'

import OwnerEquityFormPage from '../OwnerEquityFormPage'

/**
 * The unsaved-changes guard uses `useBlocker`, which requires a data router and
 * intercepts *real* navigation. The sibling OwnerEquityFormPage.test.tsx mocks
 * `react-router-dom`'s useNavigate/useLocation, so Cancel there never reaches
 * the router and the blocker can never fire. These cases therefore live in
 * their own file with no router mock at all — the mock and a data router cannot
 * coexist. Issue #1092.
 */

const {
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

const PRODUCTS = [
  { id: 'p1', name: 'Widget', type: 'Stocked Product' as const, isActive: true, stockQuantity: 12 },
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
    documentStatus: 'DRAFT',
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
  } as OwnerEquityDocument
}

const TYPE_LABELS: Record<OwnerEquityType, string> = {
  CAPITAL_INJECTION: 'Capital Injection',
  CASH_DRAWING: 'Cash Drawing',
  STOCK_DRAWING: 'Stock Drawing',
}

function selectOption(fieldLabel: RegExp, optionLabel: string) {
  fireEvent.mouseDown(screen.getByLabelText(fieldLabel))
  fireEvent.click(within(screen.getByRole('listbox')).getByText(optionLabel))
}

/**
 * Renders the form inside a real data router. The LIST route is a plain marker
 * element: its presence proves navigation actually completed, which is the only
 * way to tell "Discard proceeded" from "the dialog merely closed".
 */
function renderForm({
  type,
  mode = 'create' as 'create' | 'edit',
  referenceNumber = 'EQ-26-001',
}: {
  type?: OwnerEquityType
  mode?: 'create' | 'edit'
  referenceNumber?: string
}) {
  const store = configureStore({ reducer: { empty: (s = null) => s } })
  const path =
    mode === 'create'
      ? '/accounting/owner-equity/create'
      : `/accounting/owner-equity/${referenceNumber}/edit`

  const router = createMemoryRouter(
    [
      { path: '/accounting/owner-equity', element: <div>LIST PAGE</div> },
      { path: '/accounting/owner-equity/create', element: <OwnerEquityFormPage /> },
      { path: '/accounting/owner-equity/:referenceNumber/edit', element: <OwnerEquityFormPage /> },
      { path: '/accounting/owner-equity/:referenceNumber/view', element: <div>DETAIL PAGE</div> },
    ],
    { initialEntries: [path] },
  )

  const result = render(
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Provider store={store}>
        <RouterProvider router={router} />
      </Provider>
    </LocalizationProvider>,
  )

  if (mode === 'create' && type) {
    selectOption(/Type/, TYPE_LABELS[type])
  }
  return result
}

/** Enter the unsaved data from the issue's reproduction steps. */
function dirtyTheForm() {
  fireEvent.change(screen.getByLabelText(/Description/), {
    target: { value: 'Temporary Cancel Test' },
  })
  fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '500.00' } })
}

const clickCancel = () => fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }))

const DIALOG_MESSAGE = /You have unsaved changes\. Are you sure you want to leave without saving\?/

describe('OwnerEquityFormPage unsaved-changes guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetOwnerEquity.mockReturnValue({ data: undefined, isLoading: false, isFetching: false })
    mockGetDocumentNumberSettings.mockReturnValue(DOC_SETTINGS)
    mockUseProductSearch.mockReturnValue({
      products: PRODUCTS,
      loadProducts: mockLoadProducts,
      seedProducts: mockSeedProducts,
    })
    mockGetProduct.mockReturnValue({ data: PRODUCT_P1, isFetching: false })
    mockCreateOwnerEquity.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue(buildDoc('CAPITAL_INJECTION')),
    })
    mockUpdateOwnerEquity.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({}) })
  })

  describe('new form', () => {
    it('shows the confirmation on Cancel when dirty, without creating', async () => {
      renderForm({ type: 'CAPITAL_INJECTION' })
      dirtyTheForm()

      clickCancel()

      expect(await screen.findByText(DIALOG_MESSAGE)).toBeInTheDocument()
      expect(screen.queryByText('LIST PAGE')).not.toBeInTheDocument()
      expect(mockCreateOwnerEquity).not.toHaveBeenCalled()
    })

    it('stays on the form when Keep editing is chosen', async () => {
      renderForm({ type: 'CAPITAL_INJECTION' })
      dirtyTheForm()
      clickCancel()
      await screen.findByText(DIALOG_MESSAGE)

      fireEvent.click(screen.getByRole('button', { name: /Keep editing/ }))

      await waitFor(() => expect(screen.queryByText(DIALOG_MESSAGE)).not.toBeInTheDocument())
      expect(screen.queryByText('LIST PAGE')).not.toBeInTheDocument()
      // The typed values survive: Keep editing cancels navigation, it does not reset.
      expect((screen.getByLabelText(/Description/) as HTMLInputElement).value).toBe(
        'Temporary Cancel Test',
      )
      expect(mockCreateOwnerEquity).not.toHaveBeenCalled()
    })

    it('leaves without saving when Discard is chosen', async () => {
      renderForm({ type: 'CAPITAL_INJECTION' })
      dirtyTheForm()
      clickCancel()
      await screen.findByText(DIALOG_MESSAGE)

      fireEvent.click(screen.getByRole('button', { name: /Discard/ }))

      expect(await screen.findByText('LIST PAGE')).toBeInTheDocument()
      expect(mockCreateOwnerEquity).not.toHaveBeenCalled()
    })

    it('leaves immediately when the form is clean', async () => {
      renderForm({})

      clickCancel()

      expect(await screen.findByText('LIST PAGE')).toBeInTheDocument()
      expect(screen.queryByText(DIALOG_MESSAGE)).not.toBeInTheDocument()
      expect(mockCreateOwnerEquity).not.toHaveBeenCalled()
    })

    it('does not block the post-save navigation', async () => {
      renderForm({ type: 'CAPITAL_INJECTION' })
      dirtyTheForm()

      fireEvent.click(screen.getByRole('button', { name: /Create Owner Equity/ }))

      await waitFor(() => expect(mockCreateOwnerEquity).toHaveBeenCalled())
      expect(await screen.findByText('LIST PAGE')).toBeInTheDocument()
      expect(screen.queryByText(DIALOG_MESSAGE)).not.toBeInTheDocument()
    })
  })

  describe('edit form', () => {
    beforeEach(() => {
      mockGetOwnerEquity.mockReturnValue({
        data: buildDoc('CAPITAL_INJECTION'),
        isLoading: false,
        isFetching: false,
      })
    })

    it('shows the confirmation on Cancel when dirty, without updating', async () => {
      renderForm({ mode: 'edit' })
      // reset() re-baselines the loaded document, so the form starts clean.
      await waitFor(() =>
        expect((screen.getByLabelText(/Description/) as HTMLInputElement).value).toBe(
          'Description text',
        ),
      )

      fireEvent.change(screen.getByLabelText(/Description/), {
        target: { value: 'Edited but unsaved' },
      })
      clickCancel()

      expect(await screen.findByText(DIALOG_MESSAGE)).toBeInTheDocument()
      expect(screen.queryByText('DETAIL PAGE')).not.toBeInTheDocument()
      expect(mockUpdateOwnerEquity).not.toHaveBeenCalled()
    })

    it('leaves without saving when Discard is chosen', async () => {
      renderForm({ mode: 'edit' })
      await waitFor(() =>
        expect((screen.getByLabelText(/Description/) as HTMLInputElement).value).toBe(
          'Description text',
        ),
      )

      fireEvent.change(screen.getByLabelText(/Description/), {
        target: { value: 'Edited but unsaved' },
      })
      clickCancel()
      await screen.findByText(DIALOG_MESSAGE)

      fireEvent.click(screen.getByRole('button', { name: /Discard/ }))

      expect(await screen.findByText('DETAIL PAGE')).toBeInTheDocument()
      expect(mockUpdateOwnerEquity).not.toHaveBeenCalled()
    })

    it('leaves immediately when the loaded form is untouched', async () => {
      renderForm({ mode: 'edit' })
      await waitFor(() =>
        expect((screen.getByLabelText(/Description/) as HTMLInputElement).value).toBe(
          'Description text',
        ),
      )

      clickCancel()

      expect(await screen.findByText('DETAIL PAGE')).toBeInTheDocument()
      expect(screen.queryByText(DIALOG_MESSAGE)).not.toBeInTheDocument()
      expect(mockUpdateOwnerEquity).not.toHaveBeenCalled()
    })
  })
})
