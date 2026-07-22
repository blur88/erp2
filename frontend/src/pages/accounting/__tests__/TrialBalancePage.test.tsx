import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const {
  balancedData,
  imbalancedData,
  noZeroData,
  withZeroData,
  mockUseGetTrialBalanceQuery,
} = vi.hoisted(() => {
  const balanced = {
    rows: [
      { accountId: 'acc-1100', code: '1100', name: 'Cash', debit: '5000.0000', credit: '0.0000' },
      {
        accountId: 'acc-2100',
        code: '2100',
        name: 'Customer Deposit',
        debit: '0.0000',
        credit: '5000.0000',
      },
    ],
    totalDebit: '5000.0000',
    totalCredit: '5000.0000',
    difference: '0.0000',
    balanced: true,
  }

  const imbalanced = {
    rows: [
      { accountId: 'acc-1100', code: '1100', name: 'Cash', debit: '5000.0000', credit: '0.0000' },
      {
        accountId: 'acc-2100',
        code: '2100',
        name: 'Customer Deposit',
        debit: '0.0000',
        credit: '4000.0000',
      },
    ],
    totalDebit: '5000.0000',
    totalCredit: '4000.0000',
    difference: '1000.0000',
    balanced: false,
  }

  const zeroAccount = {
    accountId: 'acc-3000',
    code: '3000',
    name: 'Retained Earnings',
    debit: '0.0000',
    credit: '0.0000',
  }

  return {
    balancedData: balanced,
    imbalancedData: imbalanced,
    noZeroData: { ...balanced, rows: [...balanced.rows] },
    withZeroData: { ...balanced, rows: [...balanced.rows, zeroAccount] },
    mockUseGetTrialBalanceQuery: vi.fn(),
  }
})

vi.mock('@/store/api/accountingApi', () => ({
  useGetTrialBalanceQuery: mockUseGetTrialBalanceQuery,
}))

import TrialBalancePage from '../TrialBalancePage'

function renderPage(initialUrl = '/accounting/trial-balance') {
  const store = configureStore({ reducer: { empty: (s = null) => s } })
  const router = createMemoryRouter(
    [
      { path: '/accounting/trial-balance', element: <TrialBalancePage /> },
      { path: '/accounting/general-ledger', element: <div>GL stub</div> },
    ],
    { initialEntries: [initialUrl] },
  )
  const utils = render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  )
  return { ...utils, router }
}

function searchOf(router: ReturnType<typeof renderPage>['router']) {
  return new URLSearchParams(router.state.location.search)
}

describe('TrialBalancePage default As of Date', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-19T17:00:00.000Z'))
    localStorage.setItem('timezone', 'Asia/Kuala_Lumpur')
    mockUseGetTrialBalanceQuery.mockReturnValue({
      data: balancedData,
      currentData: balancedData,
      isFetching: false,
      error: undefined,
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    localStorage.removeItem('timezone')
  })

  it('defaults to the app-timezone local date, not the UTC date', () => {
    renderPage()
    const input = screen.getByLabelText(/as of date/i) as HTMLInputElement
    expect(input.value).toBe('2026-07-20')
    expect(input.value).not.toBe('2026-07-19')
  })
})

