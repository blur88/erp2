import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockTree, mockUpdateAccount } = vi.hoisted(() => ({
  mockTree: [
    {
      id: 'asset-group',
      code: '1000',
      name: 'Current Assets',
      type: 'Asset' as const,
      parentId: null,
      description: null,
      isActive: true,
      isSystem: false,
      isPostable: false,
      openingBalance: '0.0000',
      createdAt: '',
      updatedAt: '',
      balance: '5000.0000',
      children: [
        {
          id: 'cash',
          code: '1100',
          name: 'Cash',
          type: 'Asset' as const,
          parentId: 'asset-group',
          description: null,
          isActive: true,
          isSystem: false,
          isPostable: true,
          openingBalance: '0.0000',
          createdAt: '',
          updatedAt: '',
          balance: '5000.0000',
          children: [],
        },
        {
          id: 'bank',
          code: '1200',
          name: 'Bank Account',
          type: 'Asset' as const,
          parentId: 'asset-group',
          description: null,
          isActive: true,
          isSystem: false,
          isPostable: true,
          openingBalance: '1000.0000',
          createdAt: '',
          updatedAt: '',
          balance: '1000.0000',
          children: [],
        },
      ],
    },
    {
      id: 'equity-group',
      code: '3000',
      name: 'Equity',
      type: 'Equity' as const,
      parentId: null,
      description: null,
      isActive: true,
      isSystem: true,
      isPostable: false,
      openingBalance: '0.0000',
      createdAt: '',
      updatedAt: '',
      balance: '0.0000',
      children: [
        {
          id: 'obe',
          code: '3100',
          name: 'Opening Balance Equity',
          type: 'Equity' as const,
          parentId: 'equity-group',
          description: null,
          isActive: true,
          isSystem: true,
          isPostable: true,
          openingBalance: '0.0000',
          createdAt: '',
          updatedAt: '',
          balance: '0.0000',
          children: [],
        },
      ],
    },
  ],
  mockUpdateAccount: vi.fn(),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useGetAccountTreeQuery: vi.fn(),
  useCreateAccountMutation: vi.fn().mockReturnValue([vi.fn(), { isLoading: false }]),
  useUpdateAccountMutation: vi.fn().mockReturnValue([mockUpdateAccount, { isLoading: false }]),
}))

import { useGetAccountTreeQuery } from '@/store/api/accountingApi'
import ChartOfAccountsPage from '../ChartOfAccountsPage'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

// The page reads state.auth.user.role: account writes are admin-only, so the
// write controls only render for an admin.
function renderPage(role = 'admin') {
  const store = configureStore({
    reducer: { auth: (s = { user: { role }, isAuthenticated: true }) => s } as any,
  })
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <ChartOfAccountsPage />
      </MemoryRouter>
    </Provider>,
  )
}

// useFilterBar debounces search by 400ms. FilterSearch commits immediately on
// Enter (onKeyDown), which is the only way to apply a term synchronously here.
function renderPageWithSearch(term: string) {
  const result = renderPage()
  const input = screen.getByPlaceholderText(/search accounts/i)
  fireEvent.change(input, { target: { value: term } })
  fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
  return result
}

