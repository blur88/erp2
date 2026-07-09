import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import ChartOfAccountFormDialog from '../ChartOfAccountFormDialog'
import { AccountType, type ChartOfAccount } from '@/types'

vi.mock('@/store/api/accountingApi', () => ({
  useCreateChartOfAccountMutation: () => [vi.fn(), { isLoading: false }],
  useUpdateChartOfAccountMutation: () => [vi.fn(), { isLoading: false }],
  useGetChartOfAccountsQuery: () => ({ data: { data: [] } }),
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

const mockAccount: ChartOfAccount = {
  id: 'a1',
  code: '1000',
  name: 'Cash',
  type: AccountType.ASSET,
  isActive: true,
  isCashEquivalent: true,
  fullCode: '1000',
  isParent: false,
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
}

describe('ChartOfAccountFormDialog', () => {
  const onClose = vi.fn()
  const onSuccess = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('create mode shows code and opening balance', () => {
    render(
      <ChartOfAccountFormDialog
        open={true}
        account={null}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )
    expect(screen.getByLabelText(/account code/i)).toBeEnabled()
    expect(screen.getByLabelText(/opening balance/i)).toBeInTheDocument()
  })

  it('edit mode does not expose editable code/type or opening balance', () => {
    render(
      <ChartOfAccountFormDialog
        open={true}
        account={mockAccount}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    )
    expect(screen.queryByLabelText(/opening balance/i)).toBeNull()
    expect(screen.queryByRole('textbox', { name: /account code/i })).toBeNull()
  })
})