describe('TrialBalancePage', () => {
  beforeEach(() => {
    mockUseGetTrialBalanceQuery.mockReset()
    mockUseGetTrialBalanceQuery.mockReturnValue({
      data: balancedData,
      currentData: balancedData,
      isFetching: false,
      error: undefined,
    })
  })

  it('shows accounts with debit > 0 in debit column and credit > 0 in credit column', () => {
    renderPage()
    expect(screen.getByText('Cash')).toBeInTheDocument()
    expect(screen.getByText('Customer Deposit')).toBeInTheDocument()
    expect(screen.getByText('1100')).toBeInTheDocument()
    expect(screen.getByText('2100')).toBeInTheDocument()
  })

  it('renders warning Alert for imbalanced trial balance', () => {
    mockUseGetTrialBalanceQuery.mockReturnValue({
      data: imbalancedData,
      currentData: imbalancedData,
      isFetching: false,
      error: undefined,
    })
    renderPage()
    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(alert).toHaveTextContent(/not balanced/i)
    expect(alert).toHaveTextContent('RM 1,000.00')
    expect(alert).not.toHaveTextContent('1000.0000')
  })

  it('does not render warning Alert for balanced trial balance', () => {
    renderPage()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows zero-balance rows after toggling "Show zero-balance accounts" checkbox', async () => {
    const user = userEvent.setup()
    mockUseGetTrialBalanceQuery.mockImplementation(
      (params: { asOfDate?: string; showZero?: boolean }) => {
        if (params.showZero) {
          return {
            data: withZeroData,
            currentData: withZeroData,
            isFetching: false,
            error: undefined,
          }
        }
        return {
          data: noZeroData,
          currentData: noZeroData,
          isFetching: false,
          error: undefined,
        }
      },
    )
    renderPage()

    expect(screen.queryByText('Retained Earnings')).not.toBeInTheDocument()

    const checkbox = screen.getByLabelText(/show zero.balance/i)
    await user.click(checkbox)

    expect(screen.getByText('Retained Earnings')).toBeInTheDocument()
  })

  it('requests refetch on focus and on mount/arg change', () => {
    renderPage()
    const options = mockUseGetTrialBalanceQuery.mock.calls[0][1]
    expect(options).toMatchObject({
      refetchOnFocus: true,
      refetchOnMountOrArgChange: true,
    })
  })

  it('formats row cells and totals as currency, em-dash for zero', () => {
    renderPage()
    const cash = screen.getByText('Cash').closest('tr')!.querySelectorAll('td')
    expect(cash[2]).toHaveTextContent('RM 5,000.00')
    expect(cash[2]).not.toHaveTextContent('5000.0000')
    expect(cash[3]).toHaveTextContent('—')
    expect(cash[3]).not.toHaveTextContent('RM')
    const deposit = screen.getByText('Customer Deposit').closest('tr')!.querySelectorAll('td')
    expect(deposit[2]).toHaveTextContent('—')
    expect(deposit[3]).toHaveTextContent('RM 5,000.00')
    const totalCells = screen.getByText('Total').closest('tr')!.querySelectorAll('td')
    expect(totalCells[1]).toHaveTextContent('RM 5,000.00')
    expect(totalCells[1]).not.toHaveTextContent('5000.0000')
    expect(totalCells[2]).toHaveTextContent('RM 5,000.00')
    expect(totalCells[2]).not.toHaveTextContent('5000.0000')
  })
})

describe('TrialBalancePage URL filters', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-07-20T04:00:00.000Z'))
    localStorage.setItem('timezone', 'Asia/Kuala_Lumpur')
    mockUseGetTrialBalanceQuery.mockReset()
    mockUseGetTrialBalanceQuery.mockReturnValue({
      data: balancedData,
      currentData: balancedData,
      isFetching: false,
      error: undefined,
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    localStorage.removeItem('timezone')
  })

  it('queries today and leaves the URL bare when no params are present', () => {
    const { router } = renderPage()
    expect(mockUseGetTrialBalanceQuery.mock.calls[0][0]).toMatchObject({
      asOfDate: '2026-07-20',
      showZero: false,
    })
    expect(searchOf(router).has('asOfDate')).toBe(false)
    expect(searchOf(router).has('showZero')).toBe(false)
  })

  it('hydrates the input and the query from a valid asOfDate param and keeps it', async () => {
    const { router } = renderPage('/accounting/trial-balance?asOfDate=2026-03-01')
    const input = screen.getByLabelText(/as of date/i) as HTMLInputElement
    expect(input.value).toBe('2026-03-01')
    const lastArgs = mockUseGetTrialBalanceQuery.mock.calls.at(-1)![0]
    expect(lastArgs).toMatchObject({ asOfDate: '2026-03-01' })
    await waitFor(() => {
      expect(searchOf(router).get('asOfDate')).toBe('2026-03-01')
    })
  })

  it('falls back to today and removes an impossible asOfDate from the URL', async () => {
    const { router } = renderPage('/accounting/trial-balance?asOfDate=2026-02-31')
    const input = screen.getByLabelText(/as of date/i) as HTMLInputElement
    expect(input.value).toBe('2026-07-20')
    await waitFor(() => {
      expect(searchOf(router).has('asOfDate')).toBe(false)
    })
  })

  it('treats showZero=1 as false and removes it from the URL', async () => {
    const { router } = renderPage('/accounting/trial-balance?showZero=1')
    const checkbox = screen.getByLabelText(/show zero.balance/i) as HTMLInputElement
    expect(checkbox.checked).toBe(false)
    await waitFor(() => {
      expect(searchOf(router).has('showZero')).toBe(false)
    })
  })

  it('removes a present-but-empty showZero param', async () => {
    const { router } = renderPage('/accounting/trial-balance?showZero=')
    await waitFor(() => {
      expect(searchOf(router).has('showZero')).toBe(false)
    })
  })

  it('checks the box and passes showZero from showZero=true', () => {
    renderPage('/accounting/trial-balance?showZero=true')
    const checkbox = screen.getByLabelText(/show zero.balance/i) as HTMLInputElement
    expect(checkbox.checked).toBe(true)
    expect(mockUseGetTrialBalanceQuery.mock.calls.at(-1)![0]).toMatchObject({
      showZero: true,
    })
  })

  it('writes showZero=true when toggled on and removes the param when toggled off', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { router } = renderPage()
    const checkbox = screen.getByLabelText(/show zero.balance/i)

    await user.click(checkbox)
    await waitFor(() => {
      expect(searchOf(router).get('showZero')).toBe('true')
    })

    await user.click(checkbox)
    await waitFor(() => {
      expect(searchOf(router).has('showZero')).toBe(false)
    })
  })

  it('writes asOfDate when the date changes and reverts to today when cleared', async () => {
    const { router } = renderPage()
    const input = screen.getByLabelText(/as of date/i) as HTMLInputElement

    fireEvent.change(input, { target: { value: '2026-01-15' } })
    await waitFor(() => {
      expect(searchOf(router).get('asOfDate')).toBe('2026-01-15')
    })

    fireEvent.change(input, { target: { value: '' } })
    await waitFor(() => {
      expect(searchOf(router).has('asOfDate')).toBe(false)
    })
    expect(mockUseGetTrialBalanceQuery.mock.calls.at(-1)![0]).toMatchObject({
      asOfDate: '2026-07-20',
    })
  })
})

