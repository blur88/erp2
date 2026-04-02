import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import OwnerEquityPage from '../OwnerEquityPage'

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}))

vi.mock('@/hooks/useSearchAndFilter', async () => {
  const actual = await vi.importActual('@/hooks/useSearchAndFilter')
  return {
    ...actual,
    useKeyboardShortcuts: vi.fn(),
  }
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

vi.mock('@/store/api/accountingApi', () => ({
  useGetOwnerEquityTransactionsQuery: mockedApi.useGetOwnerEquityTransactionsQuery,
  useGetPaymentMethodsQuery: mockedApi.useGetPaymentMethodsQuery,
  useCreateOwnerEquityTransactionMutation: mockedApi.useCreateOwnerEquityTransactionMutation,
  useUpdateOwnerEquityTransactionMutation: mockedApi.useUpdateOwnerEquityTransactionMutation,
  useDeleteOwnerEquityTransactionMutation: mockedApi.useDeleteOwnerEquityTransactionMutation,
  usePostOwnerEquityTransactionMutation: mockedApi.usePostOwnerEquityTransactionMutation,
  useReverseOwnerEquityTransactionMutation: mockedApi.useReverseOwnerEquityTransactionMutation,
}))

const renderPage = () =>
  render(
    <BrowserRouter>
      <OwnerEquityPage />
    </BrowserRouter>,
  )

describe('OwnerEquityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.useGetOwnerEquityTransactionsQuery.mockReturnValue({
      data: {
        data: [
          {
            id: 'tx-1',
            referenceNumber: 'EQ-001',
            transactionDate: '2026-02-15',
            type: 'capital_injection',
            amount: 500,
            paymentMethodId: 'pm-1',
            paymentMethod: { id: 'pm-1', code: 'CASH', name: 'Cash' },
            description: 'Initial owner capital',
            status: 'draft',
            createdAt: '2026-02-15',
            updatedAt: '2026-02-15',
          },
        ],
      },
      isLoading: false,
      refetch: vi.fn(),
    })
    mockedApi.useGetPaymentMethodsQuery.mockReturnValue({
      data: {
        data: [{ id: 'pm-1', code: 'CASH', name: 'Cash', isActive: true }],
      },
    })
    mockedApi.useCreateOwnerEquityTransactionMutation.mockReturnValue([vi.fn()])
    mockedApi.useUpdateOwnerEquityTransactionMutation.mockReturnValue([vi.fn()])
    mockedApi.useDeleteOwnerEquityTransactionMutation.mockReturnValue([vi.fn()])
    mockedApi.usePostOwnerEquityTransactionMutation.mockReturnValue([vi.fn()])
    mockedApi.useReverseOwnerEquityTransactionMutation.mockReturnValue([vi.fn()])
  })

  it('renders the PageHeader title, subtitle, and refresh action', () => {
    renderPage()

    expect(screen.getByText('Owner Equity')).toBeInTheDocument()
    expect(
      screen.getByText('Track owner contributions and equity transactions'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument()
    expect(screen.queryByText("Owner's Equity Transactions")).not.toBeInTheDocument()
    expect(screen.getByText('EQ-001')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    mockedApi.useGetOwnerEquityTransactionsQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      refetch: vi.fn(),
    })

    renderPage()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('displays transaction data in table', () => {
    renderPage()

    expect(screen.getByText('EQ-001')).toBeInTheDocument()
    expect(screen.getByText('Capital Injection')).toBeInTheDocument()
    expect(screen.getByText('Initial owner capital')).toBeInTheDocument()
    expect(screen.getByText('Cash')).toBeInTheDocument()
  })

  it('shows filter controls', () => {
    renderPage()

    expect(screen.getAllByText('Type').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Status').length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Start Date')).toBeInTheDocument()
    expect(screen.getByLabelText('End Date')).toBeInTheDocument()
  })

  it('does not use the legacy Paper filter wrapper', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../OwnerEquityPage.tsx'), 'utf8')

    expect(source).not.toContain('<Paper sx={{ p: 2, mb: 2 }}>')
  })
})
