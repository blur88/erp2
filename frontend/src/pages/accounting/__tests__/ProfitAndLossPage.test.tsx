import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import ProfitAndLossPage from '../ProfitAndLossPage'
import type { ProfitAndLossResponse } from '@/types'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual<any>('react-router-dom')),
  useNavigate: () => mockNavigate,
}))

const mockQuery = vi.fn()
vi.mock('@/store/api/accountingApi', () => ({
  useGetProfitAndLossQuery: (...args: unknown[]) => mockQuery(...args),
}))

// The page reads company details for the print header. Without this mock the
// hook has no Redux Provider and every test in this file throws.
vi.mock('@/store/api/printSettingsApi', () => ({
  useGetPrintSettingsQuery: () => ({
    data: { id: '1', companyName: 'Acme Sdn Bhd', address: '1 Test Road' },
    isLoading: false,
  }),
}))

const RESPONSE: ProfitAndLossResponse = {
  year: 2026,
  availableYears: [2026, 2025],
  sections: [
    { rowId: 'revenue.section', key: 'revenue', label: 'Revenue', totalLabel: 'Total Revenue', total: '120000.0000', totalRowId: 'revenue.total',
      rows: [{ rowId: 'account:sales', accountId: 'sales', code: '4100', name: 'Sales Revenue', isPostable: true, amount: '120000.0000', children: [] }] },
    { rowId: 'cogs.section', key: 'cogs', label: 'Cost of Sales', totalLabel: 'Total Cost of Sales', total: '63000.0000', totalRowId: 'cogs.total',
      rows: [{ rowId: 'account:cogs', accountId: 'cogs', code: '5100', name: 'Cost of Goods Sold', isPostable: true, amount: '63000.0000', children: [] }] },
    { rowId: 'otherIncome.section', key: 'otherIncome', label: 'Other Income', totalLabel: 'Total Other Income', total: '0.0000', totalRowId: 'otherIncome.total', rows: [] },
    { rowId: 'expenses.section', key: 'expenses', label: 'Operating Expenses', totalLabel: 'Total Expenses', total: '8000.0000', totalRowId: 'expenses.total',
      rows: [{ rowId: 'account:oe', accountId: 'oe', code: '6990', name: 'Other Expenses', isPostable: true, amount: '8000.0000', children: [] }] },
  ],
  inventoryAdjustments: '200.0000',
  inventoryAdjustmentsRowId: 'cogs.adjustments',
  totalCostOfSales: '63200.0000',
  totalCostOfSalesRowId: 'cogs.total',
  grossProfit: '56800.0000',
  netProfit: '48800.0000',
  integrity: { anomalies: [], structuralFaults: [], tieOutOk: true, independentNetProfit: '48800.0000' },
}

/** RESPONSE with a non-postable structural category that expands. */
const withStructuralFixture: ProfitAndLossResponse = {
  ...RESPONSE,
  sections: RESPONSE.sections.map((s) => s.key !== 'expenses' ? s : {
    ...s,
    rows: [{
      rowId: 'account:oh', accountId: 'oh', code: '6500', name: 'Overheads',
      isPostable: false, amount: '8730.0000',
      children: [
        { rowId: 'account:phone', accountId: 'phone', code: '6920', name: 'Telephone', isPostable: true, amount: '730.0000', children: [] },
        { rowId: 'account:oe', accountId: 'oe', code: '6990', name: 'Other Expenses', isPostable: true, amount: '8000.0000', children: [] },
      ],
    }],
  }),
}

const renderPage = () =>
  render(<MemoryRouter initialEntries={['/accounting/profit-and-loss?year=2026']}><ProfitAndLossPage /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  mockQuery.mockReturnValue({ data: RESPONSE, currentData: RESPONSE, isLoading: false, isFetching: false, isError: false })
})

