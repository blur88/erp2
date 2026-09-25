import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { alpha } from '@mui/material'
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { darkTheme } from '@/styles/theme'

import ProviderSettlementsPage, { HEADERS } from '../ProviderSettlementsPage'

const mockList = vi.fn()
const mockProviders = vi.fn()

// The page calls useNotification() on every render. Without this mock it is
// undefined and destructuring throws before any assertion runs.
vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useGetProviderSettlementsQuery: (...args: unknown[]) => mockList(...args),
  useDiscardProviderSettlementMutation: () => [vi.fn(), { isLoading: false }],
  usePostProviderSettlementMutation: () => [vi.fn(), { isLoading: false }],
  useReverseProviderSettlementMutation: () => [vi.fn(), { isLoading: false }],
  useGetProviderSettlementProvidersQuery: () => mockProviders(),
}))

function row(over: Partial<any> = {}) {
  return {
    id: 'ps-1', referenceNumber: 'PS-26-001', settlementDate: '2026-09-20',
    providerPaymentMethod: { id: 'pm-1', name: 'Atome' },
    providerReference: 'ATM-9911',
    clearingAccount: { id: 'c1', code: '1240', name: 'Atome' },
    bankAccount: { id: 'b1', code: '1200', name: 'CIMB' },
    settlementAmount: '98.0000', status: 'DRAFT', ...over,
  }
}

function renderPage(rows: any[]) {
  mockList.mockReturnValue({
    data: { data: rows, meta: { total: rows.length, page: 1, limit: 25 } },
    isLoading: false, isError: false,
  })
  return render(
    <MemoryRouter>
      <ProviderSettlementsPage />
    </MemoryRouter>,
  )
}

