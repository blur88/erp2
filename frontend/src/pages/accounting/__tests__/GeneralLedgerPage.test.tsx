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

import GeneralLedgerPage from '../GeneralLedgerPage'

function renderPage(initialEntry = '/accounting/general-ledger') {
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

    renderPage('/accounting/general-ledger?accountId=acct-1')

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

    renderPage('/accounting/general-ledger?accountId=acct-1&sourceType=SALES_ORDER')

    const [params, options] = mockGLQuery.mock.calls.at(-1)!
    expect(params).toMatchObject({ accountId: 'acct-1', sourceType: 'SALES_ORDER' })
    expect(options).toMatchObject({ skip: false })
  })

  it('accepts EXPENSE as a valid sourceType and forwards it to the GL query', () => {
    mockAccountsQuery.mockReturnValue({ data: mockAccounts, isFetching: false })
    mockGLQuery.mockReturnValue({ data: mockGLData, isFetching: false })

    renderPage('/accounting/general-ledger?accountId=acct-1&sourceType=EXPENSE')

    const [params, options] = mockGLQuery.mock.calls.at(-1)!
    expect(params).toMatchObject({ accountId: 'acct-1', sourceType: 'EXPENSE' })
    expect(options).toMatchObject({ skip: false })
  })

  it('changing one filter updates the URL and preserves the other query params', async () => {
    mockAccountsQuery.mockReturnValue({ data: mockAccounts, isFetching: false })
    mockGLQuery.mockReturnValue({ data: mockGLData, isFetching: false })

    const router = renderPage('/accounting/general-ledger?accountId=acct-1')

    const fromField = screen.getByRole('group', { name: /from date/i })
    const user = userEvent.setup()
    await user.click(within(fromField).getByRole('spinbutton', { name: /day/i }))
    for (const ch of ['0', '1', '0', '7', '2', '0', '2', '6']) {
      await user.keyboard(ch)
    }

    await waitFor(() => {
      const search = new URLSearchParams(router.state.location.search)
      expect(search.get('fromDate')).toBe('2026-07-01')
      expect(search.get('accountId')).toBe('acct-1')
    })

    const [params] = mockGLQuery.mock.calls.at(-1)!
    expect(params).toMatchObject({
      accountId: 'acct-1',
      fromDate: '2026-07-01',
    })
  })

  it('clearing From Date removes the param and omits it from the GL query', async () => {
    mockAccountsQuery.mockReturnValue({ data: mockAccounts, isFetching: false })
    mockGLQuery.mockReturnValue({ data: mockGLData, isFetching: false })

    const router = renderPage(
      '/accounting/general-ledger?accountId=acct-1&fromDate=2026-07-01',
    )

    await userEvent.click(screen.getByRole('button', { name: /clear/i }))

    await waitFor(() => {
      expect(new URLSearchParams(router.state.location.search).has('fromDate')).toBe(false)
    })
    expect(mockGLQuery.mock.calls.at(-1)?.[0].fromDate).toBeUndefined()
  })

  it('clearing a filter deletes its key from the URL', async () => {
    mockAccountsQuery.mockReturnValue({ data: mockAccounts, isFetching: false })
    mockGLQuery.mockReturnValue({ data: mockGLData, isFetching: false })

    const router = renderPage(
      '/accounting/general-ledger?accountId=acct-1&sourceType=SALES_ORDER',
    )

    await act(async () => {
      fireEvent.mouseDown(screen.getByRole('combobox', { name: /source type/i }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: /all sources/i }))
    })

    const search = new URLSearchParams(router.state.location.search)
    expect(search.has('sourceType')).toBe(false)
    expect(search.get('accountId')).toBe('acct-1')
  })

  it('skips the GL request and drops a bogus accountId not in the loaded accounts', async () => {
    mockAccountsQuery.mockReturnValue({ data: mockAccounts, isFetching: false })
    mockGLQuery.mockReturnValue({ data: undefined, isFetching: false })

    const router = renderPage('/accounting/general-ledger?accountId=does-not-exist')

    const [params, options] = mockGLQuery.mock.calls.at(-1)!
    expect(params.accountId).toBe('')
    expect(options).toMatchObject({ skip: true })
    expect(
      screen.getByText('Select an account to view ledger movements.'),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(new URLSearchParams(router.state.location.search).has('accountId')).toBe(false)
    })
  })

  it('treats an invalid sourceType as empty and removes it from the URL', async () => {
    mockAccountsQuery.mockReturnValue({ data: mockAccounts, isFetching: false })
    mockGLQuery.mockReturnValue({ data: mockGLData, isFetching: false })

    const router = renderPage('/accounting/general-ledger?accountId=acct-1&sourceType=BOGUS')

    const [params] = mockGLQuery.mock.calls.at(-1)!
    expect(params.sourceType).toBeUndefined()
    await waitFor(() => {
      expect(new URLSearchParams(router.state.location.search).has('sourceType')).toBe(false)
    })
  })

  it('removes a present-but-empty sourceType key from the URL', async () => {
    mockAccountsQuery.mockReturnValue({ data: mockAccounts, isFetching: false })
    mockGLQuery.mockReturnValue({ data: mockGLData, isFetching: false })

    const router = renderPage('/accounting/general-ledger?accountId=acct-1&sourceType=')

    await waitFor(() => {
      expect(new URLSearchParams(router.state.location.search).has('sourceType')).toBe(false)
    })
  })

  it('treats a calendar-impossible date as empty and removes it from the URL', async () => {
    mockAccountsQuery.mockReturnValue({ data: mockAccounts, isFetching: false })
    mockGLQuery.mockReturnValue({ data: mockGLData, isFetching: false })

    const router = renderPage('/accounting/general-ledger?accountId=acct-1&fromDate=2026-02-31')

    const [params] = mockGLQuery.mock.calls.at(-1)!
    expect(params.fromDate).toBeUndefined()
    await waitFor(() => {
      expect(new URLSearchParams(router.state.location.search).has('fromDate')).toBe(false)
    })
  })

  it('renders an error panel when the GL request fails', () => {
    mockAccountsQuery.mockReturnValue({ data: mockAccounts, isFetching: false })
    mockGLQuery.mockReturnValue({ data: undefined, isFetching: false, error: { status: 500 } })

    renderPage('/accounting/general-ledger?accountId=acct-1')

    expect(
      screen.getByText('Unable to load the general ledger. Please try again.'),
    ).toBeInTheDocument()
  })

  it('flags an inverted date range and omits toDate from the GL query', () => {
    mockAccountsQuery.mockReturnValue({ data: mockAccounts, isFetching: false })
    mockGLQuery.mockReturnValue({ data: mockGLData, isFetching: false })

    renderPage(
      '/accounting/general-ledger?accountId=acct-1&fromDate=2026-07-10&toDate=2026-07-01',
    )

    // Both dates are individually valid, so both stay in the URL / controls...
    const [params] = mockGLQuery.mock.calls.at(-1)!
    expect(params.fromDate).toBe('2026-07-10')
    // ...but the inverted toDate is not sent to the backend (guaranteed-empty window).
    expect(params.toDate).toBeUndefined()
    // Inline validation surfaced on the To Date field.
    expect(screen.getByText('To Date is before From Date')).toBeInTheDocument()
  })

  it('renders the account code and name as a header badge', () => {
    mockAccountsQuery.mockReturnValue({ data: mockAccounts, isFetching: false })
    mockGLQuery.mockReturnValue({ data: mockGLData, isFetching: false })

    renderPage('/accounting/general-ledger?accountId=acct-1')

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

    renderPage('/accounting/general-ledger?accountId=acct-1')

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

    renderPage('/accounting/general-ledger?accountId=acct-1')

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
      '/accounting/general-ledger?accountId=acct-1&sourceType=SALES_ORDER',
    )

    await user.click(screen.getByRole('link', { name: 'SO-001' }))
    expect(screen.getByText('Sales Order Page')).toBeInTheDocument()

    await act(async () => {
      await router.navigate(-1)
    })

    const search = new URLSearchParams(router.state.location.search)
    expect(search.get('accountId')).toBe('acct-1')
    expect(search.get('sourceType')).toBe('SALES_ORDER')
    const [params] = mockGLQuery.mock.calls.at(-1)!
    expect(params).toMatchObject({ accountId: 'acct-1', sourceType: 'SALES_ORDER' })
    expect(screen.getByText('JV-001')).toBeInTheDocument()
  })
})
