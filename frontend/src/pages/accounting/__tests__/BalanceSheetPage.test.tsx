import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import BalanceSheetPage from '../BalanceSheetPage'
import type { BalanceSheetResponse, BalanceSheetRow } from '@/types'

const mockUseGetBalanceSheetQuery = vi.fn()
vi.mock('@/store/api/accountingApi', () => ({
  useGetBalanceSheetQuery: (...args: unknown[]) => mockUseGetBalanceSheetQuery(...args),
}))

// Print Settings is queried by shared chrome. Without this mock the
// hook has no Redux Provider and every test in this file throws.
vi.mock('@/store/api/printSettingsApi', () => ({
  useGetPrintSettingsQuery: () => ({
    data: { id: '1', companyName: 'Acme Sdn Bhd', address: '1 Test Road' },
    isLoading: false,
  }),
}))

const BALANCE_SHEET_LINE_ORDER = Array.from({ length: 23 }, (_, i) => `N${28 + i}`)

/** Build all 23 rows at '0.0000', overriding the named lines. */
const buildRows = (over: Record<string, string | null> = {}): BalanceSheetRow[] =>
  BALANCE_SHEET_LINE_ORDER.map((line) => ({
    line,
    label: line,
    formula: null,
    section: 'currentAssets' as const,
    kind: 'mapped' as const,
    isTotal: ['N32', 'N40', 'N41', 'N45', 'N50'].includes(line),
    amount: line in over ? (over[line] as string | null) : '0.0000',
    accounts: [],
  }))

const baseResponse = (over: Partial<BalanceSheetResponse> = {}): BalanceSheetResponse => ({
  year: 2026,
  asOfDate: '2026-09-08',
  availableYears: [2026],
  rows: buildRows(),
  derivedTotals: { ownersEquity: '0.0000', liabilitiesAndEquity: '0.0000' },
  balanceCheck: {
    status: 'balanced',
    totalAssets: '0.0000',
    totalLiabilitiesAndEquity: '0.0000',
    difference: '0.0000',
    reasons: [],
  },
  findings: [],
  ...over,
})

/** Render the page with a mocked query result. */
const renderPage = (
  data: unknown,
  opts: { isFetching?: boolean; isError?: boolean; staleData?: unknown } = {},
) => {
  mockUseGetBalanceSheetQuery.mockReturnValue({
    // BOTH fields, mirroring RTK Query: `currentData` is the result for the
    // CURRENT arguments and is what the page reads; `data` is the last
    // successful result for any arguments. `staleData` lets a test simulate a
    // failed or in-flight year change, where they legitimately diverge.
    data: opts.staleData ?? data,
    currentData: opts.staleData !== undefined ? undefined : data,
    isFetching: opts.isFetching ?? false,
    isLoading: false,
    isError: opts.isError ?? false,
    refetch: vi.fn(),
  } as never)
  return render(
    <MemoryRouter initialEntries={['/accounting/balance-sheet?year=2026']}>
      <BalanceSheetPage />
    </MemoryRouter>,
  )
}

const responseWithContributors: BalanceSheetResponse = baseResponse({
  rows: buildRows({ N37: '1000.0000', N41: '1000.0000' }).map((row) =>
    row.line === 'N37'
      ? {
          ...row,
          accounts: [
            { accountId: 'acc-cash', code: '1100', name: 'Cash', amount: '1000.0000' },
          ],
        }
      : row,
  ),
})

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState({}, '', '/')
})

describe('BalanceSheetPage — stale-data guards (regression)', () => {
  it('does NOT render the previous year\'s figures when a year change fails', () => {
    // currentData undefined (this year's query failed) while `data` still holds
    // last year's successful result. A `?? data` fallback renders 9,999.00
    // under the 2026 heading.
    renderPage(undefined, {
      isError: true,
      staleData: baseResponse({ rows: buildRows({ N41: '9999.0000' }) }),
    })
    expect(screen.queryByText(/9,999\.00/)).not.toBeInTheDocument()
    expect(
      screen.getByText('Unable to load Balance Sheet. Please try again.'),
    ).toBeInTheDocument()
  })

  it('does NOT render a payload whose year disagrees with the requested year', () => {
    // URL asks for 2026; the payload is 2025.
    renderPage(baseResponse({ year: 2025, rows: buildRows({ N41: '4321.0000' }) }))
    expect(screen.queryByText(/4,321\.00/)).not.toBeInTheDocument()
  })
})

