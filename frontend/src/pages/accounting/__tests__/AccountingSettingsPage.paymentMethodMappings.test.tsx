import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'

// Namespace import so the cache-ordering test can spy on the real hook.
import * as pmDraftModule from '../usePaymentMethodMappingDraft'

const {
  mockAccounts,
  mockSettings,
  mockUpdateSettings,
  mockBulkUpdatePaymentMappings,
  pmRows,
  pmState,
  mockShowSuccess,
  mockShowError,
  mockDispatch,
  mockUpdateQueryData,
  mockGetAccountingSettingsQuery,
  mockGetAccountsQuery,
  mockGetFormBMappingsQuery,
  mockGetPaymentMethodMappingsQuery,
} = vi.hoisted(() => {
  const mockShowSuccess = vi.fn()
  const mockShowError = vi.fn()
  const mockDispatch = vi.fn()
  const mockUpdateSettings = vi.fn(() => ({ unwrap: () => Promise.resolve(undefined) }))
  const mockBulkUpdatePaymentMappings = vi.fn(() => ({
    unwrap: () => Promise.resolve([] as any[]),
  }))
  const mockGetAccountingSettingsQuery = vi.fn()
  const mockGetAccountsQuery = vi.fn()
  const mockGetFormBMappingsQuery = vi.fn()
  const mockGetPaymentMethodMappingsQuery = vi.fn()

  const mockAccounts = {
    data: [
      { id: 'cash-1', code: '1100', name: 'Cash on Hand', type: 'Asset' as const, parentId: null, description: null, isActive: true, createdBy: null, isSystem: false, isPostable: true, openingBalance: '0.0000', createdAt: '', updatedAt: '' },
      { id: 'bank-1', code: '1200', name: 'Checking Account', type: 'Asset' as const, parentId: null, description: null, isActive: true, createdBy: null, isSystem: false, isPostable: true, openingBalance: '0.0000', createdAt: '', updatedAt: '' },
      { id: 'supp-dep-1', code: '1300', name: 'Supplier Deposits', type: 'Asset' as const, parentId: null, description: null, isActive: true, createdBy: null, isSystem: false, isPostable: true, openingBalance: '0.0000', createdAt: '', updatedAt: '' },
      { id: 'inv-1', code: '1400', name: 'Inventory Asset', type: 'Asset' as const, parentId: null, description: null, isActive: true, createdBy: null, isSystem: false, isPostable: true, openingBalance: '0.0000', createdAt: '', updatedAt: '' },
      { id: 'cust-dep-1', code: '2100', name: 'Customer Deposits', type: 'Liability' as const, parentId: null, description: null, isActive: true, createdBy: null, isSystem: false, isPostable: true, openingBalance: '0.0000', createdAt: '', updatedAt: '' },
      { id: 'obe-1', code: '3100', name: 'Opening Balance Equity', type: 'Equity' as const, parentId: null, description: null, isActive: true, createdBy: null, isSystem: false, isPostable: true, openingBalance: '0.0000', createdAt: '', updatedAt: '' },
      { id: 'sales-rev-1', code: '4100', name: 'Sales Revenue', type: 'Income' as const, parentId: null, description: null, isActive: true, createdBy: null, isSystem: false, isPostable: true, openingBalance: '0.0000', createdAt: '', updatedAt: '' },
      { id: 'cogs-1', code: '5100', name: 'Cost of Goods Sold', type: 'Expense' as const, parentId: null, description: null, isActive: true, createdBy: null, isSystem: false, isPostable: true, openingBalance: '0.0000', createdAt: '', updatedAt: '' },
      { id: 'expense-1', code: '5200', name: 'Default Expense', type: 'Expense' as const, parentId: null, description: null, isActive: true, createdBy: null, isSystem: false, isPostable: true, openingBalance: '0.0000', createdAt: '', updatedAt: '' },
      { id: 'owner-cap-1', code: '3200', name: 'Owner Capital', type: 'Equity' as const, parentId: null, description: null, isActive: true, createdBy: null, isSystem: false, isPostable: true, openingBalance: '0.0000', createdAt: '', updatedAt: '' },
      { id: 'owner-draw-1', code: '3300', name: 'Owner Drawings', type: 'Equity' as const, parentId: null, description: null, isActive: true, createdBy: null, isSystem: false, isPostable: true, openingBalance: '0.0000', createdAt: '', updatedAt: '' },
    ],
    meta: { total: 11 },
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

  const pmRows = [
    { paymentMethodId: 'pm-1', paymentMethodName: 'Maybank', paymentMethodCode: 'MB', accountingChannel: 'BANK' as const, accountId: 'a-1', accountCode: '1210', accountName: 'Maybank', status: 'mapped' as const, invalidReason: null },
    { paymentMethodId: 'pm-2', paymentMethodName: 'Atome', paymentMethodCode: 'ATM', accountingChannel: 'BANK' as const, accountId: null, accountCode: null, accountName: null, status: 'unmapped' as const, invalidReason: null },
    { paymentMethodId: 'pm-3', paymentMethodName: 'Shopee', paymentMethodCode: 'SHP', accountingChannel: 'BANK' as const, accountId: 'a-3', accountCode: '1230', accountName: 'Shopee', status: 'invalid' as const, invalidReason: 'inactive' as const },
  ]

  // The page writes the authoritative response into the RTK cache before
  // resetting the draft. This holder lets the mocked query reflect that write
  // on the re-render, so a post-save assertion sees the server values.
  const pmState = { rows: pmRows as any[] }

  const mockUpdateQueryData = vi.fn(
    (_tag: string, _arg: unknown, recipe: (current: any[]) => any[]) => {
      pmState.rows = recipe(pmState.rows)
      return { type: 'noop' }
    },
  )

  mockGetAccountingSettingsQuery.mockReturnValue({ data: mockSettings, isLoading: false, error: undefined })
  mockGetAccountsQuery.mockReturnValue({ data: mockAccounts, isLoading: false, error: undefined })
  mockGetFormBMappingsQuery.mockReturnValue({ data: [], isLoading: false, isError: false })
  mockGetPaymentMethodMappingsQuery.mockImplementation(() => ({
    data: pmState.rows, isLoading: false, isError: false, error: undefined,
  }))

  return {
    mockAccounts,
    mockSettings,
    mockUpdateSettings,
    mockBulkUpdatePaymentMappings,
    pmRows,
    pmState,
    mockShowSuccess,
    mockShowError,
    mockDispatch,
    mockUpdateQueryData,
    mockGetAccountingSettingsQuery,
    mockGetAccountsQuery,
    mockGetFormBMappingsQuery,
    mockGetPaymentMethodMappingsQuery,
  }
})

vi.mock('@/store/api/accountingApi', () => ({
  useGetAccountingSettingsQuery: mockGetAccountingSettingsQuery,
  useGetAccountsQuery: mockGetAccountsQuery,
  useGetFormBMappingsQuery: mockGetFormBMappingsQuery,
  useGetPaymentMethodMappingsQuery: mockGetPaymentMethodMappingsQuery,
  useUpdateAccountingSettingsMutation: vi.fn().mockReturnValue([mockUpdateSettings, { isLoading: false }]),
  useUpdateFormBMappingMutation: vi.fn().mockReturnValue([vi.fn(() => ({ unwrap: () => Promise.resolve(undefined) })), { isLoading: false }]),
  useBulkUpdateFormBMappingsMutation: vi.fn().mockReturnValue([vi.fn(() => ({ unwrap: () => Promise.resolve([]) })), { isLoading: false }]),
  useBulkUpdatePaymentMethodMappingsMutation: vi.fn().mockReturnValue([mockBulkUpdatePaymentMappings, { isLoading: false }]),
  accountingApi: { util: { updateQueryData: mockUpdateQueryData } },
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}))

vi.mock('@/hooks/useRedux', async (importOriginal) => {
  const actual = await importOriginal() as any
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

const updatedPmRows = [
  { ...pmRows[0], accountId: 'expense-1', accountCode: '5200', accountName: 'Default Expense' },
  pmRows[1],
  pmRows[2],
]

beforeEach(() => {
  mockUpdateSettings.mockClear()
  mockBulkUpdatePaymentMappings.mockClear()
  mockBulkUpdatePaymentMappings.mockImplementation(() => ({
    unwrap: () => Promise.resolve(pmRows),
  }))
  mockShowSuccess.mockClear()
  mockShowError.mockClear()
  mockDispatch.mockClear()
  mockUpdateQueryData.mockClear()
  mockUpdateQueryData.mockImplementation(
    (_tag: string, _arg: unknown, recipe: (current: any[]) => any[]) => {
      pmState.rows = recipe(pmState.rows)
      return { type: 'noop' }
    },
  )
  pmState.rows = pmRows
  mockGetAccountingSettingsQuery.mockReturnValue({ data: mockSettings, isLoading: false, error: undefined })
  mockGetAccountsQuery.mockReturnValue({ data: mockAccounts, isLoading: false, error: undefined })
  mockGetFormBMappingsQuery.mockReturnValue({ data: [], isLoading: false, isError: false })
  mockGetPaymentMethodMappingsQuery.mockImplementation(() => ({
    data: pmState.rows, isLoading: false, isError: false, error: undefined,
  }))
})

async function stageMappingChange(user: ReturnType<typeof userEvent.setup>, paymentMethodId: string) {
  await user.click(
    within(screen.getByTestId(`pm-map-select-${paymentMethodId}`)).getByRole('combobox'),
  )
  await user.click(await screen.findByRole('option', { name: /5200 Default Expense/i }))
}

describe('AccountingSettingsPage — payment method mappings', () => {
  /*
   * The Cash and Bank fields are the FALLBACK for methods with no mapping of
   * their own; the copy must say so, or they read as the only place payments
   * post.
   */
  it('describes the Cash and Bank accounts as the fallback for unmapped methods', () => {
    renderPage()
    expect(screen.getAllByText(/fallback when a payment method has no mapping/i)).toHaveLength(2)
  })

  /*
   * REQUIRED, not an optimization: the DTO carries @ArrayNotEmpty(), so an empty
   * mappings array is a 400. An unchanged section must issue no request at all.
   *
   * The Default Accounts half is dirtied instead so Save is enabled and the job
   * list actually runs.
   */
  it('does not call the mapping mutation when no mapping changed', async () => {
    renderPage()
    const user = userEvent.setup()

    await user.click(screen.getByLabelText('Cash Account'))
    await user.click(await screen.findByRole('option', { name: /1200 - Checking Account/i }))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalledTimes(1))
    expect(mockBulkUpdatePaymentMappings).not.toHaveBeenCalled()
  })

  it('calls the mutation with only the changed mappings on save', async () => {
    renderPage()
    const user = userEvent.setup()

    await stageMappingChange(user, 'pm-1')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() =>
      expect(mockBulkUpdatePaymentMappings).toHaveBeenCalledWith({
        mappings: [{ paymentMethodId: 'pm-1', accountId: 'expense-1' }],
      }),
    )
    expect(mockUpdateSettings).not.toHaveBeenCalled()
  })

  /*
   * The mixed-outcome message promises "your changes are still available to
   * retry". A draft reset on failure would silently break that promise, and the
   * user would lose edits the UI just told them were safe.
   */
  it('preserves the draft when the save fails', async () => {
    mockBulkUpdatePaymentMappings.mockReturnValueOnce({
      unwrap: () => Promise.reject({ data: 'payment mapping rejected' }),
    } as any)
    renderPage()
    const user = userEvent.setup()

    await stageMappingChange(user, 'pm-1')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(mockShowError).toHaveBeenCalled())
    expect(String(mockShowError.mock.calls[0][0])).toContain('payment mapping rejected')
    // The staged value survives on the control itself.
    expect(screen.getByTestId('pm-map-select-pm-1')).toHaveTextContent(/5200 Default Expense/)
  })

  it('keeps the save button enabled after a failed save', async () => {
    mockBulkUpdatePaymentMappings.mockReturnValueOnce({
      unwrap: () => Promise.reject({ data: 'payment mapping rejected' }),
    } as any)
    renderPage()
    const user = userEvent.setup()

    await stageMappingChange(user, 'pm-1')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(mockShowError).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeEnabled()
  })

  it('clears the draft after a successful save', async () => {
    mockBulkUpdatePaymentMappings.mockReturnValueOnce({
      unwrap: () => Promise.resolve(updatedPmRows),
    } as any)
    renderPage()
    const user = userEvent.setup()

    await stageMappingChange(user, 'pm-1')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalled())
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled(),
    )
    // The authoritative response was written into the cache, so the persisted
    // row — not a stale one — is what the reset draft falls back to.
    expect(mockUpdateQueryData).toHaveBeenCalledWith(
      'getPaymentMethodMappings',
      undefined,
      expect.any(Function),
    )
    expect(screen.getByTestId('pm-map-select-pm-1')).toHaveTextContent(/5200 Default Expense/)
  })

  it('marks the page dirty when only the mapping section changed', async () => {
    vi.mocked(useUnsavedChangesGuard).mockClear()
    renderPage()
    const user = userEvent.setup()

    await stageMappingChange(user, 'pm-2')

    await waitFor(() => {
      const calls = vi.mocked(useUnsavedChangesGuard).mock.calls
      expect(calls[calls.length - 1][0]).toBe(true)
    })
    expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled()
  })

  it('writes the server response into the cache before clearing the draft', async () => {
    const order: string[] = []
    const realUseDraft = pmDraftModule.usePaymentMethodMappingDraft
    const draftSpy = vi.spyOn(pmDraftModule, 'usePaymentMethodMappingDraft').mockImplementation(() => {
      const value = realUseDraft()
      return { ...value, reset: () => { order.push('draft-reset'); value.reset() } }
    })
    mockUpdateQueryData.mockImplementationOnce((...args: any[]) => {
      order.push('cache-write')
      // Resolving the recipe here catches a no-op that would ship as a
      // stale-row bug rather than a failure.
      expect(args[2]([])).toEqual(updatedPmRows)
      return { type: 'noop' }
    })
    mockBulkUpdatePaymentMappings.mockReturnValueOnce({
      unwrap: () => Promise.resolve(updatedPmRows),
    } as any)

    try {
      renderPage()
      const user = userEvent.setup()

      await stageMappingChange(user, 'pm-1')
      await user.click(screen.getByRole('button', { name: /save changes/i }))

      await waitFor(() => expect(order).toContain('draft-reset'))
      expect(order).toEqual(['cache-write', 'draft-reset'])
    } finally {
      draftSpy.mockRestore()
    }
  })

  /*
   * A failed mappings load must not render as an empty table: "No payment
   * methods found" is what a SUCCESSFUL empty response shows, so the user would
   * read a server error as a configuration fact.
   */
  it('surfaces a failed mappings query instead of rendering an empty table', async () => {
    mockGetPaymentMethodMappingsQuery.mockImplementation(() => ({
      data: undefined, isLoading: false, isError: true, error: { status: 500, data: 'Mappings exploded' },
    }))

    try {
      renderPage()
      expect(await screen.findByText('Mappings exploded')).toBeInTheDocument()
      expect(screen.queryByTestId('pm-map-select-pm-1')).not.toBeInTheDocument()
    } finally {
      mockGetPaymentMethodMappingsQuery.mockImplementation(() => ({
        data: pmState.rows, isLoading: false, isError: false, error: undefined,
      }))
    }
  })
})
