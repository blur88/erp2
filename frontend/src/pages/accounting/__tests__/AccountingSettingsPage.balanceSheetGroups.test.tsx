import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockAccounts,
  mockSettings,
  mockUpdateSettings,
  mockSetGroups,
  bsgState,
  mockShowSuccess,
  mockShowError,
  mockDispatch,
  mockUpdateQueryData,
  mockGetAccountingSettingsQuery,
  mockGetAccountsQuery,
  mockGetBalanceSheetGroupsQuery,
} = vi.hoisted(() => {
  const mockShowSuccess = vi.fn()
  const mockShowError = vi.fn()
  const mockDispatch = vi.fn()
  const mockUpdateSettings = vi.fn(() => ({ unwrap: () => Promise.resolve(undefined) }))
  const mockSetGroups = vi.fn(() => ({ unwrap: () => Promise.resolve([] as any[]) }))
  const mockGetAccountingSettingsQuery = vi.fn()
  const mockGetAccountsQuery = vi.fn()
  const mockGetBalanceSheetGroupsQuery = vi.fn()

  const asset = (id: string, code: string, name: string, type = 'Asset') => ({
    id, code, name, type, parentId: null, description: null, isActive: true,
    createdBy: null, isSystem: false, isPostable: true, openingBalance: '0.0000',
    createdAt: '', updatedAt: '',
  })

  const mockAccounts = {
    data: [
      asset('cash-1', '1100', 'Cash on Hand'),
      asset('bank-1', '1200', 'CIMB'),
      asset('maybank-1', '1210', 'Maybank'),
      asset('atome-1', '1240', 'Atome'),
      asset('supp-dep-1', '1300', 'Supplier Deposits'),
      asset('inv-1', '1400', 'Inventory Asset'),
      asset('cust-dep-1', '2100', 'Customer Deposits', 'Liability'),
      asset('obe-1', '3100', 'Opening Balance Equity', 'Equity'),
      asset('owner-cap-1', '3200', 'Owner Capital', 'Equity'),
      asset('owner-draw-1', '3300', 'Owner Drawings', 'Equity'),
      asset('sales-rev-1', '4100', 'Sales Revenue', 'Income'),
      asset('cogs-1', '5100', 'Cost of Goods Sold', 'Expense'),
      asset('expense-1', '5200', 'Default Expense', 'Expense'),
    ],
    meta: { total: 13 },
  }

  const mockSettings = {
    id: true,
    cashAccountId: 'cash-1',
    bankAccountId: 'bank-1',
    inventoryAccountId: 'inv-1',
    supplierDepositAccountId: 'supp-dep-1',
    customerDepositAccountId: 'cust-dep-1',
    openingBalanceEquityAccountId: 'obe-1',
    ownerCapitalAccountId: 'owner-cap-1',
    ownerDrawingsAccountId: 'owner-draw-1',
    salesRevenueAccountId: 'sales-rev-1',
    cogsAccountId: 'cogs-1',
    defaultExpenseAccountId: 'expense-1',
  }

  // Mirrors the RTK cache so a post-save assertion sees the server values the
  // page wrote, exactly as the payment-mapping suite does.
  const bsgState = { rows: [] as any[] }

  const mockUpdateQueryData = vi.fn(
    (_tag: string, _arg: unknown, recipe: (current: any[]) => any[]) => {
      bsgState.rows = recipe(bsgState.rows)
      return { type: 'noop' }
    },
  )

  return {
    mockAccounts, mockSettings, mockUpdateSettings, mockSetGroups, bsgState,
    mockShowSuccess, mockShowError, mockDispatch, mockUpdateQueryData,
    mockGetAccountingSettingsQuery, mockGetAccountsQuery, mockGetBalanceSheetGroupsQuery,
  }
})

vi.mock('@/store/api/accountingApi', () => ({
  useGetAccountingSettingsQuery: mockGetAccountingSettingsQuery,
  useGetAccountsQuery: mockGetAccountsQuery,
  useGetFormBMappingsQuery: vi.fn(() => ({ data: [], isLoading: false, isError: false })),
  useGetPaymentMethodMappingsQuery: vi.fn(() => ({
    data: [], isLoading: false, isError: false, error: undefined,
  })),
  useGetBalanceSheetGroupsQuery: mockGetBalanceSheetGroupsQuery,
  useUpdateAccountingSettingsMutation: vi.fn().mockReturnValue([mockUpdateSettings, { isLoading: false }]),
  useUpdateFormBMappingMutation: vi.fn().mockReturnValue([vi.fn(() => ({ unwrap: () => Promise.resolve(undefined) })), { isLoading: false }]),
  useBulkUpdateFormBMappingsMutation: vi.fn().mockReturnValue([vi.fn(() => ({ unwrap: () => Promise.resolve([]) })), { isLoading: false }]),
  useBulkUpdatePaymentMethodMappingsMutation: vi.fn().mockReturnValue([vi.fn(() => ({ unwrap: () => Promise.resolve([]) })), { isLoading: false }]),
  useSetBalanceSheetGroupsMutation: vi.fn().mockReturnValue([mockSetGroups, { isLoading: false }]),
  accountingApi: { util: { updateQueryData: mockUpdateQueryData } },
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}))

