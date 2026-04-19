import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'

import FundTransfersPage from '../FundTransfersPage'

vi.mock('@/hooks/useNotification', () => ({ useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }) }))
vi.mock('@/hooks/useRedux', () => ({ useAppSelector: () => ({ role: 'admin' }) }))
vi.mock('@/utils/dateRange', () => ({ getPeriodDateRange: () => ({ from: undefined, to: undefined }), getStartOfWeek: () => 0 }))
vi.mock('@/utils/formatters', async () => {
  const actual = await vi.importActual<typeof import('@/utils/formatters')>('@/utils/formatters')
  return { ...actual, formatDate: (value: string) => value, formatCurrency: (value: number) => `$${value}`, getCurrentDate: () => '2026-03-12' }
})

const mockedApi = vi.hoisted(() => ({
  useGetFundTransfersQuery: vi.fn(),
  useGetChartOfAccountsQuery: vi.fn(),
  useCreateFundTransferMutation: vi.fn(),
  useCancelFundTransferMutation: vi.fn(),
  useLazyGetFundTransferQuery: vi.fn(),
}))

vi.mock('@/store/api/accountingApi', () => mockedApi)

describe('FundTransfersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.useGetFundTransfersQuery.mockReturnValue({ data: { data: [{ id: 'trf-1', referenceNumber: 'TRF-26-001', transferDate: '2026-03-12', amount: 1000, description: 'Test transfer', status: 'ACTIVE', fiscalPeriodId: 'fp-1', journalEntryId: 'je-1', sourceAccount: { id: 'acc-1', code: '1001', name: 'Cash on Hand', type: 'ASSET' }, destinationAccount: { id: 'acc-2', code: '1002', name: 'Petty Cash', type: 'ASSET' }, createdAt: '2026-03-12', updatedAt: '2026-03-12' }], meta: { total: 1 } }, isLoading: false, refetch: vi.fn() })
    mockedApi.useGetChartOfAccountsQuery.mockReturnValue({ data: { data: [{ id: 'acc-1', code: '1001', name: 'Cash on Hand', type: 'ASSET', isActive: true, isCashEquivalent: true }, { id: 'acc-2', code: '1002', name: 'Petty Cash', type: 'ASSET', isActive: true, isCashEquivalent: true }] }, isLoading: false })
    mockedApi.useCreateFundTransferMutation.mockReturnValue([vi.fn(), { isLoading: false }])
    mockedApi.useCancelFundTransferMutation.mockReturnValue([vi.fn(), { isLoading: false }])
    mockedApi.useLazyGetFundTransferQuery.mockReturnValue([vi.fn().mockResolvedValue({})])
  })

  it('renders title and transfer row', () => {
    render(<BrowserRouter><FundTransfersPage /></BrowserRouter>)
    expect(screen.getByText('Fund Transfers')).toBeInTheDocument()
    expect(screen.getByText('TRF-26-001')).toBeInTheDocument()
  })

  it('renders New Transfer button', () => {
    render(<BrowserRouter><FundTransfersPage /></BrowserRouter>)
    expect(screen.getByRole('button', { name: /new transfer/i })).toBeInTheDocument()
  })
})