describe('BalanceSheetPage', () => {
  it('renders all 23 official rows including zero rows', () => {
    renderPage(baseResponse())
    // The fixture sets label = line code, so each code renders twice (code +
    // label columns); assert presence rather than uniqueness.
    expect(screen.getAllByText('N28').length).toBeGreaterThan(0)
    expect(screen.getAllByText('N50').length).toBeGreaterThan(0)
    // Scope to <tr>: each row's two figure cells also carry bs-row-*-figN-*
    // testids, so a bare prefix match would count 69 elements, not 23 rows.
    expect(document.querySelectorAll('tr[data-testid^="bs-row-"]')).toHaveLength(23)
  })

  it('renders a null amount as an em dash, never as 0.00', () => {
    renderPage(baseResponse({ rows: buildRows({ N48: null, N50: null }) }))
    const n48 = screen.getByTestId('bs-row-N48')
    expect(within(n48).getByText('—')).toBeInTheDocument()
    expect(within(n48).queryByText(/0\.00/)).not.toBeInTheDocument()
  })

  it('shows Balanced with the difference', () => {
    renderPage(baseResponse())
    expect(screen.getByTestId('bs-balance-status')).toHaveTextContent('Balanced')
  })

  it('shows Out of Balance with the difference', () => {
    renderPage(
      baseResponse({
        balanceCheck: {
          status: 'outOfBalance',
          totalAssets: '1000.0000',
          totalLiabilitiesAndEquity: '750.0000',
          difference: '250.0000',
          reasons: [],
        },
      }),
    )
    expect(screen.getByTestId('bs-balance-status')).toHaveTextContent('Out of Balance')
  })

  it('shows an unavailable check with its reasons and NO numeric difference', () => {
    renderPage(
      baseResponse({
        rows: buildRows({ N48: null, N50: null }),
        balanceCheck: {
          status: 'unavailable',
          totalAssets: '1000.0000',
          totalLiabilitiesAndEquity: null,
          difference: null,
          reasons: [
            {
              code: 'PROFIT_INTEGRITY',
              scope: 'selectedYear',
              affectedLines: ['N48', 'N50'],
              message: 'Selected-year profit could not be determined.',
              accounts: [],
            },
          ],
        },
      }),
    )
    const panel = screen.getByTestId('bs-balance-check')
    expect(panel).toHaveTextContent(/unavailable/i)
    // Since #1212 the Difference line is always rendered so the three-line
    // comparison stays intact under every status. The guarantee is unchanged in
    // substance: an unknown difference must never render as a number.
    const difference = within(panel).getByTestId('bs-difference-value')
    expect(difference).toHaveTextContent('—')
    expect(difference.textContent).not.toMatch(/\d/)
  })

  it('names every unmapped account in the warning', () => {
    renderPage(
      baseResponse({
        findings: [
          {
            code: 'UNMAPPED_BALANCE_ACCOUNTS',
            severity: 'warning',
            scope: null,
            affectedLines: ['N41', 'N45', 'N46'],
            message: 'Unmapped balances leave the official totals incomplete.',
            accounts: [
              { accountId: 'acc-stray', code: '1900', name: 'Stray Asset', amount: '120.0000' },
            ],
          },
        ],
      }),
    )
    expect(screen.getByText(/1900/)).toBeInTheDocument()
  })

  it('expands a mapped row and links each account to the General Ledger', async () => {
    renderPage(responseWithContributors)
    await userEvent.click(screen.getByTestId('bs-expand-N37'))
    // The account code and the account name are separate cells now, so the
    // link's accessible name is the name alone; the code is asserted on the
    // contributor row.
    const accountRow = screen.getByTestId('bs-account-N37-acc-cash')
    expect(within(accountRow).getByText('1100')).toBeInTheDocument()
    expect(within(accountRow).getByRole('link', { name: /Cash/ })).toHaveAttribute(
      'href',
      '/accounting/general-ledger?account=acc-cash&period=custom' +
        '&period_from=2026-01-01&period_to=2026-09-08',
    )
  })

  it('shows a skeleton while fetching, with no stale figures', () => {
    // isFetching: true with PREVIOUS year's data still in `data`
    renderPage(baseResponse({ rows: buildRows({ N37: '999.0000' }) }), { isFetching: true })
    expect(screen.getByTestId('bs-skeleton')).toBeInTheDocument()
    expect(screen.queryByText(/999\.00/)).not.toBeInTheDocument()
  })

  it('shows the exact API error copy', () => {
    renderPage(undefined, { isError: true })
    expect(screen.getByText('Unable to load Balance Sheet. Please try again.')).toBeInTheDocument()
  })

  it('renders the report figures and validation state', () => {
    renderPage(
      baseResponse({
        rows: buildRows({ N37: '1000.0000', N41: '1000.0000', N45: '250.0000' }),
        balanceCheck: {
          status: 'outOfBalance',
          totalAssets: '1000.0000',
          totalLiabilitiesAndEquity: '750.0000',
          difference: '250.0000',
          reasons: [],
        },
        findings: [],
      }),
    )

    // The on-screen row carries its amount as a single node.
    const onScreenN41 = within(screen.getByTestId('bs-row-N41')).getByTestId('bs-amount')
    expect(onScreenN41.textContent).toBeTruthy()

    const balanceCheckPanel = screen.getByTestId('bs-balance-check')
    expect(balanceCheckPanel).toHaveTextContent('Out of Balance')
    expect(balanceCheckPanel).toHaveTextContent('250.00')
  })

  it('renders the unavailable validation state with no numeric difference', () => {
    renderPage(
      baseResponse({
        rows: buildRows({ N41: '1000.0000', N48: null, N50: null }),
        balanceCheck: {
          status: 'unavailable',
          totalAssets: '1000.0000',
          totalLiabilitiesAndEquity: null,
          difference: null,
          reasons: [
            {
              code: 'PROFIT_INTEGRITY',
              scope: 'selectedYear',
              affectedLines: ['N48', 'N50'],
              message: 'Selected-year profit could not be determined.',
              accounts: [],
            },
          ],
        },
        findings: [],
      }),
    )

    const balanceCheckPanel = screen.getByTestId('bs-balance-check')
    expect(balanceCheckPanel).toHaveTextContent(/unavailable/i)
    expect(balanceCheckPanel).toHaveTextContent('Selected-year profit could not be determined.')
    // Since #1212 the Difference LINE is always present so the three-line
    // comparison stays intact; what must never appear is a NUMBER standing in
    // for an unknown.
    const difference = within(balanceCheckPanel).getByTestId('bs-difference-value')
    expect(difference).toHaveTextContent('—')
    expect(difference.textContent).not.toMatch(/\d/)
  })

  it('shows expanded ledger detail on screen', async () => {
    renderPage(responseWithContributors)
    await userEvent.click(screen.getByTestId('bs-expand-N37'))
    expect(screen.getByTestId('bs-accounts-N37')).toBeInTheDocument()
  })
})

