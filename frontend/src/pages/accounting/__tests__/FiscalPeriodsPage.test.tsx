import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'

import FiscalPeriodsPage from '../FiscalPeriodsPage'
import { FiscalPeriodStatus } from '@/types'

const mockedApi = vi.hoisted(() => ({
  useGetFiscalPeriodsQuery: vi.fn(),
  useDeleteFiscalPeriodMutation: vi.fn(),
  useCloseFiscalPeriodMutation: vi.fn(),
  useReopenFiscalPeriodMutation: vi.fn(),
  useGenerateFiscalPeriodsMutation: vi.fn(),
  useCreateFiscalPeriodMutation: vi.fn(),
  useUpdateFiscalPeriodMutation: vi.fn(),
}))

vi.mock('@/store/api/accountingApi', () => mockedApi)
vi.mock('@/hooks/useNotification', () => ({ useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }) }))
vi.mock('@/components/accounting/AccountMappingWarning', () => ({ default: () => null }))
vi.mock('@/utils/formatters', async () => await vi.importActual('@/utils/formatters'))

describe('FiscalPeriodsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.useGetFiscalPeriodsQuery.mockReturnValue({ data: { data: [{ id: '1', code: '2026-01', name: 'January 2026', startDate: '2026-01-01T00:00:00Z', endDate: '2026-01-31T00:00:00Z', status: FiscalPeriodStatus.OPEN, isOpen: true, isClosed: false, durationDays: 31, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }] }, isLoading: false, refetch: vi.fn() })
    mockedApi.useDeleteFiscalPeriodMutation.mockReturnValue([vi.fn()])
    mockedApi.useCloseFiscalPeriodMutation.mockReturnValue([vi.fn()])
    mockedApi.useReopenFiscalPeriodMutation.mockReturnValue([vi.fn()])
    mockedApi.useGenerateFiscalPeriodsMutation.mockReturnValue([vi.fn()])
    mockedApi.useCreateFiscalPeriodMutation.mockReturnValue([vi.fn()])
    mockedApi.useUpdateFiscalPeriodMutation.mockReturnValue([vi.fn()])
  })

  it('renders header and row', () => {
    render(<BrowserRouter><FiscalPeriodsPage /></BrowserRouter>)
    expect(screen.getByText('Fiscal Periods')).toBeInTheDocument()
    expect(screen.getByText('2026-01')).toBeInTheDocument()
  })
})
