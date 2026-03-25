import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'

import { darkTheme } from '@/styles/theme'
import ProfitAndLossPage, { ProfitAndLossSection } from '../ProfitAndLossPage'

const mockedApi = vi.hoisted(() => ({
  useGetProfitAndLossQuery: vi.fn(),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useGetProfitAndLossQuery: mockedApi.useGetProfitAndLossQuery,
}))

describe('ProfitAndLossPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.useGetProfitAndLossQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: undefined,
    })
  })

  it('renders without crashing', () => {
    render(<ProfitAndLossPage />)
    expect(screen.getByText('Profit & Loss Statement')).toBeInTheDocument()
  })

  it('displays page subtitle', () => {
    render(<ProfitAndLossPage />)
    expect(screen.getByText('View your Income Statement showing Revenue - COGS - Expenses = Net Income for a period')).toBeInTheDocument()
  })

  it('has start date filter', () => {
    render(<ProfitAndLossPage />)
    expect(screen.getByLabelText('Start Date')).toBeInTheDocument()
  })

  it('has end date filter', () => {
    render(<ProfitAndLossPage />)
    expect(screen.getByLabelText('End Date')).toBeInTheDocument()
  })

  it('has include inactive checkbox', () => {
    render(<ProfitAndLossPage />)
    expect(screen.getByLabelText('Include Inactive Accounts')).toBeInTheDocument()
  })

  it('has action buttons', () => {
    render(<ProfitAndLossPage />)
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
  })

  it('renders generate and export buttons in the report actions area', () => {
    render(<ProfitAndLossPage />)
    expect(screen.getByRole('button', { name: /generate report/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /export to excel/i })).toBeInTheDocument()
  })

  it('uses dark-mode contrast text for colored section headers', () => {
    render(
      <ThemeProvider theme={darkTheme}>
        <ProfitAndLossSection
          title="REVENUE"
          accounts={[{ id: '1', code: '4000', name: 'Sales Revenue', amount: 1000 }]}
          subtotal={1000}
          color="primary"
        />
      </ThemeProvider>,
    )

    expect(screen.getByText('REVENUE')).toHaveStyle({ color: '#000' })
  })

  it('avoids light grey subtotal rows in dark mode', () => {
    render(
      <ThemeProvider theme={darkTheme}>
        <ProfitAndLossSection
          title="REVENUE"
          accounts={[{ id: '1', code: '4000', name: 'Sales Revenue', amount: 1000 }]}
          subtotal={1000}
          color="primary"
        />
      </ThemeProvider>,
    )

    expect(screen.getByText('Total REVENUE').closest('tr')).not.toHaveStyle({ backgroundColor: 'rgb(245, 245, 245)' })
  })
})
