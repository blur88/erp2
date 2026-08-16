import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const { mockAccounts, mockSettings, mockUpdateSettings } = vi.hoisted(() => ({
  mockAccounts: {
    data: [
      {
        id: 'cash-1',
        code: '1100',
        name: 'Cash on Hand',
        type: 'Asset' as const,
        parentId: null,
        description: null,
        isActive: true,
        createdBy: null,
        isSystem: false,
        isPostable: true,
        openingBalance: '0.0000',
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'bank-1',
        code: '1200',
        name: 'Checking Account',
        type: 'Asset' as const,
        parentId: null,
        description: null,
        isActive: true,
        createdBy: null,
        isSystem: false,
        isPostable: true,
        openingBalance: '0.0000',
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'supp-dep-1',
        code: '1300',
        name: 'Supplier Deposits',
        type: 'Asset' as const,
        parentId: null,
        description: null,
        isActive: true,
        createdBy: null,
        isSystem: false,
        isPostable: true,
        openingBalance: '0.0000',
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'inv-1',
        code: '1400',
        name: 'Inventory Asset',
        type: 'Asset' as const,
        parentId: null,
        description: null,
        isActive: true,
        createdBy: null,
        isSystem: false,
        isPostable: true,
        openingBalance: '0.0000',
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'cust-dep-1',
        code: '2100',
        name: 'Customer Deposits',
        type: 'Liability' as const,
        parentId: null,
        description: null,
        isActive: true,
        createdBy: null,
        isSystem: false,
        isPostable: true,
        openingBalance: '0.0000',
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'obe-1',
        code: '3100',
        name: 'Opening Balance Equity',
        type: 'Equity' as const,
        parentId: null,
        description: null,
        isActive: true,
        createdBy: null,
        isSystem: false,
        isPostable: true,
        openingBalance: '0.0000',
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'sales-rev-1',
        code: '4100',
        name: 'Sales Revenue',
        type: 'Income' as const,
        parentId: null,
        description: null,
        isActive: true,
        createdBy: null,
        isSystem: false,
        isPostable: true,
        openingBalance: '0.0000',
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'cogs-1',
        code: '5100',
        name: 'Cost of Goods Sold',
        type: 'Expense' as const,
        parentId: null,
        description: null,
        isActive: true,
        createdBy: null,
        isSystem: false,
        isPostable: true,
        openingBalance: '0.0000',
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'expense-1',
        code: '5200',
        name: 'Default Expense',
        type: 'Expense' as const,
        parentId: null,
        description: null,
        isActive: true,
        createdBy: null,
        isSystem: false,
        isPostable: true,
        openingBalance: '0.0000',
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'owner-cap-1',
        code: '3200',
        name: 'Owner Capital',
        type: 'Equity' as const,
        parentId: null,
        description: null,
        isActive: true,
        createdBy: null,
        isSystem: false,
        isPostable: true,
        openingBalance: '0.0000',
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'owner-draw-1',
        code: '3300',
        name: 'Owner Drawings',
        type: 'Equity' as const,
        parentId: null,
        description: null,
        isActive: true,
        createdBy: null,
        isSystem: false,
        isPostable: true,
        openingBalance: '0.0000',
        createdAt: '',
        updatedAt: '',
      },
    ],
    meta: { total: 11 },
  },
  mockSettings: {
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
  },
  mockUpdateSettings: vi.fn(() => ({
    unwrap: () => Promise.resolve(undefined),
  })),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useGetAccountingSettingsQuery: vi
    .fn()
    .mockReturnValue({ data: mockSettings, isLoading: false, error: undefined }),
  useGetAccountsQuery: vi
    .fn()
    .mockReturnValue({ data: mockAccounts, isLoading: false, error: undefined }),
  useUpdateAccountingSettingsMutation: vi
    .fn()
    .mockReturnValue([mockUpdateSettings, { isLoading: false }]),
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

import AccountingSettingsPage from '../AccountingSettingsPage'

// The page reads state.auth.user.role: PUT /accounting/settings is admin-only, so
// the Save button only renders for an admin.
function renderPage(role = 'admin') {
  const store = configureStore({
    reducer: { auth: (s = { user: { role }, isAuthenticated: true }) => s } as any,
  })
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <AccountingSettingsPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('AccountingSettingsPage', () => {
  it('renders 4 section cards', () => {
    renderPage()
    expect(screen.getByText('Payment')).toBeInTheDocument()
    expect(screen.getByText('Sales')).toBeInTheDocument()
    expect(screen.getByText('Inventory & Purchasing')).toBeInTheDocument()
    expect(screen.getByText('System')).toBeInTheDocument()
  })

  it('Cash and Bank dropdowns list only Asset accounts', async () => {
    renderPage()
    const user = userEvent.setup()

    const cashSelect = screen.getByLabelText('Cash Account')
    await user.click(cashSelect)

    expect(screen.getByRole('option', { name: /1100 - Cash on Hand/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /1200 - Checking Account/i })).toBeInTheDocument()

    expect(
      screen.queryByRole('option', { name: /3100 - Opening Balance Equity/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('option', { name: /4100 - Sales Revenue/i }),
    ).not.toBeInTheDocument()
  })

  it('keeps the page header mounted and shows a skeleton while loading', async () => {
    const { useGetAccountingSettingsQuery } = await import('@/store/api/accountingApi')
    const mockFn = vi.mocked(useGetAccountingSettingsQuery)
    // The override must persist (the page re-renders, so mockReturnValueOnce
    // would lapse before the assertions run), but nothing resets mocks between
    // tests — the global afterEach only calls cleanup(). Restoring in `finally`
    // keeps a failed assertion here from leaking a permanently-loading page into
    // every later test and turning one failure into a file-wide cascade.
    mockFn.mockReturnValue({ data: undefined, isLoading: true, error: undefined } as any)

    try {
      const { container } = renderPage()

      expect(screen.getByText('Accounting Settings')).toBeInTheDocument()
      expect(container.querySelectorAll('.MuiSkeleton-root').length).toBeGreaterThan(0)
    } finally {
      mockFn.mockReturnValue({ data: mockSettings, isLoading: false, error: undefined } as any)
    }
  })

  it('Save calls update mutation with all 11 ids', async () => {
    mockUpdateSettings.mockClear()
    renderPage()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith({
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
      })
    })
  })

  it('Cancel restores a modified field to its loaded value', async () => {
    renderPage()
    const user = userEvent.setup()

    await user.click(screen.getByLabelText('Cash Account'))
    await user.click(screen.getByRole('option', { name: /1200 - Checking Account/i }))
    expect(screen.getByLabelText('Cash Account')).toHaveTextContent('1200 - Checking Account')

    await user.click(screen.getByRole('button', { name: /cancel/i }))

    await waitFor(() => {
      expect(screen.getByLabelText('Cash Account')).toHaveTextContent('1100 - Cash on Hand')
    })
  })

  it('Cancel is disabled while pristine and enabled once a field changes', async () => {
    renderPage()
    const user = userEvent.setup()

    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled()

    await user.click(screen.getByLabelText('Cash Account'))
    await user.click(screen.getByRole('option', { name: /1200 - Checking Account/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /cancel/i })).toBeEnabled()
    })
  })

  it('a successful save makes the saved values the new baseline', async () => {
    mockUpdateSettings.mockClear()
    renderPage()
    const user = userEvent.setup()

    await user.click(screen.getByLabelText('Cash Account'))
    await user.click(screen.getByRole('option', { name: /1200 - Checking Account/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /cancel/i })).toBeEnabled()
    })

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    // reset(data) after a successful save clears isDirty, so Cancel disables again.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled()
    })
    // The saved value is the new baseline, not rolled back to the loaded one.
    expect(screen.getByLabelText('Cash Account')).toHaveTextContent('1200 - Checking Account')
  })

  // Guards the reason Cancel must call parameterless reset(): resetting from the
  // `settings` query instead would roll the form back to the PRE-save response,
  // which RTK Query can still be holding. Clicking Cancel *after* a save is the
  // only action that distinguishes the two, so without this test the stale-value
  // bug reintroduces itself with a green suite.
  it('Cancel after a save restores the saved values, not the stale loaded ones', async () => {
    mockUpdateSettings.mockClear()
    renderPage()
    const user = userEvent.setup()

    await user.click(screen.getByLabelText('Cash Account'))
    await user.click(screen.getByRole('option', { name: /1200 - Checking Account/i }))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled()
    })

    // Dirty the form again, then Cancel. The baseline must be the SAVED value
    // (1200), not the value the settings query still reports (1100).
    await user.click(screen.getByLabelText('Cash Account'))
    await user.click(screen.getByRole('option', { name: /1100 - Cash on Hand/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /cancel/i })).toBeEnabled()
    })

    await user.click(screen.getByRole('button', { name: /cancel/i }))

    await waitFor(() => {
      expect(screen.getByLabelText('Cash Account')).toHaveTextContent('1200 - Checking Account')
    })
  })

  // A failed load must not leave an empty but submittable form behind: every
  // field would post as '' and overwrite good mappings with blanks.
  it('hides the form when the settings query fails', async () => {
    const { useGetAccountingSettingsQuery } = await import('@/store/api/accountingApi')
    const mockFn = vi.mocked(useGetAccountingSettingsQuery)
    // The shape axiosBaseQuery actually returns: { status, data }, message in `data`.
    mockFn.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { status: 500, data: 'Boom' },
    } as any)

    try {
      renderPage()

      expect(screen.getByText('Boom')).toBeInTheDocument()
      // Header survives so the page still frames correctly.
      expect(screen.getByText('Accounting Settings')).toBeInTheDocument()
      expect(screen.queryByLabelText('Cash Account')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument()
    } finally {
      mockFn.mockReturnValue({ data: mockSettings, isLoading: false, error: undefined } as any)
    }
  })

  // The accounts query populates every dropdown. If it fails the selects would
  // render empty with no explanation, so its error has to surface too.
  it('surfaces a failed accounts query instead of rendering empty dropdowns', async () => {
    const { useGetAccountsQuery } = await import('@/store/api/accountingApi')
    const mockFn = vi.mocked(useGetAccountsQuery)
    mockFn.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { status: 503, data: 'Accounts exploded' },
    } as any)

    try {
      renderPage()

      expect(screen.getByText('Accounts exploded')).toBeInTheDocument()
      expect(screen.queryByLabelText('Cash Account')).not.toBeInTheDocument()
    } finally {
      mockFn.mockReturnValue({ data: mockAccounts, isLoading: false, error: undefined } as any)
    }
  })

  it('falls back to a generic message when the error carries no detail', async () => {
    const { useGetAccountingSettingsQuery } = await import('@/store/api/accountingApi')
    const mockFn = vi.mocked(useGetAccountingSettingsQuery)
    mockFn.mockReturnValue({ data: undefined, isLoading: false, error: { status: 500 } } as any)

    try {
      renderPage()
      expect(screen.getByText('Failed to load settings.')).toBeInTheDocument()
    } finally {
      mockFn.mockReturnValue({ data: mockSettings, isLoading: false, error: undefined } as any)
    }
  })

  // PUT /accounting/settings stays admin-only: these mappings decide which GL
  // accounts sales/purchasing auto-post into. Non-admins read them, never save.
  describe.each(['manager', 'sales_staff', 'inventory_staff', 'procurement_staff'])(
    'as %s',
    (role) => {
      it('still reads the current mappings', () => {
        renderPage(role)
        expect(screen.getByText('Payment')).toBeInTheDocument()
        expect(screen.getByText('Sales')).toBeInTheDocument()
      })

      it('hides the Save button and explains why', () => {
        renderPage(role)
        expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument()
        expect(
          screen.getByText(/read-only. Only an administrator can change them/i),
        ).toBeInTheDocument()
      })

      it('renders the account selects disabled', () => {
        renderPage(role)
        expect(screen.getByLabelText('Cash Account')).toHaveAttribute('aria-disabled', 'true')
        expect(screen.getByLabelText('Sales Revenue Account')).toHaveAttribute(
          'aria-disabled',
          'true',
        )
      })
    },
  )
})

describe('AccountingSettingsPage - Owner Equity', () => {
  it('renders owner capital and owner drawings selectors', async () => {
    renderPage()
    expect(await screen.findByLabelText(/Owner Capital Account/)).toBeInTheDocument()
    expect(await screen.findByLabelText(/Owner Drawings Account/)).toBeInTheDocument()
  })

  it('requires both owner accounts before saving settings', async () => {
    const { useGetAccountingSettingsQuery } = await import('@/store/api/accountingApi')
    const mockFn = vi.mocked(useGetAccountingSettingsQuery)
    mockFn.mockReturnValue({
      data: {
        ...mockSettings,
        ownerCapitalAccountId: '',
        ownerDrawingsAccountId: '',
      },
      isLoading: false,
      error: undefined,
    } as any)

    try {
      renderPage()
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: /Save/i }))
      expect(await screen.findByText(/Owner capital account is required/)).toBeInTheDocument()
    } finally {
      mockFn.mockReturnValue({ data: mockSettings, isLoading: false, error: undefined } as any)
    }
  })
})
