import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { alpha } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { describe, expect, it, vi } from 'vitest'

import { darkTheme } from '@/styles/theme'
import type { OwnerEquityDocument } from '@/types'

import OwnerEquityPage from '../OwnerEquityPage'

const { mockNavigate, mockRows } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockRows: [
    {
      id: 'eq-1',
      referenceNumber: 'EQ-26-001',
      equityDate: '2026-08-01',
      type: 'CAPITAL_INJECTION',
      description: 'Initial capital contribution',
      notes: null,
      documentStatus: 'COMPLETED',
      settlementStatus: 'SETTLED',
      totalAmount: '5000.0000',
      settledAmount: '5000.0000',
      balance: '0.0000',
      productId: null,
      quantity: null,
      unitCost: null,
      totalCost: null,
      completedAt: '2026-08-02T00:00:00Z',
      completedBy: null,
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-02T00:00:00Z',
      settlements: [],
      product: null,
    },
    {
      id: 'eq-2',
      referenceNumber: 'EQ-26-002',
      equityDate: '2026-08-03',
      type: 'CASH_DRAWING',
      description: 'Owner cash withdrawal',
      notes: null,
      documentStatus: 'DRAFT',
      settlementStatus: 'UNSETTLED',
      totalAmount: '250.0000',
      settledAmount: '0.0000',
      balance: '250.0000',
      productId: null,
      quantity: null,
      unitCost: null,
      totalCost: null,
      completedAt: null,
      completedBy: null,
      createdAt: '2026-08-03T00:00:00Z',
      updatedAt: '2026-08-03T00:00:00Z',
      settlements: [],
      product: null,
    },
  ] as OwnerEquityDocument[],
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/store/api/accountingApi', () => ({
  useGetOwnerEquityListQuery: vi.fn().mockReturnValue({
    data: { data: mockRows, meta: { total: 2, page: 1, limit: 25 } },
    isFetching: false,
    error: undefined,
  }),
  useGetOwnerEquityQuery: vi.fn().mockReturnValue({ data: undefined, isFetching: false }),
  useCreateOwnerEquityMutation: vi.fn().mockReturnValue([vi.fn(), { isLoading: false }]),
  useUpdateOwnerEquityMutation: vi.fn().mockReturnValue([vi.fn(), { isLoading: false }]),
  useCompleteOwnerEquityMutation: vi.fn().mockReturnValue([vi.fn(), { isLoading: false }]),
  useUncompleteOwnerEquityMutation: vi.fn().mockReturnValue([vi.fn(), { isLoading: false }]),
  useCancelOwnerEquityMutation: vi.fn().mockReturnValue([vi.fn(), { isLoading: false }]),
  useUncancelOwnerEquityMutation: vi.fn().mockReturnValue([vi.fn(), { isLoading: false }]),
  useSettleOwnerEquityMutation: vi.fn().mockReturnValue([vi.fn(), { isLoading: false }]),
  useRefundOwnerEquityMutation: vi.fn().mockReturnValue([vi.fn(), { isLoading: false }]),
}))

