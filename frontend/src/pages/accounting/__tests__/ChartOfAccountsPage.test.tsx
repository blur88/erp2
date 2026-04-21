import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'

import ChartOfAccountsPage from '../ChartOfAccountsPage'

const mockedApi = vi.hoisted(() => ({
  useGetChartOfAccountsHierarchyQuery: vi.fn(),
  useGetChartOfAccountsQuery: vi.fn(),
  useDeleteChartOfAccountMutation: vi.fn(),
  useSeedDefaultChartOfAccountsMutation: vi.fn(),
  useCreateChartOfAccountMutation: vi.fn(),
  useUpdateChartOfAccountMutation: vi.fn(),
  useGetChartOfAccountRecentActivityQuery: vi.fn(),
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

const mockLiabilityAccount = {
  ...mockAccount,
  id: '2',
  code: '2000',
  name: 'Accounts Payable',
  type: 'LIABILITY',
}

const mockInactiveAccount = {
  ...mockAccount,
  id: '3',
  code: '3000',
  name: 'Old Revenue',
  type: 'REVENUE',
  isActive: false,
}

function setup(accounts = [mockAccount]) {
  mockedApi.useGetChartOfAccountsHierarchyQuery.mockReturnValue({
    data: accounts,
    isLoading: false,
    refetch: vi.fn(),
  })
}

function renderPage() {
  return render(
    <BrowserRouter>
      <ChartOfAccountsPage />
    </BrowserRouter>,
  )
}

function getRenderedAccountCodes() {
  return Array.from(document.querySelectorAll('tr[data-account-index] td:first-child')).map((cell) =>
    cell.textContent?.trim() ?? '',
  )
}

describe('ChartOfAccountsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, '', '/')
    setup([mockAccount])
    mockedApi.useGetChartOfAccountsQuery.mockReturnValue({ data: { data: [] }, isLoading: false, refetch: vi.fn() })
    mockedApi.useDeleteChartOfAccountMutation.mockReturnValue([vi.fn()])
    mockedApi.useSeedDefaultChartOfAccountsMutation.mockReturnValue([vi.fn()])
    mockedApi.useCreateChartOfAccountMutation.mockReturnValue([vi.fn()])
    mockedApi.useUpdateChartOfAccountMutation.mockReturnValue([vi.fn()])
    mockedApi.useGetChartOfAccountRecentActivityQuery.mockReturnValue({
      data: [],
      isLoading: false,
    })
  })

  it('renders page title', () => {
    renderPage()
    expect(screen.getByText('Chart of Accounts')).toBeInTheDocument()
  })

  it('renders account code from hierarchy data', () => {
    renderPage()
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
    setup([parent])

    renderPage()

    expect(screen.getByText('1000')).toBeInTheDocument()
    expect(screen.getByText('1010')).toBeInTheDocument()
  })

  it('filters by account type and hides non-matching accounts', async () => {
    setup([mockAccount, mockLiabilityAccount])
    const user = userEvent.setup()

    renderPage()

    expect(screen.getByText('1000')).toBeInTheDocument()
    expect(screen.getByText('2000')).toBeInTheDocument()

    await user.click(screen.getByLabelText('Account Type'))
    await user.click(screen.getByRole('option', { name: 'Asset' }))

    expect(screen.getByText('1000')).toBeInTheDocument()
    expect(screen.queryByText('2000')).not.toBeInTheDocument()
  })

  it('filters by active status and hides inactive accounts', async () => {
    setup([mockAccount, mockInactiveAccount])
    const user = userEvent.setup()

    renderPage()

    expect(screen.getByText('1000')).toBeInTheDocument()
    expect(screen.getByText('3000')).toBeInTheDocument()

    await user.click(screen.getByLabelText('Status'))
    await user.click(screen.getByRole('option', { name: 'Active' }))

    expect(screen.getByText('1000')).toBeInTheDocument()
    expect(screen.queryByText('3000')).not.toBeInTheDocument()
  })

  it('combines account type and status filters', async () => {
    const activeAsset = { ...mockAccount, id: '1', code: '1000', type: 'ASSET', isActive: true }
    const inactiveAsset = { ...mockAccount, id: '2', code: '1100', type: 'ASSET', isActive: false }
    const activeLiability = { ...mockAccount, id: '3', code: '2000', type: 'LIABILITY', isActive: true }
    setup([activeAsset, inactiveAsset, activeLiability])
    const user = userEvent.setup()

    renderPage()

    await user.click(screen.getByLabelText('Account Type'))
    await user.click(screen.getByRole('option', { name: 'Asset' }))

    await user.click(screen.getByLabelText('Status'))
    await user.click(screen.getByRole('option', { name: 'Active' }))

    expect(screen.getByText('1000')).toBeInTheDocument()
    expect(screen.queryByText('1100')).not.toBeInTheDocument()
    expect(screen.queryByText('2000')).not.toBeInTheDocument()
  })

  it('toggles sort order for account codes', async () => {
    setup([mockLiabilityAccount, mockAccount])
    const user = userEvent.setup()

    renderPage()

    expect(getRenderedAccountCodes()).toEqual(['1000', '2000'])

    await user.click(screen.getByRole('button', { name: /sort/i }))

    expect(getRenderedAccountCodes()).toEqual(['2000', '1000'])
  })
})
