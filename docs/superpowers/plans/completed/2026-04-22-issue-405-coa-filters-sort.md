# COA Page Filters & Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Account Type and Active Status filter dropdowns plus a working sort toggle to the Chart of Accounts page.

**Architecture:** All filtering and sorting is client-side on already-fetched data. A new `account-type` filter type is added to the shared FilterBar system (types, hook, URL utils, FilterBar renderer) following the identical pattern used by `journal-entry-type` and `owner-equity-type`. The existing `status` filter type handles Active Status. Sort state lives in `ChartOfAccountsPage`.

**Tech Stack:** React 19, TypeScript, MUI v7, Vitest

---

## File Map

| File | Action |
|------|--------|
| `frontend/src/types/filterBar.types.ts` | Add `'account-type'` to union + new interface |
| `frontend/src/hooks/useFilterBar.ts` | Add `'account-type'` to null-default branch |
| `frontend/src/utils/filterBar.url.ts` | Add `'account-type'` to serialize/parse branches |
| `frontend/src/components/filters/FilterAccountType.tsx` | Create new component |
| `frontend/src/components/filters/FilterBar.tsx` | Wire `account-type` in `renderQuickField` |
| `frontend/src/pages/accounting/ChartOfAccountsPage.tsx` | Add filters + sort |
| `frontend/src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx` | Add new test cases |

---

### Task 1: Add `account-type` to the FilterBar type system

**Files:**
- Modify: `frontend/src/types/filterBar.types.ts`
- Modify: `frontend/src/hooks/useFilterBar.ts`
- Modify: `frontend/src/utils/filterBar.url.ts`

- [ ] **Step 1: Add the type to `filterBar.types.ts`**

In `frontend/src/types/filterBar.types.ts`:

1. Add `'account-type'` to the `FilterFieldType` union (after `'fund-transfer-status'`):

```ts
export type FilterFieldType =
  | 'status'
  | 'user-status'
  | 'customer-type'
  | 'supplier-type'
  | 'role'
  | 'stock-adjustment-status'
  | 'period'
  | 'compare'
  | 'customer'
  | 'order-status'
  | 'payment-status'
  | 'supplier'
  | 'purchasing-status'
  | 'category'
  | 'product-type'
  | 'stock-status'
  | 'price-list'
  | 'transaction-status'
  | 'vendor-payment-status'
  | 'journal-entry-status'
  | 'journal-entry-type'
  | 'expense-status'
  | 'owner-equity-type'
  | 'fiscal-period-status'
  | 'bank-reconciliation-status'
  | 'settlement-status'
  | 'fund-transfer-status'
  | 'account-type'
```

2. Add the config interface after `FundTransferStatusFilterFieldConfig`:

```ts
export interface AccountTypeFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'account-type'
}
```

3. Add to the `FilterFieldConfig` union (after `FundTransferStatusFilterFieldConfig<TFilters, keyof TFilters>`):

```ts
  | AccountTypeFilterFieldConfig<TFilters, keyof TFilters>
```

- [ ] **Step 2: Add `'account-type'` to the null-default branch in `useFilterBar.ts`**

In `frontend/src/hooks/useFilterBar.ts`, find the long `if` condition that defaults filter fields to `null` (around line 28–48). Add `'account-type'` to the end of that condition, before the closing `)`:

```ts
    field.type === 'fund-transfer-status' ||
    field.type === 'account-type'
```

- [ ] **Step 3: Add `'account-type'` to URL serialization in `filterBar.url.ts`**

In `frontend/src/utils/filterBar.url.ts`:

3a. In `serializeFilters`, find the `isSingleValueField` boolean (around line 67–93). Add `'account-type'` to the end of the condition:

```ts
      field.type === 'fund-transfer-status' ||
      field.type === 'account-type'
```

3b. In `parseFilters`, find the matching `isSingleValueField` boolean (around line 153–178). Add `'account-type'` to the end of the condition:

```ts
      field.type === 'fund-transfer-status' ||
      field.type === 'account-type'
```

