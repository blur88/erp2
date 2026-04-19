import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'

import BankReconciliationsPage from '../BankReconciliationsPage'

vi.mock('@/hooks/useNotification', () => ({ useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }) }))
vi.mock('@/utils/formatters', async () => {
  const actual = await vi.importActual<typeof import('@/utils/formatters')>('@/utils/formatters')
  return { ...actual, formatCurrency: (value: number) => `$${value}`, formatDate: (date: string) => date }
})
vi.mock('@/utils/dateRange', () => ({ getPeriodDateRange: () => ({ from: undefined, to: undefined }), getStartOfWeek: () => 0 }))
vi.mock('@/components/accounting/BankReconciliationFormDialog', () => ({ default: () => null }))

const mockedApi = vi.hoisted(() => ({
  useGetBankReconciliationsQuery: vi.fn(),
  useDeleteBankReconciliationMutation: vi.fn(),
  useCompleteBankReconciliationMutation: vi.fn(),
  useReopenBankReconciliationMutation: vi.fn(),
  useMarkBankReconciliationClearedMutation: vi.fn(),
  useUnmarkBankReconciliationClearedMutation: vi.fn(),
}))

vi.mock('@/store/api/accountingApi', () => mockedApi)

describe('BankReconciliationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.useGetBankReconciliationsQuery.mockReturnValue({ data: { data: [], meta: { total: 0 } }, isLoading: false, refetch: vi.fn() })
    mockedApi.useDeleteBankReconciliationMutation.mockReturnValue([vi.fn()])
    mockedApi.useCompleteBankReconciliationMutation.mockReturnValue([vi.fn()])
    mockedApi.useReopenBankReconciliationMutation.mockReturnValue([vi.fn()])
    mockedApi.useMarkBankReconciliationClearedMutation.mockReturnValue([vi.fn()])
    mockedApi.useUnmarkBankReconciliationClearedMutation.mockReturnValue([vi.fn()])
  })

  it('renders the page title', () => {
    render(<BrowserRouter><BankReconciliationsPage /></BrowserRouter>)
    expect(screen.getByText('Bank Reconciliations')).toBeInTheDocument()
  })

  it('shows empty state', () => {
    render(<BrowserRouter><BankReconciliationsPage /></BrowserRouter>)
    expect(screen.getByText('No reconciliations found')).toBeInTheDocument()
  })
})
