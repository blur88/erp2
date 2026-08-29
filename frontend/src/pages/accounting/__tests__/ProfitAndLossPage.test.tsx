import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
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
    { rowId: 'revenue.section', key: 'revenue', label: 'Revenue', total: '120000.0000', totalRowId: 'revenue.total',
      rows: [{ rowId: 'account:sales', accountId: 'sales', code: '4100', name: 'Sales Revenue', isPostable: true, amount: '120000.0000', children: [] }] },
    { rowId: 'cogs.section', key: 'cogs', label: 'Cost of Sales', total: '63000.0000', totalRowId: 'cogs.total',
      rows: [{ rowId: 'account:cogs', accountId: 'cogs', code: '5100', name: 'Cost of Goods Sold', isPostable: true, amount: '63000.0000', children: [] }] },
    { rowId: 'otherIncome.section', key: 'otherIncome', label: 'Other Income', total: '0.0000', totalRowId: 'otherIncome.total', rows: [] },
    { rowId: 'expenses.section', key: 'expenses', label: 'Operating Expenses', total: '8000.0000', totalRowId: 'expenses.total',
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

const renderPage = () =>
  render(<MemoryRouter initialEntries={['/accounting/profit-and-loss?year=2026']}><ProfitAndLossPage /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  mockQuery.mockReturnValue({ data: RESPONSE, isLoading: false, isError: false })
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
    mockQuery.mockReturnValue({
      data: {
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
      },
      isLoading: false, isError: false,
    })
    renderPage()
    expect(screen.queryByTestId('pl-row-account:phone')).toBeNull()
    await userEvent.click(screen.getByTestId('pl-expand-account:oh'))
    expect(screen.getByTestId('pl-row-account:phone')).toBeInTheDocument()
  })

  it('warns about an assignment anomaly, naming the account', () => {
    mockQuery.mockReturnValue({
      data: { ...RESPONSE, integrity: { ...RESPONSE.integrity,
        anomalies: [{ accountId: 'x', code: '1900', name: 'Stray', component: 'ordinary', count: 0 }] } },
      isLoading: false, isError: false,
    })
    renderPage()
    expect(screen.getByTestId('pl-integrity-warning')).toHaveTextContent('1900')
  })

  it('warns about a structural fault', () => {
    mockQuery.mockReturnValue({
      data: { ...RESPONSE, integrity: { ...RESPONSE.integrity,
        structuralFaults: [{ kind: 'missingConfiguredAccount', settingKey: 'salesRevenueAccountId', accounts: [] }] } },
      isLoading: false, isError: false,
    })
    renderPage()
    expect(screen.getByTestId('pl-integrity-warning')).toHaveTextContent('salesRevenueAccountId')
  })

  it('shows no warning when integrity is clean', () => {
    renderPage()
    expect(screen.queryByTestId('pl-integrity-warning')).toBeNull()
  })

  it('shows a skeleton while loading, without stale figures', () => {
    mockQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    renderPage()
    expect(screen.getByTestId('pl-loading')).toBeInTheDocument()
    expect(screen.queryByText(/48,800/)).toBeNull()
  })

  it('shows the error message on failure', () => {
    mockQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    renderPage()
    expect(screen.getByText('Unable to load Profit & Loss. Please try again.')).toBeInTheDocument()
  })

  it('offers every available year, newest first', () => {
    renderPage()
    expect(screen.getByTestId('pl-year-select')).toBeInTheDocument()
  })
})