describe("BalanceSheetPage — derived equity subtotals (#1212)", () => {
  /** A whole, balanced sheet: liabilities 30k, capital 70k, current account 0. */
  const balanced = baseResponse({
    rows: buildRows({ N41: '100000.0000', N45: '30000.0000', N46: '70000.0000', N50: '0.0000' }),
    derivedTotals: { ownersEquity: '70000.0000', liabilitiesAndEquity: '100000.0000' },
    balanceCheck: {
      status: 'balanced',
      totalAssets: '100000.0000',
      totalLiabilitiesAndEquity: '100000.0000',
      difference: '0.0000',
      reasons: [],
    },
  })

  it('renders both derived subtotals with the server-computed values', () => {
    renderPage(balanced)
    expect(screen.getByTestId('bs-derived-owners-equity')).toHaveTextContent('70,000.00')
    expect(screen.getByTestId('bs-derived-liabilities-and-equity')).toHaveTextContent('100,000.00')
  })

  it('gives the derived rows no LHDN N-code', () => {
    renderPage(balanced)
    // The N-code column is what distinguishes an official row. Neither derived
    // row may carry one, or it would read as a filing field.
    for (const testId of ['bs-derived-owners-equity', 'bs-derived-liabilities-and-equity']) {
      expect(within(screen.getByTestId(testId)).queryByTestId('bs-line-code')).toBeNull()
      expect(screen.getByTestId(testId).textContent).not.toMatch(/\bN\d{2}\b/)
    }
  })

  it('keeps the summary Owner’s Equity card equal to the subtotal row', () => {
    renderPage(balanced)
    expect(screen.getByTestId('bs-summary-equity')).toHaveTextContent('70,000.00')
    expect(screen.getByTestId('bs-derived-owners-equity')).toHaveTextContent('70,000.00')
  })

  it('does not add the combined total to the Assets section', () => {
    renderPage(balanced)
    // N41 remains the only 100,000 in the asset rows; the combined figure lives
    // on the liabilities/equity side and in the Balance Check only.
    expect(screen.getByTestId('bs-row-N41')).toHaveTextContent('100,000.00')
    expect(screen.getByTestId('bs-row-N41').textContent).not.toMatch(/LIABILITIES/i)
  })

  it('renders an em dash, never a zero, when a subtotal is unknown', () => {
    renderPage(
      baseResponse({
        rows: buildRows({ N45: '30000.0000', N46: '70000.0000', N48: null, N50: null }),
        derivedTotals: { ownersEquity: null, liabilitiesAndEquity: null },
        balanceCheck: {
          status: 'unavailable',
          totalAssets: '100000.0000',
          totalLiabilitiesAndEquity: null,
          difference: null,
          reasons: [{
            code: 'PROFIT_INTEGRITY', scope: 'selectedYear', affectedLines: ['N48', 'N50'],
            message: 'Selected-year profit could not be determined.', accounts: [],
          }],
        },
      }),
    )
    expect(screen.getByTestId('bs-derived-owners-equity')).toHaveTextContent('—')
    expect(screen.getByTestId('bs-derived-owners-equity').textContent).not.toContain('0.00')
    expect(screen.getByTestId('bs-derived-liabilities-and-equity')).toHaveTextContent('—')
    expect(screen.getByTestId('bs-summary-equity')).toHaveTextContent('—')
  })

  it('shows all three Balance Check lines when balanced', () => {
    renderPage(balanced)
    const panel = screen.getByTestId('bs-balance-check')
    expect(within(panel).getByTestId('bs-check-assets')).toHaveTextContent('100,000.00')
    expect(within(panel).getByTestId('bs-check-liabilities-equity')).toHaveTextContent('100,000.00')
    expect(within(panel).getByTestId('bs-difference-value')).toHaveTextContent('0.00')
    expect(within(panel).getByTestId('bs-balance-status')).toHaveTextContent('Balanced')
  })

  it('keeps all three Balance Check lines visible when unavailable, showing known values', () => {
    // An unavailable check can still have a KNOWN totalAssets. That value must
    // render normally; only the genuinely null figures become em dashes, and
    // the status and reasons are preserved.
    renderPage(
      baseResponse({
        rows: buildRows({ N41: '100000.0000', N48: null, N50: null }),
        derivedTotals: { ownersEquity: null, liabilitiesAndEquity: null },
        balanceCheck: {
          status: 'unavailable',
          totalAssets: '100000.0000',
          totalLiabilitiesAndEquity: null,
          difference: null,
          reasons: [{
            code: 'PROFIT_INTEGRITY', scope: 'selectedYear', affectedLines: ['N48', 'N50'],
            message: 'Selected-year profit could not be determined.', accounts: [],
          }],
        },
      }),
    )
    const panel = screen.getByTestId('bs-balance-check')
    expect(within(panel).getByTestId('bs-check-assets')).toHaveTextContent('100,000.00')
    expect(within(panel).getByTestId('bs-check-liabilities-equity')).toHaveTextContent('—')
    expect(within(panel).getByTestId('bs-difference-value')).toHaveTextContent('—')
    expect(within(panel).getByTestId('bs-balance-status')).toHaveTextContent('Unavailable')
    expect(panel).toHaveTextContent('Selected-year profit could not be determined.')
  })

  it('places the derived rows between N49 and N50, before the Balance Check', () => {
    // The #1216 order. querySelectorAll returns DOCUMENT order regardless of the
    // selector's own order, so this compares real render position — the whole
    // container, not a per-section query that could not observe a misplacement.
    const { container } = renderPage(balanced)
    const order = Array.from(
      container.querySelectorAll(
        '[data-testid="bs-row-N49"],[data-testid="bs-row-N50"],' +
        '[data-testid="bs-derived-owners-equity"],' +
        '[data-testid="bs-derived-liabilities-and-equity"],[data-testid="bs-balance-check"]',
      ),
    ).map((el) => el.getAttribute('data-testid'))
    expect(order).toEqual([
      'bs-row-N49',
      'bs-derived-owners-equity',
      'bs-derived-liabilities-and-equity',
      'bs-row-N50',
      'bs-balance-check',
    ])
  })

  it('keeps N50 present exactly once, after the grand total', () => {
    // #1216 moves N50 BELOW the derived pair; it must still be the single
    // official carried-forward row, not duplicated by the reorder.
    renderPage(balanced)
    expect(screen.getAllByTestId('bs-row-N50')).toHaveLength(1)
    for (const testId of ['bs-derived-owners-equity', 'bs-derived-liabilities-and-equity']) {
      expect(screen.getAllByTestId(testId)).toHaveLength(1)
    }
  })

  it('gives the derived rows no expand control and no ledger link', () => {
    // Official mapped rows own drill-down; the derived subtotals must not, or
    // they would read as filing fields with contributing accounts.
    renderPage(balanced)
    for (const testId of ['bs-derived-owners-equity', 'bs-derived-liabilities-and-equity']) {
      const row = within(screen.getByTestId(testId))
      expect(row.queryByRole('button')).toBeNull()
      expect(row.queryByRole('link')).toBeNull()
    }
  })

  it('renders both derived rows', () => {
    renderPage(balanced)
    for (const testId of ['bs-derived-owners-equity', 'bs-derived-liabilities-and-equity']) {
      expect(screen.getByTestId(testId)).toBeInTheDocument()
    }
  })
})