3c. In `parseFilters`, inside the `if (isSingleValueField)` block, add a branch for `'account-type'` before the final `else` (around line 240–244):

```ts
      } else if (field.type === 'account-type') {
        const VALID_ACCOUNT_TYPE = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']
        result[fieldKey] = VALID_ACCOUNT_TYPE.includes(raw) ? raw : (defaultValue ?? null)
      } else {
        result[fieldKey] = raw
      }
```

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/types/filterBar.types.ts src/hooks/useFilterBar.ts src/utils/filterBar.url.ts
git commit -m "feat(filter-bar): add account-type filter field type (issue #405)"
```

---

### Task 2: Create `FilterAccountType` component and wire into `FilterBar`

**Files:**
- Create: `frontend/src/components/filters/FilterAccountType.tsx`
- Modify: `frontend/src/components/filters/FilterBar.tsx`

- [ ] **Step 1: Write the failing test**

In `frontend/src/components/filters/__tests__/FilterBar.test.tsx` (or create it if it doesn't exist for this component — check first with `ls frontend/src/components/filters/__tests__/`). Add a test verifying `account-type` renders the Account Type dropdown.

Actually, `FilterAccountType` is a thin wrapper around `FilterSelect` (which is already tested). Skip a dedicated unit test — it will be covered by the page-level tests in Task 3. Proceed directly to implementation.

- [ ] **Step 2: Create `FilterAccountType.tsx`**

Create `frontend/src/components/filters/FilterAccountType.tsx`:

```tsx
import { FilterSelect } from './FilterSelect'

