import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'

import ChartOfAccountsPage from '../ChartOfAccountsPage'

const mockedApi = vi.hoisted(() => ({
  useGetChartOfAccountsHierarchyQuery: vi.fn(),
  useGetChartOfAccountsQuery: vi.fn(),
  useDeleteChartOfAccountMutation: vi.fn(),
  useSeedDefaultChartOfAccountsMutation: vi.fn(),
  useCreateChartOfAccountMutation: vi.fn(),
  useUpdateChartOfAccountMutation: vi.fn(),
}))

vi.mock('@/store/api/accountingApi', () => mockedApi)
vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))
vi.mock('@/components/accounting/AccountMappingWarning', () => ({ default: () => null }))
vi.mock('@/components/accounting/DeletedAccountsDialog', () => ({ default: () => null }))

const mockAccount = {
  id: '1',
  code: '1000',
  name: 'Cash',
  type: 'ASSET',
  isActive: true,
  fullCode: '1000',
  isParent: false,
  currentBalance: 0,
  isCashEquivalent: false,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
}

describe('ChartOfAccountsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.useGetChartOfAccountsHierarchyQuery.mockReturnValue({
      data: [mockAccount],
      isLoading: false,
      refetch: vi.fn(),
    })
    mockedApi.useGetChartOfAccountsQuery.mockReturnValue({
      data: { data: [mockAccount] },
      isLoading: false,
      refetch: vi.fn(),
    })
    mockedApi.useDeleteChartOfAccountMutation.mockReturnValue([vi.fn()])
    mockedApi.useSeedDefaultChartOfAccountsMutation.mockReturnValue([vi.fn()])
    mockedApi.useCreateChartOfAccountMutation.mockReturnValue([vi.fn()])
    mockedApi.useUpdateChartOfAccountMutation.mockReturnValue([vi.fn()])
  })

  it('renders page title', () => {
    render(
      <BrowserRouter>
        <ChartOfAccountsPage />
      </BrowserRouter>,
    )

    expect(screen.getByText('Chart of Accounts')).toBeInTheDocument()
  })

  it('renders account code from hierarchy data', () => {
    render(
      <BrowserRouter>
        <ChartOfAccountsPage />
      </BrowserRouter>,
    )

    expect(screen.getByText('1000')).toBeInTheDocument()
  })

  it('flattens nested children into table', () => {
    const parent = {
      ...mockAccount,
      id: '1',
      code: '1000',
      name: 'Cash',
      children: [{ ...mockAccount, id: '2', code: '1010', name: 'CIMB', children: [] }],
    }

    mockedApi.useGetChartOfAccountsHierarchyQuery.mockReturnValue({
      data: [parent],
      isLoading: false,
      refetch: vi.fn(),
    })

    render(
      <BrowserRouter>
        <ChartOfAccountsPage />
      </BrowserRouter>,
    )

    expect(screen.getByText('1000')).toBeInTheDocument()
    expect(screen.getByText('1010')).toBeInTheDocument()
  })
})
