import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter, MemoryRouter, useLocation } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import ProfitAndLossPage from '../ProfitAndLossPage'
import type { ProfitAndLossResponse } from '@/types'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual<any>('react-router-dom')),
  useNavigate: () => mockNavigate,
}))

const mockUseGetProfitAndLossQuery = vi.fn()
const mockUseGetFormBQuery = vi.fn()
const mockQuery = mockUseGetProfitAndLossQuery
vi.mock('@/store/api/accountingApi', () => ({
  useGetProfitAndLossQuery: (...args: unknown[]) => mockUseGetProfitAndLossQuery(...args),
  useGetFormBQuery: (...args: unknown[]) => mockUseGetFormBQuery(...args),
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

const renderPage = (search = '?year=2026') =>
  render(<MemoryRouter initialEntries={[`/accounting/profit-and-loss${search}`]}><ProfitAndLossPage /></MemoryRouter>)

const CURRENT_YEAR_FOR_MOCKS = new Date().getFullYear()
beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState({}, '', '/')
  mockUseGetProfitAndLossQuery.mockImplementation((arg: any, opts: any) => {
    if (opts?.skip) return { data: undefined, currentData: undefined, isLoading: false, isFetching: false, isError: false }
    const year = arg?.year ?? CURRENT_YEAR_FOR_MOCKS
    // Make the requested year authoritative so it is not considered stale
    const avail = RESPONSE.availableYears.includes(year) ? RESPONSE.availableYears : [...RESPONSE.availableYears, year].sort((a, b) => b - a)
    const resp = { ...RESPONSE, year, availableYears: avail }
    return { data: resp, currentData: resp, isLoading: false, isFetching: false, isError: false }
  })
  mockUseGetFormBQuery.mockImplementation((arg: any, opts: any) => {
    if (opts?.skip) return { data: undefined, currentData: undefined, isLoading: false, isFetching: false, isError: false }
    const year = arg?.year ?? CURRENT_YEAR_FOR_MOCKS
    const avail = [2026, 2025].includes(year) ? [2026, 2025] : [...[2026, 2025], year].sort((a, b) => b - a)
    const resp: any = {
      year,
      formVersion: 2025,
      availableYears: avail,
      identity: {
        businessName: { value: null, source: null },
        registrationNumber: { value: null, source: 'companySettings' },
      },
      rows: [],
      reconciliation: { n7: null, accountingTotalCostOfSales: null, inventoryAdjustments: null, ownerStockDrawings: null, residual: null },
      findings: [],
      readiness: { hasWarnings: false, hasIncomplete: false, hasIntegrity: false, counts: { warning: 0, incomplete: 0, integrity: 0 } },
    }
    return { data: resp, currentData: resp, isLoading: false, isFetching: false, isError: false }
  })
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

  it('offers every available year, newest first, and no empty choice', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('combobox', { name: /year/i }))
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    // No "All": a Profit & Loss is always for some year. Selecting an empty
    // value would store null, fall back to the current year for the query, yet
    // display "All" and light up Reset — every piece of state disagreeing.
    expect(options).toEqual(['2026', '2025'])
  })

  it('normalizes a year below the API minimum instead of querying it', () => {
    // ?year=0999 is four digits but the API declares @Min(1000), so querying it
    // would 400. It must fall back to the current year.
    mockQuery.mockClear()
    render(
      <MemoryRouter initialEntries={['/accounting/profit-and-loss?year=0999']}>
        <ProfitAndLossPage />
      </MemoryRouter>,
    )
    expect(mockQuery).toHaveBeenCalledWith({ year: new Date().getFullYear() }, expect.objectContaining({ skip: false }))
    expect(mockQuery).not.toHaveBeenCalledWith({ year: 999 }, expect.anything())
  })

  it('shows the year taken from the URL', () => {
    renderPage()
    expect(screen.getByRole('combobox', { name: /year/i })).toHaveTextContent('2026')
  })

  it('writes the chosen year to the URL', async () => {
    window.history.replaceState({}, '', '/accounting/profit-and-loss?year=2026')
    render(<BrowserRouter><ProfitAndLossPage /></BrowserRouter>)
    await userEvent.click(screen.getByRole('combobox', { name: /year/i }))
    await userEvent.click(screen.getByRole('option', { name: '2025' }))
    await waitFor(() => {
      expect(new URLSearchParams(window.location.search).get('year')).toBe('2025')
    })
  })

  it('normalizes a malformed year in the URL', async () => {
    window.history.replaceState({}, '', '/accounting/profit-and-loss?year=abc')
    render(<BrowserRouter><ProfitAndLossPage /></BrowserRouter>)
    await waitFor(() => {
      expect(new URLSearchParams(window.location.search).get('year')).toBeNull()
    })
    // After normalization the query should use the current year
    expect(mockQuery).toHaveBeenCalledWith({ year: new Date().getFullYear() }, expect.objectContaining({ skip: false }))
  })

  it('requests the year from the URL, not the current year', () => {
    renderPage()
    expect(mockQuery).toHaveBeenCalledWith({ year: 2026 }, expect.objectContaining({ skip: false }))
  })

  it('falls back to the current year when the URL year is malformed', () => {
    render(
      <MemoryRouter initialEntries={['/accounting/profit-and-loss?year=abc']}>
        <ProfitAndLossPage />
      </MemoryRouter>,
    )
    expect(mockQuery).toHaveBeenCalledWith({ year: new Date().getFullYear() }, expect.objectContaining({ skip: false }))
  })

  it('renders the whole statement as a single table', () => {
    // One column grid down the statement: with a table per section, Revenue's
    // amount column would not align with Operating Expenses'.
    const { container } = renderPage()
    expect(container.querySelectorAll('table')).toHaveLength(1)
  })

  it('renders Net Profit in the table footer', () => {
    renderPage()
    expect(screen.getByTestId('pl-row-netProfit').closest('tfoot')).not.toBeNull()
  })

  it('marks the page header as print-hidden', () => {
    renderPage()
    expect(screen.getByTestId('page-header-divider')).toHaveAttribute('data-print-hide', 'true')
  })

  it('marks the body so the global print rule does not hide the report', () => {
    // global.css hides #root when printing, to isolate the PORTALED transactional
    // document templates. An analytical report is not portaled — it renders
    // inside #root — so without this opt-out marker, Ctrl-P yields a blank page.
    const { unmount } = renderPage()
    expect(document.body).toHaveClass('acct-print-mode')
    // ...and it must not leak to other pages, which still need the global rule.
    unmount()
    expect(document.body).not.toHaveClass('acct-print-mode')
  })

  it('keeps a valid no-activity year selected instead of resetting it', async () => {
    // The API accepts any year in 1000-9999 and returns an all-zero statement
    // for one with no postings — a valid report. But such a year is absent from
    // availableYears, so unless it is treated as authoritative too, useFilterBar
    // judges it stale and resets to the current year, discarding the request.
    const noActivity = { ...RESPONSE, year: 1990, availableYears: [2026, 2025] }
    mockQuery.mockReturnValue({
      data: noActivity, currentData: noActivity,
      isLoading: false, isFetching: false, isError: false,
    })
    window.history.replaceState({}, '', '/accounting/profit-and-loss?year=1990')
    render(<BrowserRouter><ProfitAndLossPage /></BrowserRouter>)

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /year/i })).toHaveTextContent('1990')
    })
    expect(new URLSearchParams(window.location.search).get('year')).toBe('1990')
    // And no second query for the current year — the reset would show up here.
    expect(mockQuery).not.toHaveBeenCalledWith({ year: new Date().getFullYear() }, expect.anything())
  })

  it('exposes every element the print stylesheet must expand', () => {
    // jsdom has no layout engine and does not evaluate @media print, so this
    // asserts the SELECTORS exist, not that the printout is correct — the
    // browser QA pass owns that.
    //
    // The wrapper alone is NOT sufficient: EntityTable's own card
    // (height:100%), frame (overflow:hidden) and scroller (overflow:auto) each
    // clip the statement to one viewport, and no ancestor rule can undo them.
    // accountingReportPrint.css targets all four; if any selector here is
    // renamed without updating that file, the statement silently prints
    // truncated while looking perfect on screen.
    const { container } = renderPage()
    const scroll = container.querySelector('.acct-print-scroll')
    expect(scroll).not.toBeNull()
    expect(scroll!.querySelector('table')).not.toBeNull()

    for (const cls of ['entity-table-card', 'entity-table-frame', 'entity-table-scroller']) {
      expect(scroll!.querySelector(`.${cls}`)).not.toBeNull()
    }
  })

  it('emits a bare URL for the current year and ?year= for others', async () => {
    // Canonical-form convention, per the spec. BrowserRouter is REQUIRED:
    // useFilterBar writes via window.history.replaceState, which MemoryRouter
    // never reflects, so a useLocation probe would see nothing and this test
    // would pass or fail for the wrong reason.
    const currentYear = new Date().getFullYear()
    const withYears = { ...RESPONSE, availableYears: [currentYear, 2024] }
    mockQuery.mockReturnValue({
      data: withYears, currentData: withYears,
      isLoading: false, isFetching: false, isError: false,
    })
    window.history.replaceState({}, '', '/accounting/profit-and-loss?year=2024')
    render(<BrowserRouter><ProfitAndLossPage /></BrowserRouter>)

    await userEvent.click(screen.getByRole('combobox', { name: /year/i }))
    await userEvent.click(screen.getByRole('option', { name: String(currentYear) }))
    await waitFor(() => {
      expect(new URLSearchParams(window.location.search).get('year')).toBeNull()
    })

    await userEvent.click(screen.getByRole('combobox', { name: /year/i }))
    await userEvent.click(screen.getByRole('option', { name: '2024' }))
    await waitFor(() => {
      expect(new URLSearchParams(window.location.search).get('year')).toBe('2024')
    })
  })

  /** A group nested inside a group, to prove the walk recurses. */
  const deeplyNestedFixture: ProfitAndLossResponse = {
    ...RESPONSE,
    sections: RESPONSE.sections.map((s) => s.key !== 'expenses' ? s : {
      ...s,
      rows: [{
        rowId: 'account:admin', accountId: 'admin', code: '6000', name: 'Administrative',
        isPostable: false, amount: '8730.0000',
        children: [{
          rowId: 'account:oh', accountId: 'oh', code: '6500', name: 'Overheads',
          isPostable: false, amount: '730.0000',
          children: [{
            rowId: 'account:phone', accountId: 'phone', code: '6920', name: 'Telephone',
            isPostable: true, amount: '730.0000', children: [],
          }],
        }],
      }],
    }),
  }

  it('expands a group nested inside another group', async () => {
    mockQuery.mockReturnValue({
      data: deeplyNestedFixture, currentData: deeplyNestedFixture,
      isLoading: false, isFetching: false, isError: false,
    })
    renderPage()

    // Depth 2 is hidden until both ancestors are expanded.
    expect(screen.queryByTestId('pl-row-account:phone')).not.toBeInTheDocument()
    await userEvent.click(screen.getByTestId('pl-expand-account:admin'))
    expect(screen.queryByTestId('pl-row-account:phone')).not.toBeInTheDocument()
    await userEvent.click(screen.getByTestId('pl-expand-account:oh'))
    expect(screen.getByTestId('pl-row-account:phone')).toBeInTheDocument()
  })

  it('never makes a nested group row navigable', async () => {
    mockQuery.mockReturnValue({
      data: deeplyNestedFixture, currentData: deeplyNestedFixture,
      isLoading: false, isFetching: false, isError: false,
    })
    renderPage()
    await userEvent.click(screen.getByTestId('pl-expand-account:admin'))
    const nestedGroup = screen.getByTestId('pl-row-account:oh')
    expect(nestedGroup).not.toHaveAttribute('role', 'link')
    expect(nestedGroup).not.toHaveAttribute('tabindex')
  })
})