vi.mock('@/hooks/useRedux', async (importOriginal) => {
  const actual = (await importOriginal()) as any
  return { ...actual, useAppDispatch: () => mockDispatch }
})

vi.mock('@/hooks/useUnsavedChangesGuard', () => ({
  useUnsavedChangesGuard: vi.fn().mockReturnValue({ UnsavedChangesDialog: null }),
}))

import AccountingSettingsPage from '../AccountingSettingsPage'

function renderPage() {
  const store = configureStore({
    reducer: { auth: (s = { user: { role: 'admin' }, isAuthenticated: true }) => s } as any,
  })
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <AccountingSettingsPage />
      </MemoryRouter>
    </Provider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  bsgState.rows = []
  mockUpdateSettings.mockImplementation(() => ({ unwrap: () => Promise.resolve(undefined) }))
  mockSetGroups.mockImplementation(() => ({ unwrap: () => Promise.resolve(bsgState.rows) }))
  mockUpdateQueryData.mockImplementation(
    (_tag: string, _arg: unknown, recipe: (current: any[]) => any[]) => {
      bsgState.rows = recipe(bsgState.rows)
      return { type: 'noop' }
    },
  )
  mockGetAccountingSettingsQuery.mockReturnValue({ data: mockSettings, isLoading: false, error: undefined })
  mockGetAccountsQuery.mockReturnValue({ data: mockAccounts, isLoading: false, error: undefined })
  mockGetBalanceSheetGroupsQuery.mockImplementation(() => ({
    data: bsgState.rows, isLoading: false, isError: false, error: undefined,
  }))
})

const stageGroupEdit = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(within(screen.getByTestId('bsg-select-N38')).getByRole('combobox'))
  await user.click(await screen.findByRole('option', { name: /1210 Maybank/ }))
  await user.click(screen.getByTestId('bsg-add-N38'))
}

describe('AccountingSettingsPage — Balance Sheet grouping: loading', () => {
  it('renders the skeleton while the groups query is loading', () => {
    mockGetBalanceSheetGroupsQuery.mockReturnValue({
      data: undefined, isLoading: true, isError: false, error: undefined,
    })
    renderPage()
    // The groups query participates in the page's shared loading gate, so the
    // section must not render half-loaded.
    expect(screen.queryByTestId('bsg-group-N38')).not.toBeInTheDocument()
  })

  it('surfaces a groups load failure as the page error, not an empty section', () => {
    mockGetBalanceSheetGroupsQuery.mockReturnValue({
      data: undefined, isLoading: false, isError: true,
      error: { status: 500, data: 'Groups unavailable' },
    })
    renderPage()
    expect(screen.getByText('Groups unavailable')).toBeInTheDocument()
    // Rendering the section with no rows would read as "nothing configured",
    // which is a different and misleading claim.
    expect(screen.queryByTestId('bsg-group-N38')).not.toBeInTheDocument()
  })

  it('renders both groups once loaded', async () => {
    renderPage()
    expect(await screen.findByTestId('bsg-group-N38')).toBeInTheDocument()
    expect(screen.getByTestId('bsg-group-N39')).toBeInTheDocument()
  })
})

describe('AccountingSettingsPage — Balance Sheet grouping: save', () => {
  it('sends the COMPLETE set and reports success', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByTestId('bsg-group-N38')
    await stageGroupEdit(user)

    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(mockSetGroups).toHaveBeenCalledTimes(1))
    expect(mockSetGroups).toHaveBeenCalledWith({
      groups: [{ accountId: 'maybank-1', group: 'BANK_BALANCE' }],
    })
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalled())
  })

  it('does NOT call the mutation when the grouping is untouched', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByTestId('bsg-group-N38')

    // Dirty a DIFFERENT section so a save actually runs.
    await user.click(within(screen.getByTestId('bsg-select-N38')).getByRole('combobox'))
    await user.keyboard('{Escape}')
    const saveButton = screen.getByRole('button', { name: /save/i })
    expect(saveButton).toBeDisabled()
    expect(mockSetGroups).not.toHaveBeenCalled()
  })

  it('writes the authoritative response into the cache before re-seeding', async () => {
    const user = userEvent.setup()
    const serverRows = [
      {
        accountId: 'maybank-1', group: 'BANK_BALANCE', accountCode: '1210',
        accountName: 'Maybank', status: 'ok', invalidReason: null,
      },
    ]
    mockSetGroups.mockImplementation(() => ({ unwrap: () => Promise.resolve(serverRows) }))

    renderPage()
    await screen.findByTestId('bsg-group-N38')
    await stageGroupEdit(user)
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() =>
      expect(mockUpdateQueryData).toHaveBeenCalledWith(
        'getBalanceSheetGroups', undefined, expect.any(Function),
      ),
    )
    expect(bsgState.rows).toEqual(serverRows)
  })
})

