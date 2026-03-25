import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider, createTheme } from '@mui/material/styles'

import TrialBalancePage from '../TrialBalancePage'

const mockedApi = vi.hoisted(() => ({
  useGetTrialBalanceQuery: vi.fn(),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useGetTrialBalanceQuery: mockedApi.useGetTrialBalanceQuery,
}))

describe('TrialBalancePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.useGetTrialBalanceQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: undefined,
    })
  })

  it('renders without crashing', () => {
    render(<TrialBalancePage />)
    expect(screen.getByText('Trial Balance')).toBeInTheDocument()
  })

  it('displays page subtitle', () => {
    render(<TrialBalancePage />)
    expect(screen.getByText('View account balances and verify debits equal credits as of a specific date')).toBeInTheDocument()
  })

  it('has as of date filter', () => {
    render(<TrialBalancePage />)
    expect(screen.getByLabelText('As Of Date')).toBeInTheDocument()
  })

  it('has include inactive checkbox', () => {
    render(<TrialBalancePage />)
    expect(screen.getByLabelText('Include Inactive Accounts')).toBeInTheDocument()
  })

  it('has action buttons', () => {
    render(<TrialBalancePage />)
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
  })

  it('renders generate and export buttons in the report actions area', () => {
    render(<TrialBalancePage />)
    expect(screen.getByRole('button', { name: /generate report/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /export to excel/i })).toBeInTheDocument()
  })

  it('uses a dark-mode-friendly background color for totals row', async () => {
    const darkTheme = createTheme({ palette: { mode: 'dark' } })
    mockedApi.useGetTrialBalanceQuery.mockReturnValue({
      data: {
        accounts: [{ accountCode: '1000', accountName: 'Cash', accountType: 'Asset', debit: 100, credit: 0 }],
        totalDebit: 100,
        totalCredit: 100,
        isBalanced: true,
      },
      isLoading: false,
      error: undefined,
    })

    render(
      <ThemeProvider theme={darkTheme}>
        <TrialBalancePage />
      </ThemeProvider>,
    )

    expect(await screen.findByText('Total')).toBeInTheDocument()
    expect(screen.getByText('Total').closest('tr')).toHaveStyle({ backgroundColor: darkTheme.palette.action.hover })
  })
})
