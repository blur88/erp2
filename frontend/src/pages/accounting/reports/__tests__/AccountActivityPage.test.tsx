import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { BrowserRouter } from 'react-router-dom'

import AccountActivityPage, {
  getAccountActivityMetricCardSx,
  getAccountActivityToolbarLayout,
} from '../AccountActivityPage'

const mockedApi = vi.hoisted(() => ({
  useGetAccountActivityQuery: vi.fn(),
  useGetChartOfAccountsQuery: vi.fn(),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useGetAccountActivityQuery: mockedApi.useGetAccountActivityQuery,
  useGetChartOfAccountsQuery: mockedApi.useGetChartOfAccountsQuery,
}))

const renderWithProviders = () => {
  const theme = createTheme({ palette: { mode: 'dark' } })
  return render(
    <ThemeProvider theme={theme}>
      <BrowserRouter>
        <AccountActivityPage />
      </BrowserRouter>
    </ThemeProvider>,
  )
}

describe('AccountActivityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.useGetAccountActivityQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: undefined,
    })
    mockedApi.useGetChartOfAccountsQuery.mockReturnValue({
      data: { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } },
    })
  })

  it('renders page correctly', () => {
    const { container } = renderWithProviders()
    expect(container.firstChild).toBeTruthy()
  })

  it('has filter inputs', () => {
    renderWithProviders()
    expect(screen.getByLabelText('Start Date')).toBeInTheDocument()
  })

  it('has start date filter', () => {
    renderWithProviders()
    expect(screen.getByLabelText('Start Date')).toBeInTheDocument()
  })

  it('has end date filter', () => {
    renderWithProviders()
    expect(screen.getByLabelText('End Date')).toBeInTheDocument()
  })

  it('has form filters', () => {
    renderWithProviders()
    expect(screen.getByLabelText('End Date')).toBeInTheDocument()
  })

  it('has action buttons', () => {
    renderWithProviders()
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
  })

  it('renders generate and export buttons in the report actions area', () => {
    renderWithProviders()
    expect(screen.getByRole('button', { name: /generate report/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /export to excel/i })).toBeInTheDocument()
  })

  it('renders safely when account activity response has no entries array', () => {
    mockedApi.useGetAccountActivityQuery.mockReturnValue({
      data: {
        account: { id: 'acc-1', code: '1000', name: 'Cash', type: 'ASSET' },
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        totalEntries: 0,
      },
      isLoading: false,
      error: undefined,
    })

    renderWithProviders()
    expect(screen.getByText('No entries found for the selected period')).toBeInTheDocument()
  })

  it('uses dark-friendly table header colors in dark mode', () => {
    mockedApi.useGetAccountActivityQuery.mockReturnValue({
      data: {
        account: { id: 'acc-1', code: '1000', name: 'Cash', type: 'ASSET' },
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        totalEntries: 1,
        entries: [
          {
            id: 'entry-1',
            entryDate: '2026-01-15',
            entryNumber: 'JE-0001',
            entryType: 'MANUAL',
            status: 'POSTED',
            description: 'Opening balance',
            debitAmount: 1000,
            creditAmount: 0,
          },
        ],
      },
      isLoading: false,
      error: undefined,
    })

    renderWithProviders()
    expect(screen.getByText('Entry Date').closest('th')).not.toHaveStyle({ backgroundColor: 'rgb(238, 238, 238)' })
  })

  it('uses compact shared metric card sizing for consistent box heights', () => {
    const metricCardSx = getAccountActivityMetricCardSx()
    expect(metricCardSx.height).toBe('100%')
    expect(metricCardSx.minHeight).toBe(88)
    expect(metricCardSx.display).toBe('flex')
    expect(metricCardSx['& .MuiCardContent-root']).toEqual(expect.objectContaining({
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      height: '100%',
      padding: 1.5,
    }))
  })

  it('keeps date and status filters together and moves actions to next row on reduced widths', () => {
    const toolbarLayout = getAccountActivityToolbarLayout()
    expect(toolbarLayout.containerDirection).toEqual({ xs: 'column', lg: 'row' })
    expect(toolbarLayout.filtersWrap).toEqual({ xs: 'wrap', md: 'nowrap' })
    expect(toolbarLayout.dateStatusDirection).toEqual({ xs: 'row', sm: 'row' })
    expect(toolbarLayout.dateStatusWrap).toBe('nowrap')
    expect(toolbarLayout.actionsJustify).toEqual({ xs: 'stretch', md: 'flex-end' })
  })
})
