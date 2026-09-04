import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'

// Namespace import so the cache-ordering test can spy on the real hook.
import * as draftModule from '../useFormBMappingDraft'

const {
  mockAccounts,
  mockSettings,
  mockUpdateSettings,
  mockBulkUpdate,
  formBRows,
  mockFormBMappings,
  mockShowSuccess,
  mockShowError,
  mockDispatch,
  mockUpdateQueryData,
  mockGetAccountingSettingsQuery,
  mockGetAccountsQuery,
  mockGetFormBMappingsQuery,
} = vi.hoisted(() => {
  const mockShowSuccess = vi.fn()
  const mockShowError = vi.fn()
  const mockDispatch = vi.fn()
  const mockUpdateQueryData = vi.fn()
  const mockUpdateSettings = vi.fn(() => ({ unwrap: () => Promise.resolve(undefined) }))
  const mockBulkUpdate = vi.fn(() => ({ unwrap: () => Promise.resolve([] as any[]) }))
  const mockGetAccountingSettingsQuery = vi.fn()
  const mockGetAccountsQuery = vi.fn()
  const mockGetFormBMappingsQuery = vi.fn()
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
  const formBRows = [
    { accountId: 'a1', code: '6100', name: 'Salaries', type: 'Expense', isActive: true, category: null, eligibility: { eligible: true } },
    { accountId: 'b1', code: '6200', name: 'Office Rent', type: 'Expense', isActive: true, category: null, eligibility: { eligible: true } },
    { accountId: 'i1', code: '6300', name: 'Old Rent', type: 'Expense', isActive: false, category: 'RENT_LEASE', eligibility: { eligible: false, reason: 'INACTIVE' } },
  ] as any[]
  const mockFormBMappings: any[] = []
  // default return values
  mockGetAccountingSettingsQuery.mockReturnValue({ data: mockSettings, isLoading: false, error: undefined })
  mockGetAccountsQuery.mockReturnValue({ data: mockAccounts, isLoading: false, error: undefined })
  mockGetFormBMappingsQuery.mockReturnValue({ data: mockFormBMappings, isLoading: false, isError: false })
  return {
    mockAccounts,
    mockSettings,
    mockUpdateSettings,
    mockBulkUpdate,
    formBRows,
    mockFormBMappings,
    mockShowSuccess,
    mockShowError,
    mockDispatch,
    mockUpdateQueryData,
    mockGetAccountingSettingsQuery,
    mockGetAccountsQuery,
    mockGetFormBMappingsQuery,
  }
})

