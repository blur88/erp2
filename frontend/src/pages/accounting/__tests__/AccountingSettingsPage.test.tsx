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
    ],
    meta: { total: 9 },
  },
  mockSettings: {
    id: true,
    cashAccountId: 'cash-1',
    bankAccountId: 'bank-1',
    inventoryAccountId: 'inv-1',
    supplierDepositAccountId: 'supp-dep-1',
    customerDepositAccountId: 'cust-dep-1',
    openingBalanceEquityAccountId: 'obe-1',
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
    mockFn.mockReturnValue({ data: undefined, isLoading: true, error: undefined } as any)

    const { container } = renderPage()

    expect(screen.getByText('Accounting Settings')).toBeInTheDocument()
    expect(container.querySelectorAll('.MuiSkeleton-root').length).toBeGreaterThan(0)

    mockFn.mockReturnValue({ data: mockSettings, isLoading: false, error: undefined } as any)
  })

  it('Save calls update mutation with all 9 ids', async () => {
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
        salesRevenueAccountId: 'sales-rev-1',
        cogsAccountId: 'cogs-1',
        defaultExpenseAccountId: 'expense-1',
      })
    })
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
    },
  )
})