describe('ChartOfAccountsPage', () => {
  beforeEach(() => {
    vi.mocked(useGetAccountTreeQuery).mockReset()
    vi.mocked(useGetAccountTreeQuery).mockReturnValue(
      { data: mockTree, isFetching: false, error: undefined } as any,
    )
  })

  it('renders the tree with hierarchical indentation', () => {
    renderPage()
    expect(screen.getByText('Current Assets')).toBeInTheDocument()
    expect(screen.getByText('Cash')).toBeInTheDocument()
    expect(screen.getByText('Bank Account')).toBeInTheDocument()
    expect(screen.getAllByText('Equity').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Opening Balance Equity')).toBeInTheDocument()
  })

  // Hierarchical code order: siblings sorted by code WITHIN each level, children
  // still beneath their parent. Not a globally ascending list of codes — a
  // child's code sits above its parent's next sibling, which is correct (#899).
  it('renders the tree in hierarchical code order on first paint', () => {
    renderPage()
    const names = Array.from(document.querySelectorAll('tbody tr'))
      .map((tr) => tr.querySelector('td')?.textContent?.trim() ?? '')
      .filter(Boolean)

    // Cash (1100) before Bank Account (1200) is the code order. Name order would
    // put Bank Account first — that is the bug this guards.
    expect(names).toEqual([
      'Current Assets',
      'Cash',
      'Bank Account',
      'Equity',
      'Opening Balance Equity',
    ])
  })

  it('group row shows only "Add Child Account" in row actions', async () => {
    renderPage()
    const user = userEvent.setup()
    const groupRow = screen.getByText('Current Assets').closest('tr')!
    const menuButton = groupRow.querySelector('button[aria-label="row actions"]')!
    await user.click(menuButton)
    expect(screen.getByText('Add Child Account')).toBeInTheDocument()
    expect(screen.queryByText('Edit')).not.toBeInTheDocument()
    expect(screen.queryByText('Set Inactive')).not.toBeInTheDocument()
  })

  it('leaf row shows Edit + Set Inactive actions', async () => {
    renderPage()
    const user = userEvent.setup()
    const leafRow = screen.getByText('Cash').closest('tr')!
    const menuButton = leafRow.querySelector('button[aria-label="row actions"]')!
    await user.click(menuButton)
    expect(screen.getByText('Edit')).toBeInTheDocument()
    expect(screen.getByText('Set Inactive')).toBeInTheDocument()
  })

  it('no Delete or View action appears in any row menu', async () => {
    renderPage()
    const user = userEvent.setup()
    const leafRow = screen.getByText('Cash').closest('tr')!
    await user.click(leafRow.querySelector('button[aria-label="row actions"]')!)
    expect(screen.queryByText('Delete')).not.toBeInTheDocument()
    expect(screen.queryByText('View')).not.toBeInTheDocument()
  })

  it('shows the New Account button to an admin', () => {
    renderPage('admin')
    expect(screen.getByText('New Account')).toBeInTheDocument()
  })

  // Account writes (POST/PATCH /accounting/accounts) stay admin-only, so a
  // non-admin must not be offered controls that would 403 on submit.
  describe.each(['manager', 'sales_staff', 'inventory_staff', 'procurement_staff'])(
    'as %s',
    (role) => {
      it('still reads the chart of accounts', () => {
        renderPage(role)
        expect(screen.getByText('Cash')).toBeInTheDocument()
        expect(screen.getByText('Current Assets')).toBeInTheDocument()
      })

      it('hides the New Account button', () => {
        renderPage(role)
        expect(screen.queryByText('New Account')).not.toBeInTheDocument()
      })

      it('hides the row actions menu entirely', () => {
        renderPage(role)
        const leafRow = screen.getByText('Cash').closest('tr')!
        expect(leafRow.querySelector('button[aria-label="row actions"]')).toBeNull()
      })
    },
  )

  it('sends the applied search term to the tree query', () => {
    renderPageWithSearch('cash')
    expect(vi.mocked(useGetAccountTreeQuery)).toHaveBeenCalledWith(
      { search: 'cash' },
      expect.objectContaining({ skip: false }),
    )
  })

  it('does not issue a filtered query when the search box is empty', () => {
    renderPage()
    expect(vi.mocked(useGetAccountTreeQuery)).toHaveBeenCalledWith({})
    expect(vi.mocked(useGetAccountTreeQuery)).toHaveBeenCalledWith(
      { search: '' },
      expect.objectContaining({ skip: true }),
    )
  })

  // A whitespace-only term is not a search.
  it('does not issue a filtered query for a whitespace-only term', () => {
    renderPageWithSearch('   ')
    expect(vi.mocked(useGetAccountTreeQuery)).toHaveBeenCalledWith(
      { search: '' },
      expect.objectContaining({ skip: true }),
    )
  })

  it('renders the filtered tree in the table while a search is active', () => {
    // Current Assets > Cash only — Bank Account and the whole Equity branch pruned.
    const filtered = [{ ...mockTree[0], children: [mockTree[0].children[0]] }]
    vi.mocked(useGetAccountTreeQuery).mockImplementation((arg: any) =>
      (arg?.search
        ? { data: filtered, isFetching: false, error: undefined }
        : { data: mockTree, isFetching: false, error: undefined }) as any,
    )
    renderPageWithSearch('cash')

    expect(screen.getByText('Cash')).toBeInTheDocument()
    expect(screen.queryByText('Bank Account')).not.toBeInTheDocument()
    expect(screen.queryByText('Opening Balance Equity')).not.toBeInTheDocument()
  })

  // The dialog's parent-account options come from the tree it is given. While a
  // search is active it must still see every account, or a legal parent that the
  // search happened to prune would be unreachable from the form.
  it('offers a search-pruned group as a parent in the form', async () => {
    // Another Asset group, so it is a LEGAL parent for the default Asset type —
    // and the "cash" search prunes it out of the table.
    const fixedAssets = {
      ...mockTree[0],
      id: 'fixed-assets',
      code: '1500',
      name: 'Fixed Assets',
      children: [],
    }
    const filtered = [{ ...mockTree[0], children: [mockTree[0].children[0]] }]
    vi.mocked(useGetAccountTreeQuery).mockImplementation((arg: any) =>
      (arg?.search
        ? { data: filtered, isFetching: false, error: undefined }
        : { data: [...mockTree, fixedAssets], isFetching: false, error: undefined }) as any,
    )
    const user = userEvent.setup()
    renderPageWithSearch('cash')
    // Pruned from the table...
    expect(screen.queryByText('Fixed Assets')).not.toBeInTheDocument()

    await user.click(screen.getByText('New Account'))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    // Parent Account is a MUI `TextField select` — its MenuItems only mount once
    // the select is open, so it has to be opened before asserting on options.
    await user.click(screen.getByLabelText(/Parent Account/i))
    const labels = (await screen.findAllByRole('option')).map((o) => o.textContent)

    // ...but still offered as a parent, because the dialog gets the full tree.
    expect(labels).toEqual(expect.arrayContaining([expect.stringContaining('Fixed Assets')]))
  })

  // The backend rejects a parent that is postable, inactive, or of a different
  // type. Offering those in the dropdown just buys the user a 400 on submit.
  it('only offers same-type group accounts as parents', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByText('New Account')) // defaults to type Asset
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByLabelText(/Parent Account/i))
    const labels = (await screen.findAllByRole('option')).map((o) => o.textContent)

    expect(labels).toEqual(expect.arrayContaining([expect.stringContaining('Current Assets')]))
    // Equity group: wrong type. Cash: a postable leaf. Neither is a legal parent.
    expect(labels).not.toEqual(expect.arrayContaining([expect.stringContaining('Equity')]))
    expect(labels).not.toEqual(expect.arrayContaining([expect.stringContaining('Cash')]))
  })

  // assertParentValid runs on CREATE only, so an existing account can legitimately
  // sit under a group that was deactivated later. The Edit form's (disabled)
  // Parent field must still render that parent, not fall blank because the
  // create-time filter dropped its option.
  it('still shows the parent when editing a child of a deactivated group', async () => {
    const deactivatedGroup = { ...mockTree[0], isActive: false }
    vi.mocked(useGetAccountTreeQuery).mockReturnValue(
      { data: [deactivatedGroup, mockTree[1]], isFetching: false, error: undefined } as any,
    )
    const user = userEvent.setup()
    renderPage()

    const leafRow = screen.getByText('Cash').closest('tr')!
    await user.click(leafRow.querySelector('button[aria-label="row actions"]')!)
    await user.click(screen.getByText('Edit'))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Current Assets')).toBeInTheDocument()
  })

  it('surfaces a full-tree failure even while a search is active', () => {
    vi.mocked(useGetAccountTreeQuery).mockImplementation((arg: any) =>
      (arg?.search
        ? { data: [], isFetching: false, error: undefined }
        : { data: undefined, isFetching: false, error: { status: 500 } }) as any,
    )
    renderPageWithSearch('cash')
    expect(screen.getByText(/Failed to load accounts/i)).toBeInTheDocument()
  })

  // Without a trustworthy full tree the form has no parent options, so creating
  // an account could silently attach it to the wrong parent. EVERY write control
  // has to go, not only the primary button: assert on the row menu too, or a
  // missing `isAdmin={canWrite}` on AccountList would slip through green.
  it('hides every write control while the full tree has failed to load', () => {
    // The filtered query still succeeds, so the table has rows to hang a row-action
    // menu off — this is exactly the case a New-Account-only assertion would miss.
    vi.mocked(useGetAccountTreeQuery).mockImplementation((arg: any) =>
      (arg?.search
        ? { data: mockTree, isFetching: false, error: undefined }
        : { data: undefined, isFetching: false, error: { status: 500 } }) as any,
    )
    renderPageWithSearch('cash')

    expect(screen.queryByText('New Account')).not.toBeInTheDocument()
    const leafRow = screen.getByText('Cash').closest('tr')!
    expect(leafRow.querySelector('button[aria-label="row actions"]')).toBeNull()
  })

  // An empty chart of accounts is a legitimate state — gating the write controls
  // on non-empty data would make the FIRST account impossible to create.
  it('still offers New Account when the chart of accounts is empty', () => {
    vi.mocked(useGetAccountTreeQuery).mockReturnValue(
      { data: [], isFetching: false, error: undefined } as any,
    )
    renderPage()
    expect(screen.getByText('New Account')).toBeInTheDocument()
  })

  // "Add Child Account" used to open the same blank form as "New Account": the
  // chosen parent was tracked in state and never handed to the dialog.
  it('prefills the parent when adding a child account', async () => {
    const user = userEvent.setup()
    renderPage()

    const groupRow = screen.getByText('Current Assets').closest('tr')!
    await user.click(groupRow.querySelector('button[aria-label="row actions"]')!)
    await user.click(screen.getByText('Add Child Account'))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    // The backend rejects a child whose type differs from its parent, so the type
    // is inherited and locked rather than left for the user to get wrong.
    const typeField = screen.getByLabelText(/Type/i)
    expect(typeField).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText(/Inherited from Current Assets/i)).toBeInTheDocument()
  })

  it('leaves the parent empty when adding a root account', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByText('New Account'))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByText(/Inherited from/i)).not.toBeInTheDocument()
  })
})
