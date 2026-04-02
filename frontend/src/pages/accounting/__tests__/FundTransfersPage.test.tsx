import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import FundTransfersPage from '../FundTransfersPage'

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}))

vi.mock('@/hooks/useSearchAndFilter', async () => {
  const actual = await vi.importActual('@/hooks/useSearchAndFilter')
  return { ...actual, useKeyboardShortcuts: vi.fn() }
})

const mockedApi = vi.hoisted(() => ({
  useGetFundTransfersQuery: vi.fn(),
  useGetChartOfAccountsQuery: vi.fn(),
  useCreateFundTransferMutation: vi.fn(),
  useCancelFundTransferMutation: vi.fn(),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useGetFundTransfersQuery: mockedApi.useGetFundTransfersQuery,
  useGetChartOfAccountsQuery: mockedApi.useGetChartOfAccountsQuery,
  useCreateFundTransferMutation: mockedApi.useCreateFundTransferMutation,
  useCancelFundTransferMutation: mockedApi.useCancelFundTransferMutation,
}))

const mockTransfer = {
  id: 'trf-1',
  referenceNumber: 'TRF-26-001',
  transferDate: '2026-03-12',
  amount: 1000,
  description: 'Test transfer',
  status: 'ACTIVE',
  sourceAccount: { id: 'acc-1', code: '1001', name: 'Cash on Hand', type: 'ASSET' },
  destinationAccount: { id: 'acc-2', code: '1002', name: 'Petty Cash', type: 'ASSET' },
  createdAt: '2026-03-12',
  updatedAt: '2026-03-12',
}

const mockCashAccount = (id: string, name: string) => ({
  id,
  code: '1001',
  name,
  type: 'ASSET',
  isActive: true,
  isCashEquivalent: true,
  fullCode: '1001',
  isParent: false,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
})

const renderPage = () =>
  render(
    <BrowserRouter>
      <FundTransfersPage />
    </BrowserRouter>,
  )

const mockRuntimeStore = {
  getState: () => ({ auth: { user: { role: 'admin' } } }),
  subscribe: () => () => undefined,
}

describe('FundTransfersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(window as typeof window & { store?: typeof mockRuntimeStore }).store = mockRuntimeStore
    mockedApi.useGetFundTransfersQuery.mockReturnValue({
      data: { data: [mockTransfer], meta: { total: 1 } },
      isLoading: false,
      refetch: vi.fn(),
    })
    mockedApi.useGetChartOfAccountsQuery.mockReturnValue({
      data: {
        data: [
          mockCashAccount('acc-1', 'Cash on Hand'),
          mockCashAccount('acc-2', 'Petty Cash'),
        ],
      },
      isLoading: false,
    })
    mockedApi.useCreateFundTransferMutation.mockReturnValue([vi.fn(), { isLoading: false }])
    mockedApi.useCancelFundTransferMutation.mockReturnValue([vi.fn(), { isLoading: false }])
  })

  it('renders the PageHeader title, subtitle, and refresh action', () => {
    renderPage()

    expect(screen.getByText('Fund Transfers')).toBeInTheDocument()
    expect(
      screen.getByText('Move funds between accounts and review transfer history'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument()
    expect(
      screen.queryByText('Move funds between eligible cash and bank accounts'),
    ).not.toBeInTheDocument()
  })

  it('renders the transfer reference number in the table', () => {
    renderPage()
    expect(screen.getByText('TRF-26-001')).toBeInTheDocument()
  })

  it('renders source account name', () => {
    renderPage()
    expect(screen.getByText(/Cash on Hand/)).toBeInTheDocument()
  })

  it('renders destination account name', () => {
    renderPage()
    expect(screen.getByText(/Petty Cash/)).toBeInTheDocument()
  })

  it('renders ACTIVE status chip', () => {
    renderPage()
    expect(screen.getByText('ACTIVE')).toBeInTheDocument()
  })

  it('shows loading state when data is loading', () => {
    mockedApi.useGetFundTransfersQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      refetch: vi.fn(),
    })
    renderPage()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('renders New Transfer button', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /new transfer/i })).toBeInTheDocument()
  })

  it('renders Cancel button for ACTIVE transfer', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('does not use the legacy Paper filter wrapper', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../FundTransfersPage.tsx'), 'utf8')

    expect(source).not.toContain('<Paper sx={{ p: 2, mb: 2 }}>')
  })
})