vi.mock('@/store/api/accountingApi', () => ({
  useGetAccountingSettingsQuery: mockGetAccountingSettingsQuery,
  useGetAccountsQuery: mockGetAccountsQuery,
  useGetFormBMappingsQuery: mockGetFormBMappingsQuery,
  useUpdateAccountingSettingsMutation: vi.fn().mockReturnValue([mockUpdateSettings, { isLoading: false }]),
  useUpdateFormBMappingMutation: vi.fn().mockReturnValue([vi.fn(() => ({ unwrap: () => Promise.resolve(undefined) })), { isLoading: false }]),
  useBulkUpdateFormBMappingsMutation: vi.fn().mockReturnValue([mockBulkUpdate, { isLoading: false }]),
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

function renderPage(opts: any = 'admin') {
  // normalize opts
  let isAdmin = true
  let role = 'admin'
  let formBMappings: any = undefined
  let settingsOverride: any = undefined
  if (typeof opts === 'string') {
    role = opts
    isAdmin = opts === 'admin'
  } else if (opts && typeof opts === 'object') {
    if ('isAdmin' in opts) {
      isAdmin = opts.isAdmin
      role = isAdmin ? 'admin' : 'manager'
    } else if ('role' in opts) {
      role = opts.role
      isAdmin = role === 'admin'
    }
    if ('formBMappings' in opts) formBMappings = opts.formBMappings
    if ('formMappings' in opts) formBMappings = opts.formMappings
    if ('formBRows' in opts) formBMappings = opts.formBRows
    if ('settings' in opts) settingsOverride = opts.settings
  }

  // apply mocks for this render
  if (formBMappings !== undefined) {
    mockGetFormBMappingsQuery.mockReturnValue({ data: formBMappings, isLoading: false, isError: false } as any)
  }
  if (settingsOverride !== undefined) {
    mockGetAccountingSettingsQuery.mockReturnValue({ data: settingsOverride, isLoading: false, error: undefined } as any)
  }

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

beforeEach(() => {
  mockUpdateSettings.mockClear()
  mockBulkUpdate.mockClear()
  mockShowSuccess.mockClear()
  mockShowError.mockClear()
  mockDispatch.mockClear()
  mockUpdateQueryData.mockClear()
  // reset default mocks
  mockGetAccountingSettingsQuery.mockReturnValue({ data: mockSettings, isLoading: false, error: undefined } as any)
  mockGetFormBMappingsQuery.mockReturnValue({ data: mockFormBMappings, isLoading: false, isError: false } as any)
  mockGetAccountsQuery.mockReturnValue({ data: mockAccounts, isLoading: false, error: undefined } as any)
  // default bulk resolves to empty array (no change)
  mockBulkUpdate.mockReturnValue({ unwrap: () => Promise.resolve([] as any[]) } as any)
})

describe('AccountingSettingsPage', () => {
  it('renders every account dropdown at the compact field size (#1100)', () => {
    renderPage()

    // Structural only: MUI puts MuiInputBase-sizeSmall on the InputBase root
    // for size="small" and omits it for the medium default. Pixel height is not
    // assertable in jsdom (no layout engine) — verified in a browser instead.
    const roots = document.querySelectorAll('.MuiInputBase-root')
    expect(roots.length).toBeGreaterThan(0)
    roots.forEach((root) => {
      expect(root.classList.contains('MuiInputBase-sizeSmall')).toBe(true)
    })
  })

  it('renders 6 section cards', () => {
    renderPage()
    expect(screen.getByText('Payment')).toBeInTheDocument()
    expect(screen.getByText('Sales')).toBeInTheDocument()
    expect(screen.getByText('Inventory & Purchasing')).toBeInTheDocument()
    // "System" was a leftover bucket (3 Equity + 1 Expense) named after no
    // concept its fields shared. Split by actual consumer (#1177).
    expect(screen.getByText('Expenses')).toBeInTheDocument()
    expect(screen.getByText('Owner Equity')).toBeInTheDocument()
    expect(screen.getByText('Setup')).toBeInTheDocument()
    expect(screen.queryByText('System')).not.toBeInTheDocument()
  })

  // Regrouping must not silently drop a field: all 11 still render and save.
  it('groups each account field under its consuming workflow', async () => {
    renderPage()
    const user = userEvent.setup()
    /*
     * The six groups are band ROWS inside one table now, not six cards, so
     * `.closest('.MuiPaper-root')` would return the same card for every group
     * and make the exclusion assertions below vacuous.
     *
     * Scope by document position instead: a field belongs to the group whose
     * band precedes it and whose next band follows it.
     */
    const BANDS = [
      'Payment', 'Sales', 'Inventory & Purchasing',
      'Expenses', 'Owner Equity', 'Setup',
    ]
    const fieldsUnder = (group: string): string[] => {
      const rows = Array.from(document.querySelectorAll('tbody tr'))
      const start = rows.findIndex((r) => r.textContent?.trim().startsWith(group))
      expect(start).toBeGreaterThanOrEqual(0)
      const out: string[] = []
      for (const row of rows.slice(start + 1)) {
        const text = row.textContent?.trim() ?? ''
        if (BANDS.some((b) => text.startsWith(b))) break
        const control = row.querySelector('[aria-label]')
        if (control) out.push(control.getAttribute('aria-label') ?? '')
      }
      return out
    }

    // Both Expense-type accounts live together: the COGS/Default split is what
    // the Form B mapping exclusion turns on.
    expect(fieldsUnder('Expenses')).toEqual(['COGS Account', 'Default Expense Account'])
    /*
     * ...and Inventory keeps only its asset accounts. Both Expense fields are
     * named explicitly: a /Expense/i regex looks like it covers this but is
     * vacuous, because the COGS field's label is "COGS Account" and contains no
     * such word — it passes with COGS still sitting in Inventory.
     */
    expect(fieldsUnder('Inventory & Purchasing'))
      .toEqual(['Inventory Account', 'Supplier Deposit Account'])
    expect(fieldsUnder('Owner Equity'))
      .toEqual(['Owner Capital Account', 'Owner Drawings Account'])
    expect(fieldsUnder('Setup')).toEqual(['Opening Balance Equity Account'])
    // Make dirty to enable Save
    await user.click(screen.getByLabelText('Cash Account'))
    await user.click(screen.getByRole('option', { name: /1200 - Checking Account/i }))
    await user.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalled())
    expect(Object.keys(mockUpdateSettings.mock.calls[0][0])).toHaveLength(11)
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

    await user.click(screen.getByLabelText('Cash Account'))
    await user.click(screen.getByRole('option', { name: /1200 - Checking Account/i }))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith({
        cashAccountId: 'bank-1',
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
        expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument()
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
      // Make dirty to enable Save
      await user.click(screen.getByLabelText('Cash Account'))
      await user.click(screen.getByRole('option', { name: /1200 - Checking Account/i }))
      await user.click(screen.getByRole('button', { name: /save changes/i }))
      expect(await screen.findByText(/Owner capital account is required/)).toBeInTheDocument()
    } finally {
      mockFn.mockReturnValue({ data: mockSettings, isLoading: false, error: undefined } as any)
    }
  })
})

describe('AccountingSettingsPage — page structure (#1177)', () => {
  it('separates default-account posting config from Form B mapping', () => {
    renderPage()
    // Two named groups. A Form B mapping must never read as ordinary posting
    // configuration: they answer different questions and carry different risk.
    // Each group is now ONE card whose PageSection title carries the group
    // name, so these were previously a separate h6 heading plus a differently
    // worded card title ("Form B Account Mapping"). One name each, no
    // duplication — the separation being asserted is unchanged.
    expect(screen.getByText('Default Accounts')).toBeInTheDocument()
    expect(screen.getByText('Form B Tax Filing')).toBeInTheDocument()
  })

  it('keeps the four posting sections inside the Default Accounts group', () => {
    renderPage()
    const heading = screen.getByText('Default Accounts')
    const formB = screen.getByText('Form B Tax Filing')
    // Document order: the posting sections sit between the two headings.
    expect(heading.compareDocumentPosition(formB) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    ;['Payment', 'Sales', 'Inventory & Purchasing', 'Expenses', 'Owner Equity', 'Setup'].forEach((label) => {
      const section = screen.getByText(label)
      expect(heading.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(formB.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
    })
  })

  it('renders the header and a subtitle naming both halves', () => {
    renderPage()
    expect(screen.getByText('Accounting Settings')).toBeInTheDocument()
    expect(screen.getByText(/default accounts.*Form B/i)).toBeInTheDocument()
  })
})

describe('AccountingSettingsPage — Default Accounts as tables', () => {
  it('renders each category as a table with Setting, Account Type and Account columns', async () => {
    renderPage({ isAdmin: true })

    const payment = await screen.findByText('Payment')
    const card = payment.closest('.MuiPaper-root') as HTMLElement
    expect(within(card).getByText('Setting')).toBeInTheDocument()
    expect(within(card).getByText('Account Type')).toBeInTheDocument()
    expect(within(card).getByText('Account')).toBeInTheDocument()
  })

  it('shows each field label as a row and its account type as a column value', async () => {
    renderPage({ isAdmin: true })

    const row = (await screen.findByText('Cash Account')).closest('tr') as HTMLElement
    expect(within(row).getByText('Asset')).toBeInTheDocument()
  })

  it('keeps all six categories', async () => {
    renderPage({ isAdmin: true })
    for (const label of [
      'Payment', 'Sales', 'Inventory & Purchasing', 'Expenses', 'Owner Equity', 'Setup',
    ]) {
      expect(await screen.findByText(label)).toBeInTheDocument()
    }
  })
})

describe('AccountingSettingsPage — page-level save', () => {
  it('renders one action bar for an admin and none for a non-admin', async () => {
    const { unmount } = renderPage({ isAdmin: true })
    expect(await screen.findByTestId('settings-action-bar')).toBeInTheDocument()
    unmount()

    renderPage({ isAdmin: false })
    await screen.findByText('Default Accounts')
    expect(screen.queryByTestId('settings-action-bar')).not.toBeInTheDocument()
  })

  /*
   * jsdom has no layout engine, so it cannot verify that the header stays put
   * or that there is one scrollbar. What it CAN pin is the DOM relationship
   * those properties depend on: one scroll pane, with the header and action
   * bar as siblings OUTSIDE it. Move either inside and it scrolls away — the
   * regression this asserts against. The browser gate covers the rest.
   */
  it('keeps the header and action bar outside the single scroll pane', async () => {
    renderPage({ isAdmin: true })

    const pane = await screen.findByTestId('accounting-settings-scroll-pane')
    const bar = screen.getByTestId('settings-action-bar')
    const heading = screen.getByRole('heading', { name: /accounting settings/i })

    expect(pane).not.toContainElement(bar)
    expect(pane).not.toContainElement(heading)
    // Both are siblings of the pane within the page's flex column.
    expect(bar.parentElement).toBe(pane.parentElement)
    expect(pane).toContainElement(screen.getByText('Form B Tax Filing'))
  })

  /*
   * #1184: the action row is the ONLY dirty-state signal. No footer notice, no
   * row highlight, no `Pending: …` caption, no "Changed" chip.
   *
   * The removed row background is an Emotion style and unobservable in jsdom
   * (CLAUDE.md), so this pins the text and testids that carried the treatment;
   * the browser gate covers the styling itself.
   */
  it('reports a staged edit through the action controls alone', async () => {
    const user = userEvent.setup()
    renderPage({ isAdmin: true, formBMappings: formBRows })

    const bar = await screen.findByTestId('settings-action-bar')
    expect(bar).not.toHaveTextContent(/unsaved changes/i)

    await user.click(within(screen.getByTestId('formb-map-select-a1')).getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: /N16 — Salaries/i }))

    // The staged value is visible on the control itself...
    expect(screen.getByTestId('formb-map-select-a1')).toHaveTextContent(/N16 — Salaries/)
    // ...and the draft is reported by enablement, nothing else.
    expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled()
    expect(bar).not.toHaveTextContent(/unsaved changes/i)
    expect(screen.queryByTestId('formb-map-changed-a1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('formb-map-pending-a1')).not.toBeInTheDocument()
    expect(screen.queryByText(/^Pending:/)).not.toBeInTheDocument()
  })

  it('disables Save Changes until something is dirty', async () => {
    renderPage({ isAdmin: true })
    expect(await screen.findByRole('button', { name: /save changes/i })).toBeDisabled()
  })

  it('sends only the modified mappings', async () => {
    const user = userEvent.setup()
    renderPage({ isAdmin: true, formBMappings: formBRows })

    await user.click(within(screen.getByTestId('formb-map-select-a1')).getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: /N16 — Salaries/i }))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(mockBulkUpdate).toHaveBeenCalledWith({
      mappings: [{ accountId: 'a1', category: 'SALARIES_AND_WAGES' }],
    }))
    // Default Accounts was untouched, so its endpoint must not be called.
    expect(mockUpdateSettings).not.toHaveBeenCalled()
  })

  it('clears dirty state and reports success when every request succeeds', async () => {
    const user = userEvent.setup()
    renderPage({ isAdmin: true, formBMappings: formBRows })

    await user.click(within(screen.getByTestId('formb-map-select-a1')).getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: /N16 — Salaries/i }))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalled())
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled())
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled()
  })

  it('saves mappings before settings, never concurrently', async () => {
    const user = userEvent.setup()
    const order: string[] = []

    /*
     * The mappings save is held open until released. Under a sequential run
     * nothing else can start meanwhile; under Promise.allSettled the settings
     * request fires immediately and 'settings:start' lands before
     * 'mappings:end'.
     *
     * A test that merely resolved both immediately would pass either way —
     * handleSubmit defers by a tick, so settings loses the race incidentally
     * even when launched concurrently. Verified by reverting to allSettled.
     */
    let releaseMappings: (rows: any) => void = () => {}
    mockBulkUpdate.mockImplementationOnce(() => ({
      unwrap: () => {
        order.push('mappings:start')
        return new Promise((res) => { releaseMappings = res }).then((r) => {
          order.push('mappings:end')
          return r
        })
      },
    }) as any)
    mockUpdateSettings.mockImplementationOnce(() => ({
      unwrap: () => {
        order.push('settings:start')
        return Promise.resolve({}).then((r) => {
          order.push('settings:end')
          return r
        })
      },
    }) as any)

    renderPage({ isAdmin: true, formBMappings: formBRows })

    // Dirty BOTH sections.
    await user.click(screen.getByLabelText('Cash Account'))
    await user.click(await screen.findByRole('option', { name: /1200 - Checking Account/i }))
    await user.click(within(screen.getByTestId('formb-map-select-a1')).getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: /N16 — Salaries/i }))

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(order).toContain('mappings:start'))
    // Give a concurrent implementation every chance to start the settings
    // request while the mappings one is still in flight.
    await new Promise((r) => setTimeout(r, 50))
    expect(order).toEqual(['mappings:start'])

    releaseMappings(formBRows)
    await waitFor(() => expect(order).toContain('settings:end'))

    /*
     * Strictly sequential, mappings first. Run concurrently, the two
     * validations each read the other's pre-change state — a mapping checks
     * the CURRENT COGS/Sales roots, a settings save checks whether its NEW
     * roots capture an already-mapped account — so both can pass and both
     * commit, landing a mapped account inside an excluded subtree.
     */
    expect(order).toEqual([
      'mappings:start', 'mappings:end', 'settings:start', 'settings:end',
    ])
  })

  it('still saves settings when the mappings save fails', async () => {
    const user = userEvent.setup()
    mockBulkUpdate.mockReturnValueOnce({
      unwrap: () => Promise.reject({ data: 'mapping rejected' }),
    } as any)

    renderPage({ isAdmin: true, formBMappings: formBRows })

    await user.click(screen.getByLabelText('Cash Account'))
    await user.click(await screen.findByRole('option', { name: /1200 - Checking Account/i }))
    await user.click(within(screen.getByTestId('formb-map-select-a1')).getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: /N16 — Salaries/i }))

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    // Ordering is for validation coherence, not short-circuiting: a rejected
    // first job must not silently swallow the user's other edit.
    await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(mockShowError).toHaveBeenCalled())
    expect(mockShowSuccess).not.toHaveBeenCalled()
    // The failed section keeps its draft for retry — readable only from the
    // action controls now that per-row dirty decoration is gone (#1184).
    expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled()
    expect(screen.getByTestId('formb-map-select-a1')).toHaveTextContent(/N16 — Salaries/)
  })

  it('writes the server response into the cache before clearing the draft', async () => {
    const user = userEvent.setup()

    /*
     * The ordering is observed from the two CALLS, not from rendered output.
     * Both happen inside one React commit, so any assertion made after an
     * `await waitFor` sees the same DOM whichever order they ran in — a test
     * written that way passes with the statements swapped, which was verified
     * by swapping them.
     */
    const order: string[] = []
    const realUseDraft = draftModule.useFormBMappingDraft
    const draftSpy = vi.spyOn(draftModule, 'useFormBMappingDraft').mockImplementation(() => {
      const value = realUseDraft()
      return { ...value, reset: () => { order.push('draft-reset'); value.reset() } }
    })

    const saved = [{ ...formBRows[0], category: 'SALARIES_AND_WAGES' }]
    mockUpdateQueryData.mockImplementation((...args: any[]) => {
      order.push('cache-write')
      // The recipe returns a replacement array rather than mutating the draft.
      // Resolving it here catches a recipe that silently no-ops, which would
      // ship as a stale-row bug rather than a failure.
      expect(args[2]([])).toEqual(saved)
      return { type: 'noop' }
    })
    mockBulkUpdate.mockReturnValueOnce({ unwrap: () => Promise.resolve(saved) } as any)

    /*
     * Restored in `finally`, matching the rollback e2e's discipline. This spy
     * replaces a MODULE export every page render calls, so a failed assertion
     * that escaped before mockRestore() would corrupt every later test in the
     * file, not just this one.
     */
    try {
      renderPage({ isAdmin: true, formBMappings: formBRows })

      await user.click(within(screen.getByTestId('formb-map-select-a1')).getByRole('combobox'))
      await user.click(await screen.findByRole('option', { name: /N16 — Salaries/i }))
      await user.click(screen.getByRole('button', { name: /save changes/i }))

      await waitFor(() => expect(order).toContain('draft-reset'))
      expect(mockUpdateQueryData.mock.calls[0][0]).toBe('getFormBMappings')
      // Clearing the draft first would leave an empty overlay sitting over
      // stale rows until an async refetch caught up — or indefinitely if it
      // failed.
      expect(order).toEqual(['cache-write', 'draft-reset'])
    } finally {
      draftSpy.mockRestore()
    }
  })

  it('keeps the draft and reports the failure when the save is rejected', async () => {
    const user = userEvent.setup()
    mockBulkUpdate.mockReturnValueOnce({
      unwrap: () => Promise.reject({ data: 'Account 5150 cannot be mapped' }),
    } as any)
    renderPage({ isAdmin: true, formBMappings: formBRows })

    await user.click(within(screen.getByTestId('formb-map-select-a1')).getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: /N16 — Salaries/i }))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(mockShowError).toHaveBeenCalled())
    expect(mockShowSuccess).not.toHaveBeenCalled()
    // The draft survives for retry: the Select still shows the staged value and
    // Save stays available. No row decoration reports it (#1184).
    expect(screen.getByTestId('formb-map-select-a1')).toHaveTextContent(/N16 — Salaries/)
    expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled()
  })

  it('clears only the section that succeeded on a mixed result', async () => {
    const user = userEvent.setup()
    mockBulkUpdate.mockReturnValueOnce({
      unwrap: () => Promise.reject({ data: 'mapping rejected' }),
    } as any)
    renderPage({ isAdmin: true, formBMappings: formBRows })

    // Dirty BOTH sections.
    await user.click(screen.getByLabelText('Cash Account'))
    await user.click(await screen.findByRole('option', { name: /1200 - Checking Account/i }))
    await user.click(within(screen.getByTestId('formb-map-select-a1')).getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: /N16 — Salaries/i }))

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalledTimes(1))
    // Form B stays dirty for retry; Default Accounts does not.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled())
    expect(screen.getByTestId('formb-map-select-a1')).toHaveTextContent(/N16 — Salaries/)

    mockUpdateSettings.mockClear()
    await user.click(screen.getByRole('button', { name: /save changes/i }))
    // Retry sends ONLY the failed section.
    await waitFor(() => expect(mockBulkUpdate).toHaveBeenCalledTimes(2))
    expect(mockUpdateSettings).not.toHaveBeenCalled()
  })

  it('treats a validation failure as a rejection, not a silent success', async () => {
    const user = userEvent.setup()
    renderPage({ isAdmin: true, settings: { ...mockSettings, cashAccountId: '' } })

    await user.click(screen.getByLabelText('Bank Account'))
    await user.click(await screen.findByRole('option', { name: /1100 - Cash on Hand/i }))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(mockShowError).toHaveBeenCalled())
    expect(mockShowSuccess).not.toHaveBeenCalled()
  })

  it('restores both sections on Cancel', async () => {
    const user = userEvent.setup()
    renderPage({ isAdmin: true, formBMappings: formBRows })

    await user.click(within(screen.getByTestId('formb-map-select-a1')).getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: /N16 — Salaries/i }))
    expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: /cancel/i }))

    // Cancel restores the persisted value and clears the draft.
    expect(screen.getByTestId('formb-map-select-a1')).not.toHaveTextContent(/N16 — Salaries/)
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled()
  })

  it('disables the editable controls in both sections while saving', async () => {
    const user = userEvent.setup()
    let release: (v: unknown) => void = () => {}
    mockBulkUpdate.mockReturnValueOnce({
      unwrap: () => new Promise((res) => { release = res as any }),
    } as any)
    renderPage({ isAdmin: true, formBMappings: formBRows })

    await user.click(within(screen.getByTestId('formb-map-select-a1')).getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: /N16 — Salaries/i }))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    // Not just the buttons: an edit made mid-flight would be erased by the
    // success reset, which applies the snapshot taken at submit time.
    await waitFor(() =>
      expect(within(screen.getByTestId('formb-map-select-a1')).getByRole('combobox')).toHaveAttribute('aria-disabled', 'true'))
    expect(screen.getByLabelText('Cash Account')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled()

    release(formBRows as any)
  })
})