describe('TrialBalancePage presentation', () => {
  beforeEach(() => {
    mockUseGetTrialBalanceQuery.mockReset()
    mockUseGetTrialBalanceQuery.mockReturnValue({
      data: balancedData,
      currentData: balancedData,
      isFetching: false,
      error: undefined,
    })
  })

  it('shows a Balanced chip and a summary strip with totals and difference', () => {
    renderPage()
    expect(screen.getByTestId('tb-balanced-chip')).toHaveTextContent('Balanced')
    const strip = screen.getByTestId('tb-summary-strip')
    expect(strip).toHaveTextContent('Total Debit')
    expect(strip).toHaveTextContent('Total Credit')
    expect(strip).toHaveTextContent('Difference')
    expect(strip).toHaveTextContent('RM 5,000.00')
    expect(strip).toHaveTextContent('RM 0.00')
  })

  it('shows an Unbalanced chip and the warning alert together', () => {
    mockUseGetTrialBalanceQuery.mockReturnValue({
      data: imbalancedData,
      currentData: imbalancedData,
      isFetching: false,
      error: undefined,
    })
    renderPage()
    expect(screen.getByTestId('tb-balanced-chip')).toHaveTextContent('Unbalanced')
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/not balanced/i)
    expect(alert).toHaveTextContent('RM 1,000.00')
  })

  it('renders a footer totals row and no separate difference row', () => {
    renderPage()
    const totalCells = screen.getByText('Total').closest('tr')!.querySelectorAll('td')
    expect(totalCells[1]).toHaveTextContent('RM 5,000.00')
    expect(totalCells[2]).toHaveTextContent('RM 5,000.00')
    expect(screen.queryByText(/^Difference:/)).not.toBeInTheDocument()
  })

  it('omits the footer when there are no rows', () => {
    mockUseGetTrialBalanceQuery.mockReturnValue({
      data: { ...balancedData, rows: [] },
      currentData: { ...balancedData, rows: [] },
      isFetching: false,
      error: undefined,
    })
    renderPage()
    expect(screen.getByText('No accounts found.')).toBeInTheDocument()
    expect(screen.queryByText('Total')).not.toBeInTheDocument()
  })

  it('shows the skeleton while fetching with no currentData', () => {
    mockUseGetTrialBalanceQuery.mockReturnValue({
      data: undefined,
      currentData: undefined,
      isFetching: true,
      error: undefined,
    })
    const { container } = renderPage()
    expect(container.querySelectorAll('.MuiSkeleton-root').length).toBeGreaterThan(0)
    expect(screen.queryByTestId('tb-summary-strip')).not.toBeInTheDocument()
  })

  it('keeps rows visible while refetching with currentData present', () => {
    mockUseGetTrialBalanceQuery.mockReturnValue({
      data: balancedData,
      currentData: balancedData,
      isFetching: true,
      error: undefined,
    })
    const { container } = renderPage()
    expect(screen.getByText('Cash')).toBeInTheDocument()
    expect(container.querySelectorAll('.MuiSkeleton-root').length).toBe(0)
  })

  it('shows the previous date\'s totals nowhere when a new argument is in flight', () => {
    mockUseGetTrialBalanceQuery.mockReturnValue({
      data: balancedData,
      currentData: undefined,
      isFetching: true,
      error: undefined,
    })
    renderPage()
    expect(screen.queryByText('Cash')).not.toBeInTheDocument()
    expect(screen.queryByTestId('tb-summary-strip')).not.toBeInTheDocument()
    expect(screen.queryByTestId('tb-balanced-chip')).not.toBeInTheDocument()
  })

  it('renders the error alert alone when there is no currentData', () => {
    mockUseGetTrialBalanceQuery.mockReturnValue({
      data: undefined,
      currentData: undefined,
      isFetching: false,
      error: { status: 500 },
    })
    const { container } = renderPage()
    expect(screen.getByRole('alert')).toHaveTextContent(/unable to load the trial balance/i)
    expect(container.querySelector('table')).toBeNull()
    expect(container.querySelectorAll('.MuiSkeleton-root').length).toBe(0)
  })

  it('renders the error alert above retained rows when currentData is present', () => {
    mockUseGetTrialBalanceQuery.mockReturnValue({
      data: balancedData,
      currentData: balancedData,
      isFetching: false,
      error: { status: 500 },
    })
    renderPage()
    expect(screen.getByText(/unable to load the trial balance/i)).toBeInTheDocument()
    expect(screen.getByText('Cash')).toBeInTheDocument()
    expect(screen.getByTestId('tb-summary-strip')).toBeInTheDocument()
  })
})

