import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const { mockAccounts, mockGLData, mockAccountsQuery, mockGLQuery, mockListSkeleton } = vi.hoisted(() => ({
  mockAccounts: {
    data: [
      {
        id: 'acct-1',
        code: '1100',
        name: 'Cash',
        type: 'Asset' as const,
        parentId: null,
        description: null,
        isActive: true,
        createdBy: null,
        isSystem: false,
        isPostable: true,
        openingBalance: '0.0000',
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'acct-2',
        code: '1200',
        name: 'Bank Account',
        type: 'Asset' as const,
        parentId: null,
        description: null,
        isActive: true,
        createdBy: null,
        isSystem: false,
        isPostable: true,
        openingBalance: '1000.0000',
        createdAt: '',
        updatedAt: '',
      },
    ],
    meta: { total: 2 },
  },
  mockGLData: {
    account: { id: 'acct-1', code: '1100', name: 'Cash' },
    openingBalance: '5000.0000',
    movements: [
      {
        date: '2026-07-01',
        journalEntryId: 'je-1',
        journalNo: 'JV-001',
        description: 'Initial balance entry',
        debit: '5000.0000',
        credit: '0.0000',
        balance: '10000.0000',
        sourceType: 'OPENING_BALANCE' as const,
        sourceDocumentId: null,
        sourceRef: null,
      },
      {
        date: '2026-07-05',
        journalEntryId: 'je-2',
        journalNo: 'JV-002',
        description: 'Sales revenue',
        debit: '0.0000',
        credit: '2000.0000',
        balance: '8000.0000',
        sourceType: 'SALES_ORDER' as const,
        sourceDocumentId: 'so-1',
        sourceRef: 'SO-001',
      },
    ],
    totalDebit: '5000.0000',
    totalCredit: '2000.0000',
    closingBalance: '8000.0000',
  },
  mockAccountsQuery: vi.fn().mockReturnValue({ data: null, isFetching: false }),
  mockGLQuery: vi.fn().mockReturnValue({ data: undefined, isFetching: false }),
  mockListSkeleton: vi.fn(() => <div data-testid="list-skeleton" />),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useGetAccountsQuery: mockAccountsQuery,
  useGetGeneralLedgerQuery: mockGLQuery,
}))

