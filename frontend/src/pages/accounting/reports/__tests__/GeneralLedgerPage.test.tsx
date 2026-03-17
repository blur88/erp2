import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import GeneralLedgerPage, { getGeneralLedgerTone, getLedgerMetricCardSx } from '../GeneralLedgerPage'

const mockedApi = vi.hoisted(() => ({
  useGetGeneralLedgerQuery: vi.fn(),
  useGetChartOfAccountsQuery: vi.fn(),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useGetGeneralLedgerQuery: mockedApi.useGetGeneralLedgerQuery,
  useGetChartOfAccountsQuery: mockedApi.useGetChartOfAccountsQuery,
}))

describe('GeneralLedgerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.useGetGeneralLedgerQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: undefined,
    })
    mockedApi.useGetChartOfAccountsQuery.mockReturnValue({
      data: { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } },
    })
  })

  it('renders without crashing', () => {
    render(<GeneralLedgerPage />)
    expect(screen.getByText('General Ledger')).toBeInTheDocument()
  })

  it('displays page subtitle', () => {
    render(<GeneralLedgerPage />)
    expect(screen.getByText('View all transactions for a specific account with running balance')).toBeInTheDocument()
  })

  it('has filter inputs', () => {
    render(<GeneralLedgerPage />)
    expect(screen.getByLabelText('Start Date')).toBeInTheDocument()
  })

  it('has start date filter', () => {
    render(<GeneralLedgerPage />)
    expect(screen.getByLabelText('Start Date')).toBeInTheDocument()
  })

  it('has end date filter', () => {
    render(<GeneralLedgerPage />)
    expect(screen.getByLabelText('End Date')).toBeInTheDocument()
  })

  it('has action buttons', () => {
    render(<GeneralLedgerPage />)
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
  })

  it('renders generate and export buttons in the report actions area', () => {
    render(<GeneralLedgerPage />)
    expect(screen.getByTestId('general-ledger-actions')).toContainElement(screen.getByRole('button', { name: /generate report/i }))
    expect(screen.getByTestId('general-ledger-actions')).toContainElement(screen.getByRole('button', { name: /export to excel/i }))
  })

  it('uses dark-mode specific tones for report surfaces', () => {
    const tone = getGeneralLedgerTone()
    expect(tone.surfaceSoft).toBe('rgba(255, 255, 255, 0.06)')
    expect(tone.surfaceStrong).toBe('rgba(255, 255, 255, 0.1)')
    expect(tone.tableHeader).toBe('rgba(255, 255, 255, 0.08)')
  })

  it('uses a shared metric card layout so all summary boxes have consistent height', () => {
    const metricCardSx = getLedgerMetricCardSx()
    expect(metricCardSx.height).toBe('100%')
    expect(metricCardSx.minHeight).toBe(88)
    expect(metricCardSx.display).toBe('flex')
    expect(metricCardSx['& .MuiCardContent-root']).toEqual(expect.objectContaining({
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      height: '100%',
    }))
  })
})