describe('ProviderSettlementsPage', () => {
  beforeEach(() => {
    mockList.mockReset()
    mockProviders.mockReset()
    mockProviders.mockReturnValue({ data: [], isLoading: false })
    // useFilterBar reads and writes the REAL window.location, which jsdom keeps
    // across tests — a filter written by one test would otherwise mount the next.
    window.history.replaceState(null, '', '/')
    // formatDate reads 'dateFormat' from localStorage, which jsdom also keeps
    // across tests; clear it so the one test that sets it cannot leak into the
    // rest of the file.
    localStorage.clear()
  })

  it('declares the nine headers in order', () => {
    // EntityTable takes `headers` as a string[] alongside `columns`, so the
    // header text and the column order are two separate declarations that can
    // drift apart. Assert the constant, which is what the component is given.
    expect(HEADERS).toEqual([
      'Settlement No', 'Date', 'Provider', 'Provider Reference',
      'Provider Clearing Account', 'Bank Account', 'Settlement Amount',
      'Status', 'Actions',
    ])
  })

  // #1275: the date column follows the sibling accounting pages (Owner Equity,
  // Expenses), which head it 'Date' rather than naming the domain field.
  it('heads the date column "Date", not "Settlement Date"', () => {
    renderPage([row()])
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toContain('Date')
    expect(headers).not.toContain('Settlement Date')
  })

  // #1275: the expected string is a LITERAL, not formatDate(...) — an
  // expectation computed by the code under test shares its source with the
  // actual and cannot fail. The saved preference is set explicitly because
  // formatDate reads it from localStorage, so leaving it to the default would
  // make this assertion depend on a value no test controls.
  it('renders the settlement date date-only, in the saved format', () => {
    localStorage.setItem('dateFormat', 'DD/MM/YYYY')
    renderPage([row({ settlementDate: '2026-09-22' })])
    // Exact equality, not toHaveTextContent: that is a substring match and
    // would still accept '22/09/2026 14:30'.
    expect(screen.getAllByRole('cell')[1].textContent).toBe('22/09/2026')
  })

  it('renders a row with its settlement number, provider and amount', () => {
    renderPage([row()])
    expect(screen.getByText('Atome')).toBeInTheDocument()
    expect(screen.getByText('ATM-9911')).toBeInTheDocument()
    expect(screen.getByTestId('settlement-amount')).toHaveTextContent('98.00')
  })

  // #1269: asserting the constant above only proves HEADERS' own order. The
  // columns array is a separate declaration, so read the rendered cells to
  // catch the two drifting apart — Settlement No must be the FIRST cell.
  it('renders the settlement number as the first cell of the row', () => {
    renderPage([row()])
    const cells = screen.getAllByRole('cell')
    expect(cells[0]).toHaveTextContent('PS-26-001')
  })

  // #1267: the page passes showHeader={false}, so EntityTable's
  // `{label} ({total})` line must not render in either state. `label` itself
  // stays — it is the required prop and the fallback for the empty message.
  it('shows no count label above an empty table, but keeps the empty state', () => {
    renderPage([])
    expect(screen.queryByText('Provider Settlements (0)')).not.toBeInTheDocument()
    expect(screen.getByText(/No provider settlements found/i)).toBeInTheDocument()
  })

  it('shows no count label above a populated table', () => {
    renderPage([row()])
    expect(screen.queryByText(/Provider Settlements \(\d+\)/)).not.toBeInTheDocument()
    expect(screen.getByText('Atome')).toBeInTheDocument()
  })

  it('offers edit, post and discard on a draft row', async () => {
    renderPage([row({ status: 'DRAFT' })])
    await userEvent.click(screen.getByRole('button', { name: /actions/i }))
    const menu = within(screen.getByRole('menu'))
    expect(menu.getByText('Edit')).toBeInTheDocument()
    expect(menu.getByText('Post')).toBeInTheDocument()
    expect(menu.getByText('Discard')).toBeInTheDocument()
    expect(menu.queryByText('Reverse')).not.toBeInTheDocument()
  })

  it('offers only reverse on a posted row', async () => {
    renderPage([row({ id: 'ps-2', status: 'POSTED' })])
    await userEvent.click(screen.getByRole('button', { name: /actions/i }))
    const menu = within(screen.getByRole('menu'))
    expect(menu.getByText('Reverse')).toBeInTheDocument()
    expect(menu.queryByText('Edit')).not.toBeInTheDocument()
    expect(menu.queryByText('Discard')).not.toBeInTheDocument()
  })

  // #1285: a DRAFT whose stored clearing account is unflagged cannot be
  // posted; the list disables Post (with its reason) and warns on the row.
  it('disables Post with its reason for a DRAFT whose clearing account is not flagged, and shows the warning chip', async () => {
    renderPage([row({
      status: 'DRAFT',
      clearingAccount: { id: 'c', code: '1200', name: 'CIMB', isProviderClearing: false },
    })])
    expect(await screen.findByText('Not provider clearing')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /row actions/i }))
    expect(screen.getByRole('menuitem', { name: 'Post' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('menuitem', { name: 'Edit' })).not.toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('menuitem', { name: 'View' })).not.toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('menuitem', { name: 'Discard' })).not.toHaveAttribute('aria-disabled', 'true')
    expect(document.querySelector('[data-tooltip="Not a provider clearing account"]')).not.toBeNull()
  })

  it('keeps Post enabled for a flagged DRAFT, and shows no warning on a POSTED row with an unflagged account', async () => {
    const first = renderPage([row({
      status: 'DRAFT',
      clearingAccount: { id: 'c', code: '1200', name: 'CIMB', isProviderClearing: true },
    })])
    expect(screen.queryByText('Not provider clearing')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /row actions/i }))
    expect(screen.getByRole('menuitem', { name: 'Post' })).not.toHaveAttribute('aria-disabled', 'true')
    first.unmount()

    renderPage([row({
      id: 'ps-2',
      status: 'POSTED',
      clearingAccount: { id: 'c', code: '1200', name: 'CIMB', isProviderClearing: false },
    })])
    expect(screen.queryByText('Not provider clearing')).not.toBeInTheDocument()
  })

  // #1285: the warning is a pure function of the refetched payload, so a fresh
  // render with a now-flagged account clears both the chip and the block.
  // Fresh JSX per render — React 19 bails out on an identical element ref.
  it('clears the warning chip and re-enables Post when the refetched account becomes flagged', async () => {
    const page = () => (
      <MemoryRouter>
        <ProviderSettlementsPage />
      </MemoryRouter>
    )
    const list = (isProviderClearing: boolean) => ({
      data: {
        data: [row({
          status: 'DRAFT',
          clearingAccount: { id: 'c', code: '1200', name: 'CIMB', isProviderClearing },
        })],
        meta: { total: 1, page: 1, limit: 25 },
      },
      isLoading: false, isError: false,
    })

    mockList.mockReturnValue(list(false))
    const { rerender } = render(page())
    expect(await screen.findByText('Not provider clearing')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /row actions/i }))
    expect(screen.getByRole('menuitem', { name: 'Post' })).toHaveAttribute('aria-disabled', 'true')

    // Close the menu: an open MUI Menu marks the page aria-hidden, hiding the
    // row-actions button from role queries after the rerender.
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())

    mockList.mockReturnValue(list(true))
    rerender(page())
    await waitFor(() =>
      expect(screen.queryByText('Not provider clearing')).not.toBeInTheDocument(),
    )
    await userEvent.click(screen.getByRole('button', { name: /row actions/i }))
    expect(screen.getByRole('menuitem', { name: 'Post' })).not.toHaveAttribute('aria-disabled', 'true')
  })

  // #1289: the options are the methods that OWN a settlement, served by the
  // backend in order. A deactivated or soft-deleted owner stays filterable and
  // says why it is no longer offered elsewhere.
  it('offers each settlement-owning method, marking inactive and deleted ones', async () => {
    mockProviders.mockReturnValue({
      data: [
        { id: 'pm-shopee', name: 'Shopee', isActive: true, deleted: false },
        { id: 'pm-atome', name: 'Atome', isActive: false, deleted: false },
        { id: 'pm-tiktok', name: 'TikTok', isActive: true, deleted: true },
        { id: 'pm-grab', name: 'Grab', isActive: false, deleted: true },
      ],
      isLoading: false,
    })
    renderPage([row()])
    await userEvent.click(screen.getByLabelText('Provider'))
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual([
      'All providers', 'Shopee', 'Atome (inactive)', 'TikTok (deleted)', 'Grab (deleted)',
    ])

    await userEvent.click(screen.getByRole('option', { name: 'Atome (inactive)' }))
    await waitFor(() => {
      expect(mockList).toHaveBeenLastCalledWith(
        expect.objectContaining({ providerPaymentMethodId: 'pm-atome' }),
      )
    })
  })

  it('passes the status filter into the query once chosen', async () => {
    renderPage([row()])
    // The real FilterBar (not mocked here) has no global Apply button:
    // onQuickFilterChange promotes a select's draft value to applied state
    // immediately, so the query re-runs as soon as the option is clicked.
    await userEvent.click(screen.getByLabelText('Status'))
    await userEvent.click(screen.getByRole('option', { name: 'Posted' }))

    // One argument: the component calls useGetProviderSettlementsQuery(params)
    // with no options object. Asserting a second arg fails on the real call.
    await waitFor(() => {
      expect(mockList).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'POSTED' }),
      )
    })
  })

  // #1277: Create returns here and hands the new draft's id back in history
  // state, the way Owner Equity does (#1088). The tint is a one-shot
  // confirmation of the return trip, so it is copied into local state and
  // dropped from history immediately.
  describe('create highlight', () => {
    const HIGHLIGHT = alpha(darkTheme.palette.primary.main, 0.2)

    // A data router, so the test can read the history entry's state after the
    // page has replaced it — MemoryRouter exposes no handle on it.
    function renderWithState(rows: any[], state: unknown, search = '') {
      mockList.mockReturnValue({
        data: { data: rows, meta: { total: rows.length, page: 1, limit: 25 } },
        isLoading: false, isError: false,
      })
      const router = createMemoryRouter(
        [{ path: '/accounting/provider-settlements', element: <ProviderSettlementsPage /> }],
        { initialEntries: [{ pathname: '/accounting/provider-settlements', search, state }] },
      )
      render(<RouterProvider router={router} />)
      return router
    }

    it('highlights the row named by incoming location state, and only that row', async () => {
      renderWithState(
        [row(), row({ id: 'ps-2', referenceNumber: 'PS-26-002' })],
        { highlightProviderSettlementId: 'ps-2' },
      )
      await waitFor(() => {
        expect(screen.getByText('PS-26-002').closest('tr')).toHaveStyle({ backgroundColor: HIGHLIGHT })
      })
      expect(screen.getByText('PS-26-001').closest('tr')).not.toHaveStyle({ backgroundColor: HIGHLIGHT })
    })

    it('clears the history state but keeps the query string', async () => {
      const router = renderWithState([row()], { highlightProviderSettlementId: 'ps-1' }, '?x=1')
      await waitFor(() => expect(router.state.location.state).toBeNull())
      expect(router.state.location.search).toBe('?x=1')
      // Still highlighted after the state is gone: it lives in local state.
      expect(screen.getByText('PS-26-001').closest('tr')).toHaveStyle({ backgroundColor: HIGHLIGHT })
    })

    it('highlights nothing when no state arrives', () => {
      renderWithState([row()], null)
      expect(screen.getByText('PS-26-001').closest('tr')).not.toHaveStyle({ backgroundColor: HIGHLIGHT })
    })
  })
})