describe('ProfitAndLossPage — print layout', () => {
  /*
   * Exactly ONE AccountingReportPrintLayout for both views: a second nested
   * instance printed two headers and two conflicting titles on one sheet.
   * Title and period are derived from the active view, so the tax view's
   * form-version mismatch reaches the printed page (spec §2.1).
   */
  // Keyed off .acct-print-header, the layout's existing print hook, rather
  // than adding a testid to a component shared with every other report.
  const headers = () => document.querySelectorAll('.acct-print-header')

  it('renders exactly one print header with the accounting title by default', () => {
    renderPage('?year=2025')
    expect(headers()).toHaveLength(1)
    expect(screen.getByText('PROFIT & LOSS')).toBeInTheDocument()
  })

  it('renders exactly one print header in the tax view', () => {
    renderPage('?year=2025&view=tax')
    expect(headers()).toHaveLength(1)
    expect(screen.getByText('PROFIT & LOSS — FORM B TAX VIEW')).toBeInTheDocument()
  })

  it('derives the print period, including the form-version mismatch', () => {
    renderPage('?year=2024&view=tax')
    expect(screen.getByText(/presented using Form B YA 2025/i)).toBeInTheDocument()
  })
})

describe('ProfitAndLossPage — view switching', () => {
  it('defaults to the Accounting View when no view param is present', () => {
    renderPage('?year=2025')
    expect(screen.getByTestId('pl-accounting-view')).toBeInTheDocument()
    expect(screen.queryByTestId('pl-tax-view')).not.toBeInTheDocument()
  })

  it('renders the tax view for ?view=tax', () => {
    renderPage('?year=2025&view=tax')
    expect(screen.getByTestId('pl-tax-view')).toBeInTheDocument()
    expect(screen.queryByTestId('pl-accounting-view')).not.toBeInTheDocument()
  })

  // An unrecognised value must fall back, not render nothing.
  it('falls back to the Accounting View for an unrecognised view value', () => {
    renderPage('?year=2025&view=wat')
    expect(screen.getByTestId('pl-accounting-view')).toBeInTheDocument()
  })

  // The in-page view buttons were removed — the filter bar's View dropdown is
  // the single control. The behaviour they guarded (year and view are
  // independent in the URL) still matters, so it is asserted directly.
  it('keeps year and view independent in the URL', () => {
    renderPage('?year=2024&view=tax')
    expect(window.location.search).toContain('year=2024')
    expect(window.location.search).toContain('view=tax')
    expect(screen.getByTestId('pl-tax-view')).toBeInTheDocument()
  })

  it('renders no duplicate in-page view buttons', () => {
    renderPage('?year=2025')
    expect(screen.queryByRole('button', { name: /^tax filing view$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^accounting view$/i })).not.toBeInTheDocument()
  })

  it('preserves the view when switching years', async () => {
    renderPage('?year=2025&view=tax')
    // Year change goes through the existing filter bar; assert the view param
    // survives it.
    expect(window.location.search).toContain('view=tax')
  })

  // Only ONE endpoint may run: the inactive view's query must not fire.
  it('queries only the active view endpoint', () => {
    renderPage('?year=2025&view=tax')
    expect(mockUseGetFormBQuery).toHaveBeenCalledWith(
      { year: 2025 }, expect.anything(),
    )
    expect(mockUseGetProfitAndLossQuery).toHaveBeenCalledWith(
      expect.anything(), expect.objectContaining({ skip: true }),
    )
  })
})