vi.mock('@/store/api/paymentMethodsApi', () => ({
  useGetActivePaymentMethodsForPurchasesQuery: () => ({ data: [] }),
  // Capital Injection accepts any active method, Cash Drawing only
  // purchase-enabled ones — both hooks are mounted, one is always skipped.
  useGetActivePaymentMethodsQuery: () => ({ data: [] }),
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

import { useGetOwnerEquityListQuery } from '@/store/api/accountingApi'

// The router is real here (only useNavigate is mocked), so an incoming
// highlight is driven the way the app delivers one: a history entry carrying
// state, rather than a mocked useLocation.
function renderPage(
  initialEntry: string | { pathname: string; search?: string; state?: unknown } =
    '/accounting/owner-equity',
) {
  const store = configureStore({ reducer: { empty: (s = null) => s } })
  return render(
    // LocalizationProvider is required: selecting a period reveals the custom
    // From/To date pickers, which throw without an adapter in context.
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Provider store={store}>
        <MemoryRouter initialEntries={[initialEntry as any]}>
          <OwnerEquityPage />
        </MemoryRouter>
      </Provider>
    </LocalizationProvider>,
  )
}

describe('OwnerEquityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('navigates to the detail route on row click', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByText('EQ-26-001'))
    expect(mockNavigate).toHaveBeenCalledWith('/accounting/owner-equity/EQ-26-001/view')
  })

  it('renders the reference number and description', () => {
    renderPage()
    expect(screen.getByText('EQ-26-001')).toBeInTheDocument()
    expect(screen.getByText('Initial capital contribution')).toBeInTheDocument()
  })

  it('renders type, document status and settlement status chips', () => {
    renderPage()
    expect(screen.getByText('Capital Injection')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByText('Settled')).toBeInTheDocument()
  })

  it('offers "+ New Owner Equity" primary action', () => {
    renderPage()
    expect(screen.getByText('+ New Owner Equity')).toBeInTheDocument()
  })

  it('requests referenceNumber descending by default', () => {
    renderPage()
    const calls = vi.mocked(useGetOwnerEquityListQuery).mock.calls
    expect(calls[calls.length - 1][0]).toMatchObject({
      sortBy: 'referenceNumber',
      sortOrder: 'DESC',
    })
  })

  it('sends no date bounds while the period filter is unset', () => {
    renderPage()
    const calls = vi.mocked(useGetOwnerEquityListQuery).mock.calls
    const params = calls[calls.length - 1][0] as Record<string, unknown>
    expect(params.fromDate).toBeUndefined()
    expect(params.toDate).toBeUndefined()
  })

  // Regression: the Period filter rendered but was never mapped to
  // fromDate/toDate, so selecting a period silently returned the unfiltered
  // list. It type-checked because the page redefined `period` locally as
  // `{ key: string | null; ... }` instead of the shared PeriodValue.
  it('maps a selected period to fromDate/toDate query params', async () => {
    const user = userEvent.setup()
    renderPage()

    // FilterPeriod renders a MUI Select (combobox), not a labelled input, and
    // this page has several (Period, Type, Document Status, Settlement Status).
    // Period is declared first in filterConfig.fields, so it is combobox 0.
    await user.click(screen.getAllByRole('combobox')[0])
    // FilterPeriod's presets are plain MenuItems, so they carry role
    // "menuitem" rather than "option".
    // Selecting a preset applies immediately via onChange — there is no Apply
    // button on this filter bar.
    await user.click(await screen.findByRole('menuitem', { name: 'This Month' }))

    const calls = vi.mocked(useGetOwnerEquityListQuery).mock.calls
    const params = calls[calls.length - 1][0] as Record<string, unknown>
    expect(params.fromDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(params.toDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  // Issue #1088: Create returns here and hands the new row's id back in
  // history state. The tint is a one-shot confirmation of the return trip, so
  // it is copied into local state and dropped from history immediately.
  describe('create highlight', () => {
    it('highlights the row named by incoming location state', async () => {
      renderPage({
        pathname: '/accounting/owner-equity',
        search: '',
        state: { highlightOwnerEquityId: 'eq-2' },
      })

      await waitFor(() => {
        expect(screen.getByText('EQ-26-002').closest('tr')).toHaveStyle({
          backgroundColor: alpha(darkTheme.palette.primary.main, 0.2),
        })
      })
      expect(screen.getByText('EQ-26-001').closest('tr')).not.toHaveStyle({
        backgroundColor: alpha(darkTheme.palette.primary.main, 0.2),
      })
    })

    it('clears the highlight state while preserving the query string', async () => {
      renderPage({
        pathname: '/accounting/owner-equity',
        search: '?documentStatus=DRAFT',
        state: { highlightOwnerEquityId: 'eq-2' },
      })

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(
          '/accounting/owner-equity?documentStatus=DRAFT',
          { replace: true, state: null },
        )
      })
    })

    it('does not clear history state when no highlight arrives', () => {
      renderPage()
      expect(mockNavigate).not.toHaveBeenCalled()
    })
  })
})
