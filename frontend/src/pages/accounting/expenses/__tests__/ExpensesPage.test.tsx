import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockExpenses } = vi.hoisted(() => ({
  mockExpenses: [
    {
      id: 'exp-1',
      expenseNumber: 'EXP-001',
      expenseDate: '2026-07-01',
      payee: 'Vendor A',
      description: 'Office supplies',
      expenseAccountId: 'acct-1',
      expenseAccount: { id: 'acct-1', code: '5010', name: 'Office Expenses' },
      totalAmount: '1000.0000',
      paidAmount: '0.0000',
      balance: '1000.0000',
      documentStatus: 'DRAFT' as const,
      paymentStatus: 'UNPAID' as const,
      notes: null,
      createdAt: '2026-07-01T00:00:00Z',
      updatedAt: '2026-07-01T00:00:00Z',
      payments: [],
    },
    {
      id: 'exp-2',
      expenseNumber: 'EXP-002',
      expenseDate: '2026-07-02',
      payee: 'Vendor B',
      description: 'Consulting fees',
      expenseAccountId: 'acct-2',
      expenseAccount: { id: 'acct-2', code: '5020', name: 'Consulting' },
      totalAmount: '500.0000',
      paidAmount: '500.0000',
      balance: '0.0000',
      documentStatus: 'COMPLETED' as const,
      paymentStatus: 'PAID' as const,
      notes: null,
      createdAt: '2026-07-02T00:00:00Z',
      updatedAt: '2026-07-02T00:00:00Z',
      payments: [],
    },
  ],
}))

vi.mock('@/store/api/accountingApi', () => ({
  useGetExpensesQuery: vi.fn().mockReturnValue({
    data: { data: mockExpenses, meta: { total: 2, page: 1, limit: 25 } },
    isFetching: false,
    error: undefined,
  }),
  useGetAccountTreeQuery: vi.fn().mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    isFetching: false,
    error: undefined,
  }),
  useGetAccountingSettingsQuery: vi.fn().mockReturnValue({
    data: {
      id: true,
      cashAccountId: 'acct-cash',
      bankAccountId: 'acct-bank',
      inventoryAccountId: 'acct-inv',
      supplierDepositAccountId: 'acct-sdep',
      customerDepositAccountId: 'acct-cdep',
      openingBalanceEquityAccountId: 'acct-obe',
      salesRevenueAccountId: 'acct-rev',
      cogsAccountId: 'acct-cogs',
      defaultExpenseAccountId: 'acct-office',
    },
    isLoading: false,
    isError: false,
    isFetching: false,
    error: undefined,
  }),
  useGetExpenseQuery: vi.fn().mockReturnValue({ data: undefined, isFetching: false }),
  useCreateExpenseMutation: vi.fn().mockReturnValue([vi.fn(), { isLoading: false }]),
  useUpdateExpenseMutation: vi.fn().mockReturnValue([vi.fn(), { isLoading: false }]),
  useCancelExpenseMutation: vi.fn().mockReturnValue([vi.fn(), { isLoading: false }]),
  useUncancelExpenseMutation: vi.fn().mockReturnValue([vi.fn(), { isLoading: false }]),
  usePayExpenseMutation: vi.fn().mockReturnValue([vi.fn(), { isLoading: false }]),
  useRefundExpenseMutation: vi.fn().mockReturnValue([vi.fn(), { isLoading: false }]),
}))

vi.mock('@/store/api/paymentMethodsApi', () => ({
  useGetActivePaymentMethodsForPurchasesQuery: () => ({ data: [] }),
}))

const { mockNavigate, mockLocation } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockLocation: {
    current: {
      pathname: '/accounting/expenses',
      search: '',
      hash: '',
      key: 'test',
      state: null as Record<string, unknown> | null,
    },
  },
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => mockLocation.current,
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  }
})

const { mockShowSuccess, mockShowError } = vi.hoisted(() => ({
  mockShowSuccess: vi.fn(),
  mockShowError: vi.fn(),
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}))

import { alpha } from '@mui/material'
import { useGetExpensesQuery, useGetExpenseQuery, useGetAccountTreeQuery, useGetAccountingSettingsQuery } from '@/store/api/accountingApi'
import { darkTheme } from '@/styles/theme'
import ExpensesPage from '../ExpensesPage'