describe('ProfitAndLossPage', () => {
  it('renders every section in the specified order', () => {
    renderPage()
    const headings = screen.getAllByTestId(/^pl-section-/).map((el) => el.textContent)
    expect(headings.join(' ')).toMatch(/Revenue.*Cost of Sales.*Other Income.*Operating Expenses/s)
  })

  it('renders Gross Profit and Net Profit', () => {
    renderPage()
    expect(screen.getByTestId('pl-row-grossProfit')).toHaveTextContent('56,800.00')
    expect(screen.getByTestId('pl-row-netProfit')).toHaveTextContent('48,800.00')
  })

  it('renders the Inventory Adjustments row under Cost of Sales', () => {
    renderPage()
    expect(screen.getByTestId('pl-row-cogs.adjustments')).toHaveTextContent('200.00')
  })

  it('renders Total Cost of Sales INCLUDING adjustments', () => {
    renderPage()
    // 63,200.00 — the section's own 63,000.00 total would contradict Gross Profit.
    expect(screen.getByTestId('pl-row-cogs.total')).toHaveTextContent('63,200.00')
    expect(screen.getByTestId('pl-row-cogs.total')).not.toHaveTextContent('63,000.00')
  })

  it('marks zero rows as muted without hiding them', () => {
    renderPage()
    const row = screen.getByTestId('pl-row-otherIncome.total')
    expect(row).toBeInTheDocument()
    // jsdom cannot observe Emotion styles, so assert the data attribute.
    expect(row).toHaveAttribute('data-zero', 'true')
  })

  it('does not mark non-zero rows as muted', () => {
    renderPage()
    expect(screen.getByTestId('pl-row-revenue.total')).toHaveAttribute('data-zero', 'false')
  })

  it('drills through to the General Ledger for the selected year', async () => {
    renderPage()
    await userEvent.click(screen.getByTestId('pl-row-account:sales'))
    expect(mockNavigate).toHaveBeenCalledWith(
      '/accounting/general-ledger?account=sales&period=custom&period_from=2026-01-01&period_to=2026-12-31',
    )
  })

  it('does not expand a postable category', () => {
    renderPage()
    expect(within(screen.getByTestId('pl-row-account:oe')).queryByRole('button')).toBeNull()
  })

  it('expands a structural category over its children', async () => {
    const withStructural = withStructuralFixture
    mockQuery.mockReturnValue({
      data: withStructural, currentData: withStructural,
      isLoading: false, isFetching: false, isError: false,
    })
    renderPage()
    expect(screen.queryByTestId('pl-row-account:phone')).toBeNull()
    await userEvent.click(screen.getByTestId('pl-expand-account:oh'))
    expect(screen.getByTestId('pl-row-account:phone')).toBeInTheDocument()
  })

  it('warns about an assignment anomaly, naming the account', () => {
    const withAnomaly = {
      ...RESPONSE,
      integrity: {
        ...RESPONSE.integrity,
        anomalies: [{ accountId: 'x', code: '1900', name: 'Stray', component: 'ordinary' as const, count: 0 }],
      },
    }
    mockQuery.mockReturnValue({
      data: withAnomaly, currentData: withAnomaly,
      isLoading: false, isFetching: false, isError: false,
    })
    renderPage()
    expect(screen.getByTestId('pl-integrity-warning')).toHaveTextContent('1900')
  })

  it('warns about a structural fault', () => {
    const withFault = {
      ...RESPONSE,
      integrity: {
        ...RESPONSE.integrity,
        structuralFaults: [{
          kind: 'missingConfiguredAccount' as const,
          settingKey: 'salesRevenueAccountId',
          accounts: [],
        }],
      },
    }
    mockQuery.mockReturnValue({
      data: withFault, currentData: withFault,
      isLoading: false, isFetching: false, isError: false,
    })
    renderPage()
    expect(screen.getByTestId('pl-integrity-warning')).toHaveTextContent('salesRevenueAccountId')
  })

  it('shows no warning when integrity is clean', () => {
    renderPage()
    expect(screen.queryByTestId('pl-integrity-warning')).toBeNull()
  })

  it('shows a skeleton while loading, without stale figures', () => {
    mockQuery.mockReturnValue({ data: undefined, currentData: undefined, isLoading: true, isFetching: true, isError: false })
    renderPage()
    expect(screen.getByTestId('pl-loading')).toBeInTheDocument()
    expect(screen.queryByText(/48,800/)).toBeNull()
  })

  it('shows the error message on failure', () => {
    mockQuery.mockReturnValue({ data: undefined, currentData: undefined, isLoading: false, isFetching: false, isError: true })
    renderPage()
    expect(screen.getByText('Unable to load Profit & Loss. Please try again.')).toBeInTheDocument()
  })

  // Finding 1: reading `data` instead of `currentData` renders the PREVIOUS
  // year's figures under the new year's heading while the refetch is in flight.
  it('shows no stale figures while a new year is fetching', () => {
    mockQuery.mockReturnValue({
      data: RESPONSE,          // RTK Query keeps the old year here
      currentData: undefined,  // ...but not here
      isLoading: false, isFetching: true, isError: false,
    })
    renderPage()
    expect(screen.getByTestId('pl-loading')).toBeInTheDocument()
    expect(screen.queryByText(/48,800/)).toBeNull()
    expect(screen.queryByTestId('pl-row-netProfit')).toBeNull()
  })

  // Finding 4: Gross Profit belongs immediately after Cost of Sales, not after
  // every section.
  it('places Gross Profit directly after the Cost of Sales section', () => {
    renderPage()
    const order = Array.from(
      document.querySelectorAll('[data-testid^="pl-row-"], [data-testid^="pl-section-"]'),
    ).map((el) => el.getAttribute('data-testid'))

    const cogsTotal = order.indexOf('pl-row-cogs.total')
    const gross = order.indexOf('pl-row-grossProfit')
    const otherIncome = order.indexOf('pl-section-otherIncome')

    expect(cogsTotal).toBeGreaterThanOrEqual(0)
    expect(gross).toBe(cogsTotal + 1)
    expect(gross).toBeLessThan(otherIncome)
  })

  it('closes with Net Profit after the last section', () => {
    renderPage()
    const order = Array.from(
      document.querySelectorAll('[data-testid^="pl-row-"], [data-testid^="pl-section-"]'),
    ).map((el) => el.getAttribute('data-testid'))
    expect(order.indexOf('pl-row-netProfit')).toBe(order.length - 1)
  })

  // Finding 5: expanded detail and expand controls must not reach the printout.
  it('marks expanded child rows and controls as print-excluded', async () => {
    mockQuery.mockReturnValue({
      data: withStructuralFixture, currentData: withStructuralFixture,
      isLoading: false, isFetching: false, isError: false,
    })
    renderPage()
    await userEvent.click(screen.getByTestId('pl-expand-account:oh'))

    expect(screen.getByTestId('pl-row-account:phone')).toHaveClass('acct-print-detail-row')
    expect(screen.getByTestId('pl-expand-account:oh')).toHaveClass('acct-print-control')
  })

  it('captions the expenses total "Total Expenses", not "Total Operating Expenses"', () => {
    renderPage()
    const row = screen.getByTestId('pl-row-expenses.total')
    expect(row).toHaveTextContent('Total Expenses')
    expect(row).not.toHaveTextContent('Total Operating Expenses')
  })

  it('keeps the app chrome out of the printout', () => {
    renderPage()
    // The screen heading must be print-hidden: the print layout renders its
    // own dedicated header, and both would otherwise appear on paper.
    const heading = screen.getByText('Profit & Loss')
    expect(heading.closest('[data-print-hide="true"]')).not.toBeNull()
  })

  it('offers every available year, newest first', async () => {
    renderPage()
    await userEvent.click(within(screen.getByTestId('pl-year-select')).getByRole('combobox'))
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['2026', '2025'])
  })

  it('shows the year taken from the URL', () => {
    renderPage()
    expect(within(screen.getByTestId('pl-year-select')).getByRole('combobox'))
      .toHaveTextContent('2026')
  })

  it('writes the chosen year to the URL', async () => {
    // MemoryRouter keeps its history in memory and never touches
    // window.location, so the URL is observed through a probe component.
    let search = ''
    const Probe = () => {
      search = useLocation().search
      return null
    }
    render(
      <MemoryRouter initialEntries={['/accounting/profit-and-loss?year=2026']}>
        <ProfitAndLossPage />
        <Probe />
      </MemoryRouter>,
    )
    await userEvent.click(within(screen.getByTestId('pl-year-select')).getByRole('combobox'))
    await userEvent.click(screen.getByRole('option', { name: '2025' }))
    expect(search).toContain('year=2025')
  })

  it('normalizes a malformed year in the URL', async () => {
    let search = ''
    const Probe = () => {
      search = useLocation().search
      return null
    }
    render(
      <MemoryRouter initialEntries={['/accounting/profit-and-loss?year=abc']}>
        <ProfitAndLossPage />
        <Probe />
      </MemoryRouter>,
    )
    await waitFor(() => expect(search).toContain(`year=${new Date().getFullYear()}`))
  })

  it('requests the year from the URL, not the current year', () => {
    renderPage()
    expect(mockQuery).toHaveBeenCalledWith({ year: 2026 })
  })

  it('falls back to the current year when the URL year is malformed', () => {
    render(
      <MemoryRouter initialEntries={['/accounting/profit-and-loss?year=abc']}>
        <ProfitAndLossPage />
      </MemoryRouter>,
    )
    expect(mockQuery).toHaveBeenCalledWith({ year: new Date().getFullYear() })
  })
})
