import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'

import OwnerEquityPage from '../OwnerEquityPage'

vi.mock('@/hooks/useNotification', () => ({ useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }) }))
vi.mock('@/utils/dateRange', () => ({ getPeriodDateRange: () => ({ from: undefined, to: undefined }), getStartOfWeek: () => 0 }))
vi.mock('@/utils/formatters', async () => {
  const actual = await vi.importActual<typeof import('@/utils/formatters')>('@/utils/formatters')
  return { ...actual, formatDate: (value: string) => value, formatCurrency: (value: number) => `$${value}` }
})

const mockedApi = vi.hoisted(() => ({
  useGetOwnerEquityTransactionsQuery: vi.fn(),
  useGetPaymentMethodsQuery: vi.fn(),
  useCreateOwnerEquityTransactionMutation: vi.fn(),
  useUpdateOwnerEquityTransactionMutation: vi.fn(),
  useDeleteOwnerEquityTransactionMutation: vi.fn(),
  usePostOwnerEquityTransactionMutation: vi.fn(),
  useReverseOwnerEquityTransactionMutation: vi.fn(),
}))

vi.mock('@/store/api/accountingApi', () => mockedApi)

describe('OwnerEquityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.useGetOwnerEquityTransactionsQuery.mockReturnValue({ data: { data: [{ id: 'tx-1', referenceNumber: 'EQ-001', transactionDate: '2026-02-15', type: 'capital_injection', amount: 500, paymentMethodId: 'pm-1', paymentMethod: { id: 'pm-1', code: 'CASH', name: 'Cash' }, description: 'Initial owner capital', status: 'draft', createdAt: '2026-02-15', updatedAt: '2026-02-15' }] }, isLoading: false, refetch: vi.fn() })
    mockedApi.useGetPaymentMethodsQuery.mockReturnValue({ data: { data: [{ id: 'pm-1', code: 'CASH', name: 'Cash', isActive: true }] } })
    mockedApi.useCreateOwnerEquityTransactionMutation.mockReturnValue([vi.fn()])
    mockedApi.useUpdateOwnerEquityTransactionMutation.mockReturnValue([vi.fn()])
    mockedApi.useDeleteOwnerEquityTransactionMutation.mockReturnValue([vi.fn()])
    mockedApi.usePostOwnerEquityTransactionMutation.mockReturnValue([vi.fn()])
    mockedApi.useReverseOwnerEquityTransactionMutation.mockReturnValue([vi.fn()])
  })

  it('renders title and row', () => {
    render(<BrowserRouter><OwnerEquityPage /></BrowserRouter>)
    expect(screen.getByText('Owner Equity')).toBeInTheDocument()
    expect(screen.getByText('EQ-001')).toBeInTheDocument()
  })

  it('shows detail content after selection', () => {
    render(<BrowserRouter><OwnerEquityPage /></BrowserRouter>)
    fireEvent.click(screen.getByText('EQ-001'))
    expect(screen.getByText('Initial owner capital')).toBeInTheDocument()
  })
})
