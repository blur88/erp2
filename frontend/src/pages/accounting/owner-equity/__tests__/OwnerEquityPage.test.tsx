import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { alpha } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { darkTheme } from '@/styles/theme'
import type { OwnerEquityDocument } from '@/types'

import OwnerEquityPage from '../OwnerEquityPage'

const { mockNavigate, mockShowSuccess, mockShowError, mockRows } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockShowSuccess: vi.fn(),
  mockShowError: vi.fn(),
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
    // Uncomplete is stock-drawing-only and COMPLETED-only (getOwnerEquityActionMetas),
    // so this is the only row shape whose action menu offers it. Appended last so
    // the existing menuButtons[1] assertions still address EQ-26-002.
    {
      id: 'eq-3',
      referenceNumber: 'EQ-26-003',
      equityDate: '2026-08-05',
      type: 'STOCK_DRAWING',
      description: 'Owner took stock',
      notes: null,
      documentStatus: 'COMPLETED',
      settlementStatus: 'UNSETTLED',
      totalAmount: null,
      settledAmount: '0.0000',
      balance: '0.0000',
      productId: 'prod-1',
      quantity: '2.0000',
      unitCost: '10.0000',
      totalCost: '20.0000',
      completedAt: '2026-08-06T00:00:00Z',
      completedBy: null,
      createdAt: '2026-08-05T00:00:00Z',
      updatedAt: '2026-08-06T00:00:00Z',
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
    data: { data: mockRows, meta: { total: 3, page: 1, limit: 25 } },
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
  useNotification: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}))

import {
  useGetOwnerEquityListQuery,
  useUncompleteOwnerEquityMutation,
} from '@/store/api/accountingApi'