function renderPage() {
  const store = configureStore({ reducer: { empty: (s = null) => s } })
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/accounting/expenses']}>
        <ExpensesPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('ExpensesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLocation.current = {
      pathname: '/accounting/expenses',
      search: '',
      hash: '',
      key: 'test',
      state: null,
    }
  })

  afterEach(() => {
    vi.mocked(useGetExpensesQuery).mockReturnValue({
      data: { data: mockExpenses, meta: { total: 2, page: 1, limit: 25 } },
      isFetching: false,
      error: undefined,
    } as any)
  })

  it('renders expense numbers from mocked data', () => {
    renderPage()
    expect(screen.getByText('EXP-001')).toBeInTheDocument()
    expect(screen.getByText('EXP-002')).toBeInTheDocument()
  })

  it('renders expense descriptions', () => {
    renderPage()
    expect(screen.getByText('Office supplies')).toBeInTheDocument()
    expect(screen.getByText('Consulting fees')).toBeInTheDocument()
  })

  it('shows StatusChip for payment status', () => {
    renderPage()
    expect(screen.getByText('Unpaid')).toBeInTheDocument()
    expect(screen.getAllByText('Paid').length).toBeGreaterThanOrEqual(1)
  })

  it('renders the Completed document status on a settled row', async () => {
    renderPage()
    expect(await screen.findByText('Completed')).toBeInTheDocument()
  })

  it('offers Completed in the document status filter', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByLabelText('Status'))
    expect(await screen.findByRole('option', { name: 'Completed' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Draft' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Cancelled' })).toBeInTheDocument()
  })

  it('shows empty state when no expenses', () => {
    vi.mocked(useGetExpensesQuery).mockReturnValueOnce({
      data: { data: [], meta: { total: 0, page: 1, limit: 25 } },
      isFetching: false,
      error: undefined,
    } as any)
    renderPage()
    expect(screen.getByText(/No expenses found/i)).toBeInTheDocument()
  })

  it('shows New Expense button', () => {
    renderPage()
    expect(screen.getByText('+ New Expense')).toBeInTheDocument()
  })

  it('renders concise filter labels in the page toolbar', () => {
    renderPage()
    const filters = within(screen.getByTestId('page-header-toolbar'))

    expect(filters.getByRole('combobox', { name: 'Account' })).toBeInTheDocument()
    expect(filters.getByRole('combobox', { name: 'Payment' })).toBeInTheDocument()
    expect(filters.getByRole('combobox', { name: 'Status' })).toBeInTheDocument()
  })

  it('opens Edit with explicit list-origin state', async () => {
    const user = userEvent.setup()
    renderPage()

    const menuButtons = screen.getAllByRole('button', { name: /row actions/i })
    await user.click(menuButtons[0])
    await user.click(await screen.findByRole('menuitem', { name: /^edit$/i }))

    expect(mockNavigate).toHaveBeenCalledWith('/accounting/expenses/exp-1/edit', {
      state: { expenseEditOrigin: 'list' },
    })
  })

  it('offers View and Uncancel on a cancelled row', async () => {
    const user = userEvent.setup()
    // mockReturnValueOnce is required here: vi.clearAllMocks() does not reset
    // implementations set on this module-factory mock, so a persistent
    // mockReturnValue leaks the cancelled fixture into every later test.
    vi.mocked(useGetExpensesQuery).mockReturnValueOnce({
      data: {
        data: [
          {
            id: 'exp-1',
            expenseNumber: 'EXP-001',
            expenseDate: '2026-07-15',
            description: 'Cancelled expense',
            payee: 'Vendor A',
            totalAmount: '1000.0000',
            paidAmount: '0.0000',
            balance: '1000.0000',
            documentStatus: 'CANCELLED',
            paymentStatus: 'UNPAID',
          },
        ],
        meta: { total: 1, page: 1, limit: 25 },
      },
      isFetching: false,
      error: undefined,
    } as any)
    renderPage()

    const menuButtons = screen.getAllByRole('button', { name: /row actions/i })
    await user.click(menuButtons[0])

    expect(await screen.findByRole('menuitem', { name: /^view$/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /^uncancel$/i })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /^pay$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /^cancel$/i })).not.toBeInTheDocument()
  })

  it('highlights the expense named by incoming location state', async () => {
    mockLocation.current = {
      pathname: '/accounting/expenses',
      search: '',
      hash: '',
      key: 'test',
      state: { highlightExpenseId: 'exp-2' },
    }
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('EXP-002').closest('tr')).toHaveStyle({
        backgroundColor: alpha(darkTheme.palette.primary.main, 0.2),
      })
    })
  })

  it('clears the highlight state while preserving the query string', async () => {
    mockLocation.current = {
      pathname: '/accounting/expenses',
      search: '?tab=open',
      hash: '',
      key: 'test',
      state: { highlightExpenseId: 'exp-2' },
    }
    renderPage()

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/accounting/expenses?tab=open', {
        replace: true,
        state: null,
      })
    })
  })

  it('does not clear history state when no highlight arrives', () => {
    renderPage()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  function lastQueryParams() {
    const calls = vi.mocked(useGetExpensesQuery).mock.calls
    return calls[calls.length - 1][0] as Record<string, unknown>
  }

  it('requests expense number descending by default', () => {
    renderPage()
    expect(lastQueryParams()).toMatchObject({
      sortBy: 'expenseNumber',
      sortOrder: 'DESC',
    })
  })

  // Must start from page 2, or the page assertion passes with setPage(1)
  // deleted. The default mock reports total: 2, which renders no second page —
  // raise the total so PagePagination offers one.
  it('toggles the direction and returns to the first page when Sort is clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(useGetExpensesQuery).mockReturnValue({
      data: { data: mockExpenses, meta: { total: 60, page: 1, limit: 25 } },
      isFetching: false,
      error: undefined,
    } as any)
    renderPage()

    await user.click(screen.getByRole('button', { name: /go to next page/i }))
    expect(lastQueryParams()).toMatchObject({ page: 2 })

    await user.click(screen.getByRole('button', { name: /^sort$/i }))
    expect(lastQueryParams()).toMatchObject({
      sortBy: 'expenseNumber',
      sortOrder: 'ASC',
      page: 1,
    })

    // Click again to prove the handler toggles rather than assigning: a
    // setSortOrder('asc') mutation survives a single-click assertion.
    await user.click(screen.getByRole('button', { name: /^sort$/i }))
    expect(lastQueryParams()).toMatchObject({
      sortBy: 'expenseNumber',
      sortOrder: 'DESC',
      page: 1,
    })
  })

  it('renders no Sort by field-picker in the filter section', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(
      screen.queryByRole('combobox', { name: 'Sort by' }),
    ).not.toBeInTheDocument()

    // The fixed-field Sort button is still the sort affordance.
    await user.click(screen.getByRole('button', { name: /^sort$/i }))
    expect(lastQueryParams()).toMatchObject({ sortBy: 'expenseNumber' })
  })

  describe('Account filter eligibility (#1016)', () => {
    const SETTINGS = {
      id: true,
      cashAccountId: 'acct-cash',
      bankAccountId: 'acct-bank',
      inventoryAccountId: 'acct-inv',
      supplierDepositAccountId: 'acct-sdep',
      customerDepositAccountId: 'acct-cdep',
      openingBalanceEquityAccountId: 'acct-obe',
      salesRevenueAccountId: 'acct-rev',
      cogsAccountId: 'acct-cogs',
      defaultExpenseAccountId: 'acct-office',
    }

    // 5000 Operating Expenses (parent) → 5010 Office, 5100 COGS; plus 6990 Other
    const TREE = [
      {
        id: 'acct-parent',
        code: '5000',
        name: 'Operating Expenses',
        isPostable: false,
        children: [
          { id: 'acct-office', code: '5010', name: 'Office Expenses', isPostable: true, children: [] },
          { id: 'acct-cogs', code: '5100', name: 'Cost of Goods Sold', isPostable: true, children: [] },
        ],
      },
      { id: 'acct-other', code: '6990', name: 'Other Expenses', isPostable: true, children: [] },
    ]

    const settled = <T,>(data: T) => ({
      data,
      isLoading: false,
      isError: false,
      isFetching: false,
      error: undefined,
    })

    beforeEach(() => {
      vi.mocked(useGetAccountTreeQuery).mockReturnValue(settled(TREE) as any)
      vi.mocked(useGetAccountingSettingsQuery).mockReturnValue(settled(SETTINGS) as any)
    })

    it('omits the configured COGS account and keeps other expense accounts', async () => {
      const user = userEvent.setup()
      renderPage()

      await user.click(screen.getByRole('combobox', { name: 'Account' }))

      const listbox = await screen.findByRole('listbox')
      expect(within(listbox).getByRole('option', { name: 'All accounts' })).toBeInTheDocument()
      expect(within(listbox).getByRole('option', { name: '5010 Office Expenses' })).toBeInTheDocument()
      expect(within(listbox).getByRole('option', { name: '6990 Other Expenses' })).toBeInTheDocument()
      expect(within(listbox).queryByRole('option', { name: '5100 Cost of Goods Sold' })).toBeNull()
      // The non-postable parent is a container, never selectable.
      expect(within(listbox).queryByRole('option', { name: '5000 Operating Expenses' })).toBeNull()
    })

    it.each([
      ['the account tree is loading', () => {
        vi.mocked(useGetAccountTreeQuery).mockReturnValue({
          data: undefined, isLoading: true, isError: false, isFetching: true, error: undefined,
        } as any)
      }],
      ['settings are loading', () => {
        vi.mocked(useGetAccountingSettingsQuery).mockReturnValue({
          data: undefined, isLoading: true, isError: false, isFetching: true, error: undefined,
        } as any)
      }],
    ])('disables the Account control while %s', async (_label, primeMocks) => {
      primeMocks()
      renderPage()

      // Loading disables the control (optionsLoading): the user must not pick
      // against an empty list mid-fetch, so the listbox can never open.
      expect(screen.getByRole('combobox', { name: 'Account' })).toHaveAttribute(
        'aria-disabled',
        'true',
      )
    })

    it.each([
      ['the account tree errored', () => {
        vi.mocked(useGetAccountTreeQuery).mockReturnValue({
          data: undefined, isLoading: false, isError: true, isFetching: false, error: { status: 500 },
        } as any)
      }],
      ['settings errored', () => {
        vi.mocked(useGetAccountingSettingsQuery).mockReturnValue({
          data: undefined, isLoading: false, isError: true, isFetching: false, error: { status: 500 },
        } as any)
      }],
    ])('offers no account options while %s', async (_label, primeMocks) => {
      primeMocks()
      const user = userEvent.setup()
      renderPage()

      await user.click(screen.getByRole('combobox', { name: 'Account' }))

      const listbox = await screen.findByRole('listbox')
      // Only the "All accounts" empty entry — never a partially-filtered list.
      expect(within(listbox).getAllByRole('option')).toHaveLength(1)
      expect(within(listbox).getByRole('option', { name: 'All accounts' })).toBeInTheDocument()
    })

    // Documents parseFilters' behaviour, NOT the coercion effect — this passes with
    // that effect deleted. parseFilters (filterBar.url.ts:141-147) allow-lists URL
    // values against the option list present at mount and drops anything absent, so
    // the param never reaches applied state and the list loads unfiltered.
    //
    // Note this test's mocks are settled at mount, so options are populated and COGS
    // is rejected specifically for being ineligible. In production both queries are
    // still in flight on first render, options are [], and parseFilters therefore
    // drops EVERY account id — see the follow-up issue on preserving URL-backed
    // select values while async options load.
    //
    // The coercion effect covers the other case: ids that become ineligible AFTER
    // being validly applied. That is exercised by the transition test below.
    it('drops an unavailable URL account param at mount (owned by parseFilters)', async () => {
      mockLocation.current = {
        pathname: '/accounting/expenses',
        search: '?expenseAccountId=acct-cogs',
        hash: '',
        key: 'test',
        state: null,
      }

      renderPage()

      await waitFor(() => {
        const calls = vi.mocked(useGetExpensesQuery).mock.calls
        expect(calls[calls.length - 1][0]).not.toHaveProperty('expenseAccountId')
      })

      expect(screen.getByRole('combobox', { name: 'Account' })).toHaveTextContent('All accounts')
    })

    // The sibling above mounts with SETTLED mocks, so it never exercised an
    // unresolved option set — the actual defect in #1017. Here the tree is still
    // in flight at mount: the URL value must reach the query anyway, and only be
    // judged once the authoritative list lands.
    it('applies a URL account param that arrives before the account tree', async () => {
      mockLocation.current = {
        pathname: '/accounting/expenses',
        search: '?expenseAccountId=acct-office',
        hash: '',
        key: 'test',
        state: null,
      }

      vi.mocked(useGetAccountTreeQuery).mockReturnValue({
        data: undefined, isLoading: true, isError: false, isFetching: true, error: undefined,
      } as any)

      renderPage()

      await waitFor(() => {
        const calls = vi.mocked(useGetExpensesQuery).mock.calls
        expect(calls[calls.length - 1][0]).toMatchObject({ expenseAccountId: 'acct-office' })
      })
    })

    it('clears a URL account param once the tree resolves without it', async () => {
      mockLocation.current = {
        pathname: '/accounting/expenses',
        search: '?expenseAccountId=acct-gone',
        hash: '',
        key: 'test',
        state: null,
      }

      vi.mocked(useGetAccountTreeQuery).mockReturnValue({
        data: undefined, isLoading: true, isError: false, isFetching: true, error: undefined,
      } as any)

      const { rerender } = renderPage()

      // In flight: the unjudgeable value is applied rather than discarded.
      await waitFor(() => {
        const calls = vi.mocked(useGetExpensesQuery).mock.calls
        expect(calls[calls.length - 1][0]).toMatchObject({ expenseAccountId: 'acct-gone' })
      })

      // Tree lands and does not contain acct-gone — now it is judgeable, and stale.
      vi.mocked(useGetAccountTreeQuery).mockReturnValue(settled(TREE) as any)

      // Fresh JSX, not a stored element: React 19's RTL `rerender` no-ops when
      // handed the identical element reference. This matches the inline-JSX idiom
      // the sibling two-phase tests in this file already use.
      rerender(
        <Provider store={configureStore({ reducer: { empty: (s = null) => s } })}>
          <MemoryRouter initialEntries={['/accounting/expenses?expenseAccountId=acct-gone']}>
            <ExpensesPage />
          </MemoryRouter>
        </Provider>,
      )

      await waitFor(() => {
        const calls = vi.mocked(useGetExpensesQuery).mock.calls
        expect(calls[calls.length - 1][0]).not.toHaveProperty('expenseAccountId')
      })
    })

    // The applied filter must survive unresolved queries. parseFilters only
    // accepts values present in the option list, so the URL can never seed an
    // ineligible value — to reach the coercion's guard with the filter applied,
    // mount with an ELIGIBLE account (acct-office), let useFilterBar adopt the
    // param, and only then flip a query to loading/errored on the SAME mount.
    it.each([
      ['the account tree is loading', () => {
        vi.mocked(useGetAccountTreeQuery).mockReturnValue({
          data: undefined, isLoading: true, isError: false, isFetching: true, error: undefined,
        } as any)
      }],
      ['settings are loading', () => {
        vi.mocked(useGetAccountingSettingsQuery).mockReturnValue({
          data: undefined, isLoading: true, isError: false, isFetching: true, error: undefined,
        } as any)
      }],
      ['the account tree errored', () => {
        vi.mocked(useGetAccountTreeQuery).mockReturnValue({
          data: undefined, isLoading: false, isError: true, isFetching: false, error: { status: 500 },
        } as any)
      }],
      ['settings errored', () => {
        vi.mocked(useGetAccountingSettingsQuery).mockReturnValue({
          data: undefined, isLoading: false, isError: true, isFetching: false, error: { status: 500 },
        } as any)
      }],
    ])('keeps the applied account filter while %s', async (_label, primeMocks) => {
      mockLocation.current = {
        pathname: '/accounting/expenses',
        search: '?expenseAccountId=acct-office',
        hash: '',
        key: 'test',
        state: null,
      }

      const { rerender } = renderPage()

      // Phase 1: settled queries, acct-office is eligible, so parseFilters seeds
      // the applied filter and the query carries it.
      await waitFor(() => {
        const calls = vi.mocked(useGetExpensesQuery).mock.calls
        expect(calls[calls.length - 1][0]).toMatchObject({ expenseAccountId: 'acct-office' })
      })

      // Phase 2: flip a query on the SAME mount. The guard is `isReady`, not
      // `!isLoading`: an errored query also yields zero options, so clearing on
      // "not loading" would drop a filter we cannot yet judge.
      primeMocks()
      rerender(
        <Provider store={configureStore({ reducer: { empty: (s = null) => s } })}>
          <MemoryRouter initialEntries={['/accounting/expenses?expenseAccountId=acct-office']}>
            <ExpensesPage />
          </MemoryRouter>
        </Provider>,
      )

      await waitFor(() => {
        const calls = vi.mocked(useGetExpensesQuery).mock.calls
        expect(calls[calls.length - 1][0]).toMatchObject({ expenseAccountId: 'acct-office' })
      })
    })

    it('clears an applied filter once the account becomes the COGS account', async () => {
      mockLocation.current = {
        pathname: '/accounting/expenses',
        search: '?expenseAccountId=acct-office',
        hash: '',
        key: 'test',
        state: null,
      }

      const { rerender } = renderPage()

      await waitFor(() => {
        const calls = vi.mocked(useGetExpensesQuery).mock.calls
        expect(calls[calls.length - 1][0]).toMatchObject({ expenseAccountId: 'acct-office' })
      })

      // The settings flip mid-session: acct-office is now the COGS account, so it
      // leaves the eligible set. Driven on the SAME mount: a live component with
      // existing useFilterBar state must drop the filter once the queries resolve
      // with the new eligibility — remounting would only prove two independent
      // mounts behave, and would miss a broken transition entirely.
      //
      // React 19 + RTL: rerender(sameElementRef) no-ops, so pass a freshly created
      // JSX tree rather than reusing the element renderPage() built.
      vi.mocked(useGetAccountingSettingsQuery).mockReturnValue(
        settled({ ...SETTINGS, cogsAccountId: 'acct-office' }) as any,
      )
      rerender(
        <Provider store={configureStore({ reducer: { empty: (s = null) => s } })}>
          <MemoryRouter initialEntries={['/accounting/expenses?expenseAccountId=acct-office']}>
            <ExpensesPage />
          </MemoryRouter>
        </Provider>,
      )

      await waitFor(() => {
        const calls = vi.mocked(useGetExpensesQuery).mock.calls
        expect(calls[calls.length - 1][0]).not.toHaveProperty('expenseAccountId')
      })

      expect(screen.getByRole('combobox', { name: 'Account' })).toHaveTextContent('All accounts')
    })
  })

  // #1019: FilterPaymentStatus defaulted to lowercase values, but the Expenses
  // API validates @IsIn(['UNPAID','PARTIAL','PAID','OVERPAID']) — so a lowercase
  // value 400s and the list renders "Failed to load expenses". Driving the real
  // dropdown (FilterBar is not mocked in this file) is what exercises the case
  // conversion; a URL-param test carrying 'UNPAID' would pass even when broken.
  describe('Payment filter value case (#1019)', () => {
    it.each([
      ['Unpaid', 'UNPAID'],
      ['Partial', 'PARTIAL'],
      ['Paid', 'PAID'],
      ['Overpaid', 'OVERPAID'],
    ])('sends %s to the query as uppercase %s', async (optionLabel, expected) => {
      const user = userEvent.setup()
      renderPage()

      const toolbar = within(screen.getByTestId('page-header-toolbar'))
      await user.click(toolbar.getByRole('combobox', { name: 'Payment' }))
      await user.click(await screen.findByRole('option', { name: optionLabel }))

      await waitFor(() => {
        const calls = vi.mocked(useGetExpensesQuery).mock.calls
        expect(calls[calls.length - 1][0]).toMatchObject({ paymentStatus: expected })
      })
    })

    // The spec's config-shape assertion, adapted. The PO reference test
    // (PurchaseOrdersPage.filterbar.test.tsx:105) reads the config off a
    // FilterBar spy, but FilterBar is NOT mocked in this file and
    // getFilterConfig() is module-private (ExpensesPage.tsx:44) — so the config
    // object is not reachable here. Exporting an internal purely for a test
    // would be worse than asserting the rendered result.
    //
    // So this asserts the config's observable consequence: with valueCase
    // 'upper' the options carry uppercase values, which is what the config
    // exists to produce. Weaker than the emitted-query tests above on its own;
    // kept because it fails at the option level and localizes a regression.
    it('renders Payment options whose values are uppercase', async () => {
      const user = userEvent.setup()
      renderPage()

      const toolbar = within(screen.getByTestId('page-header-toolbar'))
      await user.click(toolbar.getByRole('combobox', { name: 'Payment' }))

      for (const label of ['Unpaid', 'Partial', 'Paid', 'Overpaid']) {
        expect(await screen.findByRole('option', { name: label })).toHaveAttribute(
          'data-value',
          label.toUpperCase(),
        )
      }
    })



    it('drops the payment param from the query when the filter is cleared', async () => {
      const user = userEvent.setup()
      renderPage()

      const toolbar = within(screen.getByTestId('page-header-toolbar'))
      await user.click(toolbar.getByRole('combobox', { name: 'Payment' }))
      await user.click(await screen.findByRole('option', { name: 'Paid' }))

      await waitFor(() => {
        const calls = vi.mocked(useGetExpensesQuery).mock.calls
        expect(calls[calls.length - 1][0]).toMatchObject({ paymentStatus: 'PAID' })
      })

      await user.click(toolbar.getByRole('combobox', { name: 'Payment' }))
      await user.click(await screen.findByRole('option', { name: 'All' }))

      await waitFor(() => {
        const calls = vi.mocked(useGetExpensesQuery).mock.calls
        expect(calls[calls.length - 1][0]).not.toHaveProperty('paymentStatus')
      })
    })
  })
})