const OPTIONS = [
  { value: 'ASSET', label: 'Asset' },
  { value: 'LIABILITY', label: 'Liability' },
  { value: 'EQUITY', label: 'Equity' },
  { value: 'REVENUE', label: 'Revenue' },
  { value: 'EXPENSE', label: 'Expense' },
]

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterAccountType({ field, value, onChange }: Props) {
  return (
    <FilterSelect
      field={field}
      label="Account Type"
      value={value}
      options={OPTIONS}
      onChange={onChange}
    />
  )
}
```

- [ ] **Step 3: Wire into `FilterBar.tsx`**

In `frontend/src/components/filters/FilterBar.tsx`:

3a. Add the import after the existing filter imports (e.g. after `import { FilterFundTransferStatus } from './FilterFundTransferStatus'`):

```ts
import { FilterAccountType } from './FilterAccountType'
```

3b. In `renderQuickField`, add a branch before the final `return null` (after the `fund-transfer-status` block):

```tsx
  if (field.type === 'account-type') {
    return (
      <FilterAccountType
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }
```

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/filters/FilterAccountType.tsx src/components/filters/FilterBar.tsx
git commit -m "feat(filter-bar): add FilterAccountType component (issue #405)"
```

---

### Task 3: Update `ChartOfAccountsPage` with filters and sort

**Files:**
- Modify: `frontend/src/pages/accounting/ChartOfAccountsPage.tsx`
- Modify: `frontend/src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx`

- [ ] **Step 1: Write the failing tests first**

Replace the test file content at `frontend/src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx` with the following (keeps all existing tests, adds new ones):

```tsx
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

describe('ChartOfAccountsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    setup([parent])

    render(
      <BrowserRouter>
        <ChartOfAccountsPage />
      </BrowserRouter>,
    )

    expect(screen.getByText('1000')).toBeInTheDocument()
    expect(screen.getByText('1010')).toBeInTheDocument()
  })

  it('filters by account type — hides non-matching accounts', async () => {
    setup([mockAccount, mockLiabilityAccount])
    const user = userEvent.setup()

    render(
      <BrowserRouter>
        <ChartOfAccountsPage />
      </BrowserRouter>,
    )

    // Both visible initially
    expect(screen.getByText('1000')).toBeInTheDocument()
    expect(screen.getByText('2000')).toBeInTheDocument()

    // Open Account Type dropdown and select Asset
    await user.click(screen.getByLabelText('Account Type'))
    await user.click(screen.getByRole('option', { name: 'Asset' }))

    // Only asset account remains
    expect(screen.getByText('1000')).toBeInTheDocument()
    expect(screen.queryByText('2000')).not.toBeInTheDocument()
  })

  it('filters by active status — hides inactive accounts', async () => {
    setup([mockAccount, mockInactiveAccount])
    const user = userEvent.setup()

    render(
      <BrowserRouter>
        <ChartOfAccountsPage />
      </BrowserRouter>,
    )

    expect(screen.getByText('1000')).toBeInTheDocument()
    expect(screen.getByText('3000')).toBeInTheDocument()

    // Open Status dropdown and select Active
    await user.click(screen.getByLabelText('Status'))
    await user.click(screen.getByRole('option', { name: 'Active' }))

    expect(screen.getByText('1000')).toBeInTheDocument()
    expect(screen.queryByText('3000')).not.toBeInTheDocument()
  })

  it('combined account type and status filters', async () => {
    const activeAsset = { ...mockAccount, id: '1', code: '1000', type: 'ASSET', isActive: true }
    const inactiveAsset = { ...mockAccount, id: '2', code: '1100', type: 'ASSET', isActive: false }
    const activeLiability = { ...mockAccount, id: '3', code: '2000', type: 'LIABILITY', isActive: true }
    setup([activeAsset, inactiveAsset, activeLiability])
    const user = userEvent.setup()

    render(
      <BrowserRouter>
        <ChartOfAccountsPage />
      </BrowserRouter>,
    )

    // Filter by Asset type
    await user.click(screen.getByLabelText('Account Type'))
    await user.click(screen.getByRole('option', { name: 'Asset' }))

    // Filter by Active status
    await user.click(screen.getByLabelText('Status'))
    await user.click(screen.getByRole('option', { name: 'Active' }))

    // Only active asset remains
    expect(screen.getByText('1000')).toBeInTheDocument()
    expect(screen.queryByText('1100')).not.toBeInTheDocument()
    expect(screen.queryByText('2000')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the new tests to confirm they fail**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx
```

Expected: the 3 new filter tests fail (filters not implemented yet). The 3 existing tests pass.

- [ ] **Step 3: Update `ChartOfAccountsPage.tsx`**

Replace the entire file content:

```tsx
import React, { useMemo, useState } from 'react'

import AccountMappingWarning from '@/components/accounting/AccountMappingWarning'
import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useGetChartOfAccountsHierarchyQuery } from '@/store/api/accountingApi'
import type { ChartOfAccount } from '@/types'
import type { FilterBarConfig } from '@/types/filterBar.types'

import { ChartOfAccountContextHeader } from './components/ChartOfAccountContextHeader'
import { ChartOfAccountsDialogs } from './components/ChartOfAccountsDialogs'
import { ChartOfAccountsTable } from './components/ChartOfAccountsTable'
import { ChartOfAccountWorkspaceCard } from './components/ChartOfAccountWorkspaceCard'
import { useChartOfAccountsWorkspace } from './hooks/useChartOfAccountsWorkspace'

interface CoaFilters {
  search: string
  accountType: string | null
  isActive: string | null
}

const filterConfig: FilterBarConfig<CoaFilters> = {
  search: { placeholder: 'Search by code or name...' },
  fields: [
    { field: 'accountType', label: 'Account Type', type: 'account-type' },
    { field: 'isActive', label: 'Status', type: 'status' },
  ],
  defaults: { search: '', accountType: null, isActive: null },
}

const ChartOfAccountsPage: React.FC = () => {
  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)
  const { data: hierarchyData, isLoading, error, refetch } = useGetChartOfAccountsHierarchyQuery()
  const workspace = useChartOfAccountsWorkspace(() => {
    void refetch()
  })
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const accounts = useMemo(() => {
    const result: ChartOfAccount[] = []

    const walk = (nodes: ChartOfAccount[]) => {
      for (const node of nodes) {
        result.push(node)

        if (node.children?.length) {
          walk(node.children)
        }
      }
    }

    walk(hierarchyData ?? [])
    return result
  }, [hierarchyData])

  const filteredAccounts = useMemo(() => {
    let result = accounts

    if (appliedFilters.search) {
      const searchTerm = appliedFilters.search.toLowerCase()
      result = result.filter(
        (account) =>
          account.code.toLowerCase().includes(searchTerm) ||
          account.name.toLowerCase().includes(searchTerm),
      )
    }

    if (appliedFilters.accountType) {
      result = result.filter((account) => account.type === appliedFilters.accountType)
    }

    if (appliedFilters.isActive !== null) {
      result = result.filter(
        (account) => String(account.isActive) === appliedFilters.isActive,
      )
    }

    return [...result].sort((a, b) =>
      sortOrder === 'asc'
        ? a.code.localeCompare(b.code)
        : b.code.localeCompare(a.code),
    )
  }, [accounts, appliedFilters, sortOrder])

  return (
    <>
      <AccountMappingWarning context="system" />
      <GenericListPage
        title="Chart of Accounts"
        subtitle={`Manage your accounting structure and account hierarchy (${hasActiveFilters ? `${filteredAccounts.length} of ${accounts.length}` : `${accounts.length} total`})`}
        primaryAction={{
          label: 'Add Account',
          onClick: () => {
            workspace.setSelected(null)
            workspace.setFormDialogOpen(true)
          },
        }}
        secondaryAction={{ label: 'View Deleted', onClick: () => workspace.setDeletedDialogOpen(true) }}
        filterConfig={filterConfig}
        draftFilters={draftFilters}
        handlers={handlers}
        hasActiveFilters={hasActiveFilters}
        searchInputRef={workspace.searchInputRef}
        sort={{
          field: 'code',
          sortBy: 'code',
          sortOrder,
          onSort: () => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc')),
        }}
        error={(error as any)?.data ?? null}
        listSlot={
          <ChartOfAccountsTable
            accounts={filteredAccounts}
            loading={isLoading}
            selectedId={workspace.selected?.id ?? null}
            onSelect={workspace.setSelected}
            listRef={workspace.listRef}
          />
        }
        headerSlot={
          <ChartOfAccountContextHeader
            selected={workspace.selected}
            onEdit={() => workspace.setFormDialogOpen(true)}
            onDelete={() => workspace.selected && workspace.setDeleteTarget(workspace.selected)}
          />
        }
        workspaceSlot={<ChartOfAccountWorkspaceCard selected={workspace.selected} />}
        dialogs={
          <ChartOfAccountsDialogs
            formDialogOpen={workspace.formDialogOpen}
            selected={workspace.selected}
            onCloseForm={() => workspace.setFormDialogOpen(false)}
            onFormSuccess={() => {
              workspace.setFormDialogOpen(false)
              void refetch()
            }}
            deleteTarget={workspace.deleteTarget}
            onConfirmDelete={() => void workspace.handleDelete()}
            onCancelDelete={() => workspace.setDeleteTarget(null)}
            seedConfirmOpen={workspace.seedConfirmOpen}
            onConfirmSeed={() => void workspace.handleSeed()}
            onCancelSeed={() => workspace.setSeedConfirmOpen(false)}
            deletedDialogOpen={workspace.deletedDialogOpen}
            onCloseDeletedDialog={() => workspace.setDeletedDialogOpen(false)}
            onChanged={() => void refetch()}
          />
        }
      />
    </>
  )
}

export default ChartOfAccountsPage
```

- [ ] **Step 4: Run all tests for the page**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx
```

Expected: all 6 tests pass.

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/pages/accounting/ChartOfAccountsPage.tsx src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx
git commit -m "feat(accounting): add account type, status filters and sort to COA page (issue #405)"
```

---

### Task 4: Final verification

- [ ] **Step 1: Run the full accounting test suite**

```bash
cd frontend && npx vitest run src/pages/accounting/
```

Expected: all tests pass.

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Close the issue via PR**

Create a PR with `Closes #405` in the body, then merge with `--merge --delete-branch`.