// The router is real here (only useNavigate is mocked), so an incoming
// highlight is driven the way the app delivers one: a history entry carrying
// state, rather than a mocked useLocation.
function renderPage(
  initialEntry: string | { pathname: string; search?: string; state?: unknown } =
    '/accounting/owner-equity',
) {
  // Seed the REAL url too: listQuery helpers read window.location.search,
  // which MemoryRouter never populates (#1131 review).
  window.history.replaceState(
    null,
    '',
    typeof initialEntry === 'string'
      ? initialEntry
      : `${initialEntry.pathname}${initialEntry.search ?? ''}`,
  )
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

  afterEach(() => {
    // useListUrlState hydrates from the live window.location, which jsdom
    // persists across tests in this file.
    window.history.replaceState(null, '', '/')
  })

  it('navigates to the detail route on row click', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByText('EQ-26-001'))
    expect(mockNavigate).toHaveBeenCalledWith('/accounting/owner-equity/EQ-26-001/view')
  })

  it('carries the list query to Detail', async () => {
    const user = userEvent.setup()
    renderPage('/accounting/owner-equity?type=CASH_DRAWING&page=2')

    await user.click(await screen.findByText('EQ-26-001'))

    // Assert on the decoded ticket, not a serialized string: useListUrlState
    // appends its keys after the filter keys, so param ORDER is an
    // implementation detail.
    const target = mockNavigate.mock.calls.at(-1)?.[0] as string
    const ticket = new URLSearchParams(target.slice(target.indexOf('?'))).get('listQuery')
    const inner = new URLSearchParams(ticket ?? '')
    expect(inner.get('type')).toBe('CASH_DRAWING')
    expect(inner.get('page')).toBe('2')
  })

  // Edit must tell the form it was opened from the list, so the form's
  // Save/Cancel/Back come back here instead of falling through to Detail.
  // EQ-26-002 is the DRAFT row, the one that offers Edit. Issue #1090.
  it('opens Edit with explicit list-origin state', async () => {
    const user = userEvent.setup()
    renderPage()

    const menuButtons = screen.getAllByRole('button', { name: /row actions/i })
    await user.click(menuButtons[1])
    await user.click(await screen.findByRole('menuitem', { name: /^edit$/i }))

    expect(mockNavigate).toHaveBeenCalledWith('/accounting/owner-equity/EQ-26-002/edit', {
      state: { ownerEquityEditOrigin: 'list' },
    })
  })

  it('renders the reference number and description', () => {
    renderPage()
    expect(screen.getByText('EQ-26-001')).toBeInTheDocument()
    expect(screen.getByText('Initial capital contribution')).toBeInTheDocument()
  })

  it('renders type, document status and settlement status chips', () => {
    renderPage()
    expect(screen.getByText('Capital Injection')).toBeInTheDocument()
    // Two rows are COMPLETED (EQ-26-001 and the stock drawing EQ-26-003), so
    // this chip label is no longer unique.
    expect(screen.getAllByText('Completed')).toHaveLength(2)
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

  it('hydrates page, limit and sort order from the URL', async () => {
    // renderPage seeds window.location from this argument; useListUrlState
    // hydrates from it.
    renderPage('/accounting/owner-equity?page=2&limit=50&sortOrder=asc')

    await waitFor(() => {
      expect(vi.mocked(useGetOwnerEquityListQuery)).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, limit: 50, sortOrder: 'ASC' }),
      )
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

    it('keeps list params in the URL after clearing the highlight state', async () => {
      renderPage({
        pathname: '/accounting/owner-equity',
        search: '?type=CASH_DRAWING&page=2',
        state: { highlightOwnerEquityId: 'oe-1' },
      })

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(
          '/accounting/owner-equity?type=CASH_DRAWING&page=2',
          { replace: true, state: null },
        )
      })
    })
  })
  // Issue #1136: Uncomplete was the outlier among lifecycle row actions — it
  // navigated to Detail instead of confirming in place like complete/cancel/
  // uncancel. EQ-26-003 is the COMPLETED stock drawing, the only row shape
  // that offers Uncomplete.
  describe('list-origin Uncomplete', () => {
    // The file-level mock returns a bare vi.fn(), which has no .unwrap(). Each
    // test that actually confirms needs its own resolving/rejecting double.
    function primeUncomplete(unwrap: () => Promise<unknown>) {
      const trigger = vi.fn(() => ({ unwrap }))
      vi.mocked(useUncompleteOwnerEquityMutation).mockReturnValue([
        trigger,
        { isLoading: false },
      ] as never)
      return trigger
    }

    async function openUncomplete(user: ReturnType<typeof userEvent.setup>) {
      const menuButtons = screen.getAllByRole('button', { name: /row actions/i })
      await user.click(menuButtons[2])
      await user.click(await screen.findByRole('menuitem', { name: /^uncomplete$/i }))
    }

    it('opens the confirmation dialog in place instead of navigating', async () => {
      const user = userEvent.setup()
      renderPage()

      await openUncomplete(user)

      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByText(/Uncomplete Owner Equity/)).toBeInTheDocument()
      expect(mockNavigate).not.toHaveBeenCalled()
    })

    it('uncompletes the document and closes the dialog on confirm', async () => {
      const user = userEvent.setup()
      const trigger = primeUncomplete(() => Promise.resolve(undefined))
      renderPage()

      await openUncomplete(user)
      const dialog = await screen.findByRole('dialog')
      await user.click(within(dialog).getByRole('button', { name: /^uncomplete$/i }))

      expect(trigger).toHaveBeenCalledWith({ referenceNumber: 'EQ-26-003' })
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(mockNavigate).not.toHaveBeenCalled()
    })

    it('leaves the document unchanged when the dialog is dismissed', async () => {
      const user = userEvent.setup()
      const trigger = primeUncomplete(() => Promise.resolve(undefined))
      renderPage()

      await openUncomplete(user)
      const dialog = await screen.findByRole('dialog')
      await user.click(within(dialog).getByRole('button', { name: /^cancel$/i }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(trigger).not.toHaveBeenCalled()
      expect(mockNavigate).not.toHaveBeenCalled()
    })

    // A failed uncomplete must report the error and keep the dialog open, so
    // the user can retry — matching complete/cancel/uncancel, which all clear
    // their row only on success.
    it('reports the error and keeps the dialog open when the mutation rejects', async () => {
      const user = userEvent.setup()
      primeUncomplete(() => Promise.reject({ data: { message: 'boom' } }))
      renderPage()

      await openUncomplete(user)
      const dialog = await screen.findByRole('dialog')
      await user.click(within(dialog).getByRole('button', { name: /^uncomplete$/i }))

      await waitFor(() => expect(mockShowError).toHaveBeenCalled())
      expect(mockShowError.mock.calls[0][0]).toMatch(/boom|Failed to uncomplete/)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })
})