describe('ExpensesPage - refund detail loading', () => {
  const refundDetail = {
    ...mockExpenses[1],
    payments: [
      {
        id: 'pay-1',
        expenseId: 'exp-2',
        paymentMethodId: 'pm-1',
        paymentDate: '2026-07-02',
        amount: '500.0000',
        reference: null,
        sourcePaymentId: null,
        paymentMethod: { id: 'pm-1', code: 'CASH', name: 'Cash' },
        remainingRefundable: '500.0000',
      },
    ],
  }

  async function openRefundOnSecondRow() {
    const user = userEvent.setup()
    renderPage()
    // exp-2 is DRAFT + PAID, so its row menu offers Refund.
    const menuButtons = screen.getAllByRole('button', { name: /row actions/i })
    await user.click(menuButtons[1])
    await user.click(await screen.findByRole('menuitem', { name: /refund/i }))
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockLocation.current = {
      pathname: '/accounting/expenses',
      search: '',
      hash: '',
      key: 'test',
      state: null,
    }
  })

  it('opens the refund dialog with sources once the detail record loads', async () => {
    vi.mocked(useGetExpenseQuery).mockReturnValue({
      currentData: refundDetail,
      isError: false,
    } as any)
    await openRefundOnSecondRow()
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeInTheDocument()
    // Sources actually populated from the detail record: the Cash payment is
    // preselected and its full amount is available for refund.
    expect(within(dialog).getByText('Cash')).toBeInTheDocument()
    expect(within(dialog).getAllByText(/500\.00/).length).toBeGreaterThanOrEqual(1)
    expect(mockShowError).not.toHaveBeenCalled()
  })

  it('does not open the refund dialog from another expense\'s cached detail', async () => {
    vi.mocked(useGetExpenseQuery).mockReturnValue({
      currentData: { ...refundDetail, id: 'exp-OTHER' },
      isError: false,
    } as any)
    await openRefundOnSecondRow()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows an error and abandons the refund action when the detail fetch fails', async () => {
    vi.mocked(useGetExpenseQuery).mockReturnValue({
      currentData: undefined,
      isError: true,
    } as any)
    await openRefundOnSecondRow()
    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith('Failed to load expense payments for refund')
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('ExpensesPage - regional date format', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLocation.current = {
      pathname: '/accounting/expenses',
      search: '',
      hash: '',
      key: 'test',
      state: null,
    }
  })

  afterEach(() => {
    localStorage.removeItem('dateFormat')
  })

  const cases: [string, string][] = [
    ['DD/MM/YYYY', '01/07/2026'],
    ['MM/DD/YYYY', '07/01/2026'],
    ['YYYY-MM-DD', '2026-07-01'],
  ]

  cases.forEach(([stored, expected]) => {
    it(`renders the expense date as ${stored}`, () => {
      localStorage.setItem('dateFormat', stored)
      renderPage()
      expect(screen.getByText(expected)).toBeInTheDocument()
    })
  })

  it('does not shift a date-only value under a behind-UTC timezone', () => {
    // Pacific/Niue is UTC-11, the extreme that actually exposes UTC parsing:
    // `new Date('2026-07-01')` is UTC midnight, which is 2026-06-30 13:00 local —
    // the *previous* calendar day. (UTC+14 would move it to 14:00 on the same day
    // and prove nothing.) formatDate must build a local midnight from the parts.
    const originalTZ = process.env.TZ
    process.env.TZ = 'Pacific/Niue'
    try {
      localStorage.setItem('dateFormat', 'YYYY-MM-DD')
      renderPage()
      expect(screen.getByText('2026-07-01')).toBeInTheDocument()
    } finally {
      // Restore precisely: assigning `undefined` would set the string "undefined".
      if (originalTZ === undefined) delete process.env.TZ
      else process.env.TZ = originalTZ
    }
  })
})