describe('TrialBalancePage drill-through to the General Ledger', () => {
  const AT_DATE = '/accounting/trial-balance?asOfDate=2026-01-31'

  beforeEach(() => {
    mockUseGetTrialBalanceQuery.mockReset()
    mockUseGetTrialBalanceQuery.mockReturnValue({
      data: balancedData,
      currentData: balancedData,
      isFetching: false,
      error: undefined,
    })
  })

  it('exposes each account row as a focusable link', () => {
    renderPage(AT_DATE)
    const rows = screen.getAllByRole('link')
    expect(rows).toHaveLength(2)
    rows.forEach((row) => expect(row).toHaveAttribute('tabindex', '0'))
  })

  it('navigates to the general ledger for the clicked account, carrying asOfDate as toDate', async () => {
    const { router } = renderPage(AT_DATE)
    await userEvent.click(screen.getAllByRole('link')[0])
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/accounting/general-ledger')
    })
    const search = searchOf(router)
    expect(search.get('accountId')).toBe('acc-1100')
    expect(search.get('toDate')).toBe('2026-01-31')
    expect(search.get('fromDate')).toBeNull()
  })

  it('navigates on Enter but not on Space', async () => {
    const { router } = renderPage(AT_DATE)
    const row = screen.getAllByRole('link')[1]
    row.focus()

    fireEvent.keyDown(row, { key: ' ', code: 'Space' })
    expect(router.state.location.pathname).toBe('/accounting/trial-balance')

    fireEvent.keyDown(row, { key: 'Enter', code: 'Enter' })
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/accounting/general-ledger')
    })
    expect(searchOf(router).get('accountId')).toBe('acc-2100')
  })

  it('navigates from a zero-balance row shown under showZero', async () => {
    mockUseGetTrialBalanceQuery.mockReturnValue({
      data: withZeroData,
      currentData: withZeroData,
      isFetching: false,
      error: undefined,
    })
    const { router } = renderPage('/accounting/trial-balance?asOfDate=2026-01-31&showZero=true')
    const rows = screen.getAllByRole('link')
    expect(rows).toHaveLength(3)

    await userEvent.click(rows[2])
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/accounting/general-ledger')
    })
    const search = searchOf(router)
    expect(search.get('accountId')).toBe('acc-3000')
    expect(search.get('toDate')).toBe('2026-01-31')
  })
})
