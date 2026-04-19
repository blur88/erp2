import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'

import SettlementsPage from '../SettlementsPage'

const mocked = vi.hoisted(() => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  useGetSettlementsQuery: vi.fn(),
  useGetPendingSettlementSummaryQuery: vi.fn(),
  useCreateSettlementMutation: vi.fn(),
  useCancelSettlementMutation: vi.fn(),
}))

vi.mock('@/hooks/useNotification', () => ({ useNotification: () => ({ showSuccess: mocked.showSuccess, showError: mocked.showError }) }))
vi.mock('@/utils/dateRange', () => ({ getPeriodDateRange: () => ({ from: undefined, to: undefined }), getStartOfWeek: () => 0 }))
vi.mock('@/utils/formatters', async () => {
  const actual = await vi.importActual<typeof import('@/utils/formatters')>('@/utils/formatters')
  return { ...actual, formatCurrency: (value: number) => `$${value}`, formatDate: (value: string) => value }
})
vi.mock('@/store/api/accountingApi', () => mocked)
vi.mock('@/components/accounting/CreateSettlementDialog', () => ({ default: () => null }))

describe('SettlementsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.useGetSettlementsQuery.mockReturnValue({ data: { data: [{ id: 's-1', settlementNumber: 'SET-001', paymentMethod: { name: 'Cash' }, settlementDate: '2026-02-26', totalAmount: 120, paymentCount: 1, reference: 'ref', status: 'completed' }] }, isLoading: false, refetch: vi.fn() })
    mocked.useGetPendingSettlementSummaryQuery.mockReturnValue({})
    mocked.useCreateSettlementMutation.mockReturnValue([vi.fn()])
    mocked.useCancelSettlementMutation.mockReturnValue([vi.fn()])
  })

  it('renders title and settlement row', () => {
    render(<BrowserRouter><SettlementsPage /></BrowserRouter>)
    expect(screen.getByText('Settlements')).toBeInTheDocument()
    expect(screen.getByText('SET-001')).toBeInTheDocument()
  })

  it('renders create action', () => {
    render(<BrowserRouter><SettlementsPage /></BrowserRouter>)
    expect(screen.getByRole('button', { name: 'Create Settlement' })).toBeInTheDocument()
  })
})