vi.mock('@/components/common/ListSkeleton', () => ({
  ListSkeleton: mockListSkeleton,
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'

import GeneralLedgerPage from '../GeneralLedgerPage'

// useFilterBar reads and writes the LIVE url via window.history.replaceState,
// which MemoryRouter never populates or observes (#1131 review). Seed the real
// url from the same entry the router gets, and read filter state back from
// window.location — router.state.location only sees router-driven navigation.
function currentSearch(): URLSearchParams {
  return new URLSearchParams(window.location.search)
}

function renderPage(initialEntry = '/accounting/general-ledger') {
  window.history.replaceState(null, '', initialEntry)
  const store = configureStore({ reducer: { empty: (s = null) => s } })
  const router = createMemoryRouter(
    [
      { path: '/accounting/general-ledger', element: <GeneralLedgerPage /> },
      { path: '/sales/orders/:id/view', element: <div>Sales Order Page</div> },
      { path: '/accounting/journal-entries/:id', element: <div>JE Page</div> },
    ],
    { initialEntries: [initialEntry] },
  )
  render(
    <Provider store={store}>
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <RouterProvider router={router} />
      </LocalizationProvider>
    </Provider>,
  )
  return router
}

describe('GeneralLedgerPage', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  beforeEach(() => {
    mockGLQuery.mockReturnValue({ data: undefined, isFetching: false })
    mockAccountsQuery.mockReturnValue({ data: null, isFetching: false })
    mockListSkeleton.mockClear()
  })

  it('shows empty state when no account is selected', () => {
    renderPage()
    expect(
      screen.getByText('Select an account to view ledger movements.'),
    ).toBeInTheDocument()
  })

  it('renders movements, opening balance, and closing balance when an account is selected', () => {
    mockAccountsQuery.mockReturnValue({ data: mockAccounts, isFetching: false })
    mockGLQuery.mockReturnValue({ data: mockGLData, isFetching: false })

    renderPage('/accounting/general-ledger?account=acct-1')

    const accountInfoElements = screen.getAllByText('1100 - Cash')
    expect(accountInfoElements.length).toBeGreaterThanOrEqual(1)
    const obTexts = screen.getAllByText(/Opening Balance/)
    expect(obTexts.length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/5,000/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('JV-001')).toBeInTheDocument()
    expect(screen.getByText('JV-002')).toBeInTheDocument()

    const soLink = screen.getByRole('link', { name: 'SO-001' })
    expect(soLink).toHaveAttribute('href', '/sales/orders/SO-001/view')
    expect(soLink).toHaveAccessibleDescription('Sales Order')
  })

  it('reads accountId and sourceType from the URL and sends them to the GL query', () => {
    mockAccountsQuery.mockReturnValue({ data: mockAccounts, isFetching: false })
    mockGLQuery.mockReturnValue({ data: mockGLData, isFetching: false })

    renderPage('/accounting/general-ledger?account=acct-1&sourceType=SALES_ORDER')

    const [params, options] = mockGLQuery.mock.calls.at(-1)!
    expect(params).toMatchObject({ accountId: 'acct-1', sourceType: 'SALES_ORDER' })
    expect(options).toMatchObject({ skip: false })
  })

  it('accepts EXPENSE as a valid sourceType and forwards it to the GL query', () => {
    mockAccountsQuery.mockReturnValue({ data: mockAccounts, isFetching: false })
    mockGLQuery.mockReturnValue({ data: mockGLData, isFetching: false })

    renderPage('/accounting/general-ledger?account=acct-1&sourceType=EXPENSE')

    const [params, options] = mockGLQuery.mock.calls.at(-1)!
    expect(params).toMatchObject({ accountId: 'acct-1', sourceType: 'EXPENSE' })
    expect(options).toMatchObject({ skip: false })
  })

  it('applies a period preset, writing it to the URL and resolving it to a date range', async () => {
    mockAccountsQuery.mockReturnValue({ data: mockAccounts, isFetching: false })
    mockGLQuery.mockReturnValue({ data: mockGLData, isFetching: false })

    const router = renderPage('/accounting/general-ledger?account=acct-1')

    const user = userEvent.setup()
    // The Period trigger is a Select whose label is not wired to it, so it has
    // no accessible name — address it positionally, as the sibling Journal
    // Entries filter test does. Order: Account, Period, Source Type.
    const combos = screen.getAllByRole('combobox')
    await user.click(combos[1])
    await user.click(await screen.findByRole('menuitem', { name: 'This Year' }))

    await waitFor(() => {
      const search = currentSearch()
      expect(search.get('period')).toBe('this_year')
      expect(search.get('account')).toBe('acct-1')
    })

    // The preset is resolved to concrete dates before it reaches the query.
    const expected = getPeriodDateRange('this_year', getStartOfWeek())
    const [params] = mockGLQuery.mock.calls.at(-1)!
    expect(params).toMatchObject({
      accountId: 'acct-1',
      fromDate: expected.from,
      toDate: expected.to,
    })
  })

  it('reads a custom period range from the URL and forwards both bounds', () => {
    mockAccountsQuery.mockReturnValue({ data: mockAccounts, isFetching: false })
    mockGLQuery.mockReturnValue({ data: mockGLData, isFetching: false })

    renderPage(
      '/accounting/general-ledger?account=acct-1&period=custom' +
        '&period_from=2026-07-01&period_to=2026-07-31',
    )

    const [params] = mockGLQuery.mock.calls.at(-1)!
    expect(params).toMatchObject({
      accountId: 'acct-1',
      fromDate: '2026-07-01',
      toDate: '2026-07-31',
    })
  })

  it('resets every filter and clears the managed params from the URL', async () => {
    mockAccountsQuery.mockReturnValue({ data: mockAccounts, isFetching: false })
    mockGLQuery.mockReturnValue({ data: mockGLData, isFetching: false })

    const router = renderPage(
      '/accounting/general-ledger?account=acct-1&period=this_year&sourceType=SALES_ORDER',
    )

    await userEvent.click(screen.getByRole('button', { name: /reset/i }))

    await waitFor(() => {
      const search = currentSearch()
      expect(search.has('account')).toBe(false)
      expect(search.has('period')).toBe(false)
      expect(search.has('sourceType')).toBe(false)
    })

    // With no account the request is skipped and the empty state returns.
    const [params, options] = mockGLQuery.mock.calls.at(-1)!
    expect(params.accountId).toBe('')
    expect(options).toMatchObject({ skip: true })
    expect(
      screen.getByText('Select an account to view ledger movements.'),
    ).toBeInTheDocument()
  })

  it('clearing a filter deletes its key from the URL', async () => {
    mockAccountsQuery.mockReturnValue({ data: mockAccounts, isFetching: false })
    mockGLQuery.mockReturnValue({ data: mockGLData, isFetching: false })

    const router = renderPage(
      '/accounting/general-ledger?account=acct-1&sourceType=SALES_ORDER',
    )

    await act(async () => {
      fireEvent.mouseDown(screen.getByRole('combobox', { name: /source type/i }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: 'All' }))
    })

    await waitFor(() => {
      const search = currentSearch()
      expect(search.has('sourceType')).toBe(false)
      expect(search.get('account')).toBe('acct-1')
    })
  })

  it('selecting an account from the filter bar drives the URL and the query', async () => {
    mockAccountsQuery.mockReturnValue({ data: mockAccounts, isFetching: false })
    mockGLQuery.mockReturnValue({ data: mockGLData, isFetching: false })

    const router = renderPage()

    await act(async () => {
      fireEvent.mouseDown(screen.getByRole('combobox', { name: /account/i }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: '1200 - Bank Account' }))
    })

    await waitFor(() => {
      expect(currentSearch().get('account')).toBe('acct-2')
    })
    const [params, options] = mockGLQuery.mock.calls.at(-1)!
    expect(params.accountId).toBe('acct-2')
    expect(options).toMatchObject({ skip: false })
  })

  it('skips the GL request and drops a bogus account not in the loaded accounts', async () => {
    mockAccountsQuery.mockReturnValue({ data: mockAccounts, isFetching: false })
    mockGLQuery.mockReturnValue({ data: undefined, isFetching: false })

    const router = renderPage('/accounting/general-ledger?account=does-not-exist')

    const [params, options] = mockGLQuery.mock.calls.at(-1)!
    expect(params.accountId).toBe('')
    expect(options).toMatchObject({ skip: true })
    expect(
      screen.getByText('Select an account to view ledger movements.'),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(currentSearch().has('account')).toBe(false)
    })
  })

  it('preserves an account from the URL while the account options are still loading', () => {
    // An in-flight options query yields no data, and an empty allow-list would
    // otherwise reject a perfectly valid id (#1017).
    mockAccountsQuery.mockReturnValue({ data: null, isFetching: true })
    mockGLQuery.mockReturnValue({ data: mockGLData, isFetching: false })

    renderPage('/accounting/general-ledger?account=acct-1')

    const [params, options] = mockGLQuery.mock.calls.at(-1)!
    expect(params.accountId).toBe('acct-1')
    expect(options).toMatchObject({ skip: false })
  })

  it('treats an invalid sourceType as empty and removes it from the URL', async () => {
    mockAccountsQuery.mockReturnValue({ data: mockAccounts, isFetching: false })
    mockGLQuery.mockReturnValue({ data: mockGLData, isFetching: false })

    const router = renderPage('/accounting/general-ledger?account=acct-1&sourceType=BOGUS')

    const [params] = mockGLQuery.mock.calls.at(-1)!
    expect(params.sourceType).toBeUndefined()
    await waitFor(() => {
      expect(currentSearch().has('sourceType')).toBe(false)
    })
  })

  it('removes a present-but-empty sourceType key from the URL', async () => {
    mockAccountsQuery.mockReturnValue({ data: mockAccounts, isFetching: false })
    mockGLQuery.mockReturnValue({ data: mockGLData, isFetching: false })

    const router = renderPage('/accounting/general-ledger?account=acct-1&sourceType=')

    await waitFor(() => {
      expect(currentSearch().has('sourceType')).toBe(false)
    })
  })

  it('ignores an unrecognised period key and sends no dates', async () => {
    mockAccountsQuery.mockReturnValue({ data: mockAccounts, isFetching: false })
    mockGLQuery.mockReturnValue({ data: mockGLData, isFetching: false })

    const router = renderPage('/accounting/general-ledger?account=acct-1&period=BOGUS')

    const [params] = mockGLQuery.mock.calls.at(-1)!
    expect(params.fromDate).toBeUndefined()
    expect(params.toDate).toBeUndefined()
    await waitFor(() => {
      expect(currentSearch().has('period')).toBe(false)
    })
  })

  it('renders an error panel when the GL request fails', () => {
    mockAccountsQuery.mockReturnValue({ data: mockAccounts, isFetching: false })
    mockGLQuery.mockReturnValue({ data: undefined, isFetching: false, error: { status: 500 } })

    renderPage('/accounting/general-ledger?account=acct-1')

    expect(
      screen.getByText('Unable to load the general ledger. Please try again.'),
    ).toBeInTheDocument()
  })

  it('renders the account code and name as a header badge', () => {
    mockAccountsQuery.mockReturnValue({ data: mockAccounts, isFetching: false })
    mockGLQuery.mockReturnValue({ data: mockGLData, isFetching: false })

    renderPage('/accounting/general-ledger?account=acct-1')

    // Hyphen form, not a middot. Scoped to the badge so the Account select's
    // selected MenuItem (same string) cannot satisfy this on its own.
    const badge = screen.getByTestId('gl-account-badge')
    expect(badge).toHaveTextContent('1100 - Cash')

    const strip = screen.getByTestId('gl-summary-strip')
    expect(strip).toHaveTextContent(/Opening Balance/)
    expect(strip).toHaveTextContent(/Closing Balance/)
  })

  it('renders a 7-column skeleton while the initial ledger request is in flight', () => {
    mockAccountsQuery.mockReturnValue({ data: mockAccounts, isFetching: false })
    mockGLQuery.mockReturnValue({ data: undefined, isFetching: true })

    renderPage('/accounting/general-ledger?account=acct-1')

    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    expect(screen.getByTestId('list-skeleton')).toBeInTheDocument()
    // 7 columns: Date, Journal No., Description, Debit, Credit, Balance, Source.
    expect(mockListSkeleton.mock.calls[0][0]).toMatchObject({ rows: 8, columns: 7 })
  })

  it('shows the error alert when a refetch fails while stale data is still displayed', () => {
    mockAccountsQuery.mockReturnValue({ data: mockAccounts, isFetching: false })
    mockGLQuery.mockReturnValue({
      data: mockGLData,
      isFetching: false,
      error: { status: 500, data: 'boom' },
    })

    renderPage('/accounting/general-ledger?account=acct-1')

    expect(
      screen.getByText('Unable to load the general ledger. Please try again.'),
    ).toBeInTheDocument()
    // Stale data stays on screen alongside the error.
    expect(screen.getByText('JV-001')).toBeInTheDocument()
  })

  it('restores filters after navigating to a source document and back', async () => {
    const user = userEvent.setup()
    mockAccountsQuery.mockReturnValue({ data: mockAccounts, isFetching: false })
    mockGLQuery.mockReturnValue({ data: mockGLData, isFetching: false })

    const router = renderPage(
      '/accounting/general-ledger?account=acct-1&sourceType=SALES_ORDER',
    )

    await user.click(screen.getByRole('link', { name: 'SO-001' }))
    expect(screen.getByText('Sales Order Page')).toBeInTheDocument()

    await act(async () => {
      await router.navigate(-1)
    })

    const search = currentSearch()
    expect(search.get('account')).toBe('acct-1')
    expect(search.get('sourceType')).toBe('SALES_ORDER')
    const [params] = mockGLQuery.mock.calls.at(-1)!
    expect(params).toMatchObject({ accountId: 'acct-1', sourceType: 'SALES_ORDER' })
    expect(screen.getByText('JV-001')).toBeInTheDocument()
  })
})