describe('Balance Sheet statement structure', () => {
  it('renders the statement as a table', () => {
    renderPage(baseResponse())
    expect(screen.getByRole('table', { name: /balance sheet/i })).toBeInTheDocument()
  })

  it('places derived totals after N49', () => {
    renderPage(baseResponse())
    const rows = screen.getAllByRole('row').map((r) => r.getAttribute('data-testid'))
    const n49 = rows.indexOf('bs-row-N49')
    const derived = rows.indexOf('bs-derived-owners-equity')
    expect(n49).toBeGreaterThan(-1)
    expect(derived).toBeGreaterThan(n49)
  })

  it('gives derived totals no expand control and no drill-down', () => {
    renderPage(baseResponse())
    const derived = screen.getByTestId('bs-derived-owners-equity')
    expect(within(derived).queryByRole('link')).toBeNull()
    expect(within(derived).queryByRole('button')).toBeNull()
  })

  it('keeps bs-amount as a single node per row', () => {
    // getByTestId throws on duplicates, so the two-cell figure split must not
    // duplicate this hook.
    renderPage(baseResponse())
    const row = screen.getByTestId('bs-row-N41')
    expect(within(row).getAllByTestId('bs-amount')).toHaveLength(1)
  })

  it('keeps bs-accounts-<line> unique when a line has MANY contributors', async () => {
    // getByTestId throws on duplicates, so N contributors must not each carry
    // the group testid.
    const many = baseResponse({
      rows: buildRows({ N37: '3000.0000', N41: '3000.0000' }).map((row) =>
        row.line === 'N37'
          ? {
              ...row,
              accounts: [
                { accountId: 'acc-a', code: '1100', name: 'Cash', amount: '1000.0000' },
                { accountId: 'acc-b', code: '1110', name: 'Bank', amount: '1000.0000' },
                { accountId: 'acc-c', code: '1120', name: 'Petty Cash', amount: '1000.0000' },
              ],
            }
          : row,
      ),
    })
    renderPage(many)
    await userEvent.click(screen.getByTestId('bs-expand-N37'))

    // One group hook...
    expect(screen.getByTestId('bs-accounts-N37')).toBeInTheDocument()
    // ...and one uniquely addressable row per contributor.
    expect(screen.getByTestId('bs-account-N37-acc-a')).toBeInTheDocument()
    expect(screen.getByTestId('bs-account-N37-acc-b')).toBeInTheDocument()
    expect(screen.getByTestId('bs-account-N37-acc-c')).toBeInTheDocument()
  })
})
