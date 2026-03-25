import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import BalanceSheetPage, { getBalanceSheetTone } from '../BalanceSheetPage'

const mockedApi = vi.hoisted(() => ({
  useGetBalanceSheetQuery: vi.fn(),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useGetBalanceSheetQuery: mockedApi.useGetBalanceSheetQuery,
}))

describe('BalanceSheetPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.useGetBalanceSheetQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: undefined,
    })
  })

  it('renders without crashing', () => {
    render(<BalanceSheetPage />)
    expect(screen.getByText('Balance Sheet')).toBeInTheDocument()
  })

  it('displays page subtitle', () => {
    render(<BalanceSheetPage />)
    expect(screen.getByText('View your financial position showing Assets = Liabilities + Equity as of a specific date')).toBeInTheDocument()
  })

  it('has as of date filter', () => {
    render(<BalanceSheetPage />)
    expect(screen.getByLabelText('As Of Date')).toBeInTheDocument()
  })

  it('has include inactive checkbox', () => {
    render(<BalanceSheetPage />)
    expect(screen.getByLabelText('Include Inactive Accounts')).toBeInTheDocument()
  })

  it('has action buttons', () => {
    render(<BalanceSheetPage />)
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
  })

  it('renders generate and export buttons in the report actions area', () => {
    render(<BalanceSheetPage />)
    expect(screen.getByRole('button', { name: /generate report/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /export to excel/i })).toBeInTheDocument()
  })

  it('renders balance sheet data from backend response shape', () => {
    mockedApi.useGetBalanceSheetQuery.mockReturnValue({
      data: {
        assets: {
          current: [{ accountCode: '1100', accountName: 'Cash', balance: 1000 }],
          fixed: [],
          totalCurrent: 1000,
          totalFixed: 0,
          total: 1000,
        },
        liabilities: {
          current: [],
          longTerm: [],
          totalCurrent: 0,
          totalLongTerm: 0,
          total: 0,
        },
        equity: {
          accounts: [{ accountCode: '3100', accountName: 'Capital', balance: 1000 }],
          netIncome: 0,
          total: 1000,
        },
        isBalanced: true,
      },
      isLoading: false,
      error: undefined,
    })

    render(<BalanceSheetPage />)
    expect(screen.getByText('Balance Sheet')).toBeInTheDocument()
  })

  it('uses dark-mode specific tones for report surfaces', () => {
    const tone = getBalanceSheetTone()
    expect(tone.surfaceSoft).toBe('rgba(255, 255, 255, 0.06)')
    expect(tone.surfaceStrong).toBe('rgba(255, 255, 255, 0.1)')
    expect(tone.sectionAccent).toBe('rgba(255, 255, 255, 0.08)')
  })

  it('renders net income in equity section when present', async () => {
    mockedApi.useGetBalanceSheetQuery.mockReturnValue({
      data: {
        assets: { current: [], fixed: [], totalCurrent: 0, totalFixed: 0, total: 5000 },
        liabilities: { current: [], longTerm: [], totalCurrent: 0, totalLongTerm: 0, total: 0 },
        equity: {
          accounts: [{ accountCode: '3000', accountName: "Owner's Equity", balance: 2000 }],
          netIncome: 3000,
          total: 5000,
        },
        isBalanced: true,
      },
      isLoading: false,
      error: undefined,
    })

    render(<BalanceSheetPage />)
    expect(await screen.findByText('Add: Net Income')).toBeInTheDocument()
  })
})