describe('AccountingSettingsPage — Balance Sheet grouping: save failures', () => {
  it('surfaces the BACKEND conflict message rather than a generic failure', async () => {
    const user = userEvent.setup()
    // The real shape of a #1239 rejection, through axiosBaseQuery.
    mockSetGroups.mockImplementation(() => ({
      unwrap: () =>
        Promise.reject({
          status: 400,
          data: 'Balance Sheet grouping conflict: 1200 CIMB would contribute to N38 and N39.',
        }),
    }))

    renderPage()
    await screen.findByTestId('bsg-group-N38')
    await stageGroupEdit(user)
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(mockShowError).toHaveBeenCalled())
    expect(mockShowError.mock.calls[0][0]).toMatch(/would contribute to N38 and N39/)
  })

  it('renders a ValidationPipe message ARRAY rather than [object Object]', async () => {
    const user = userEvent.setup()
    mockSetGroups.mockImplementation(() => ({
      unwrap: () =>
        Promise.reject({
          status: 400,
          data: { message: ['groups must not contain duplicate accountId values'] },
        }),
    }))

    renderPage()
    await screen.findByTestId('bsg-group-N38')
    await stageGroupEdit(user)
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(mockShowError).toHaveBeenCalled())
    const message = mockShowError.mock.calls[0][0]
    expect(message).toMatch(/duplicate accountId/)
    expect(message).not.toMatch(/\[object Object\]/)
  })

  it('KEEPS the staged edit after a failure so it can be retried', async () => {
    const user = userEvent.setup()
    mockSetGroups.mockImplementation(() => ({
      unwrap: () => Promise.reject({ status: 400, data: 'nope' }),
    }))

    renderPage()
    await screen.findByTestId('bsg-group-N38')
    await stageGroupEdit(user)
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(mockShowError).toHaveBeenCalled())
    // The chip is still staged and Save is still enabled: a failed save that
    // silently discarded the edit would lose the user's work.
    expect(screen.getByTestId('bsg-chip-maybank-1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save/i })).toBeEnabled()
  })

  it('a grouping failure does not prevent the Default Accounts save from running', async () => {
    const user = userEvent.setup()
    mockSetGroups.mockImplementation(() => ({
      unwrap: () => Promise.reject({ status: 400, data: 'grouping rejected' }),
    }))

    renderPage()
    await screen.findByTestId('bsg-group-N38')
    await stageGroupEdit(user)
    // Also dirty the Default Accounts form.
    // Default Accounts renders its options as `{code} - {name}` (with a
    // dash); the grouping section uses `{code} {name}`. Matching the wrong one
    // finds no option at all.
    await user.click(screen.getByLabelText('Cash Account'))
    await user.click(await screen.findByRole('option', { name: /1200 - CIMB/i }))

    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalled())
    // Both jobs ran; the mixed-result message names each half.
    await waitFor(() => expect(mockShowError).toHaveBeenCalled())
    const message = mockShowError.mock.calls[0][0]
    expect(message).toMatch(/Default Accounts/)
    expect(message).toMatch(/Balance Sheet grouping/)
  })

  it('runs the grouping save AFTER Default Accounts', async () => {
    /*
     * Ordering matters: the backend validates grouping conflicts against
     * post-write state from both sides (#1239), so the group write must see
     * the settings the user just committed. The reverse order would validate
     * the groups against settings that are about to change.
     */
    const user = userEvent.setup()
    const order: string[] = []
    mockUpdateSettings.mockImplementation(() => {
      order.push('settings')
      return { unwrap: () => Promise.resolve(undefined) }
    })
    mockSetGroups.mockImplementation(() => {
      order.push('groups')
      return { unwrap: () => Promise.resolve([]) }
    })

    renderPage()
    await screen.findByTestId('bsg-group-N38')
    await stageGroupEdit(user)
    // Default Accounts renders its options as `{code} - {name}` (with a
    // dash); the grouping section uses `{code} {name}`. Matching the wrong one
    // finds no option at all.
    await user.click(screen.getByLabelText('Cash Account'))
    await user.click(await screen.findByRole('option', { name: /1200 - CIMB/i }))

    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(order).toEqual(['settings', 'groups']))
  })
})

describe('AccountingSettingsPage — Balance Sheet grouping: permissions', () => {
  it('is read-only for a non-admin', async () => {
    const store = configureStore({
      reducer: { auth: (s = { user: { role: 'user' }, isAuthenticated: true }) => s } as any,
    })
    render(
      <Provider store={store}>
        <MemoryRouter>
          <AccountingSettingsPage />
        </MemoryRouter>
      </Provider>,
    )
    await screen.findByTestId('bsg-group-N38')
    expect(screen.getByTestId('bsg-add-N38')).toBeDisabled()
  })
})
