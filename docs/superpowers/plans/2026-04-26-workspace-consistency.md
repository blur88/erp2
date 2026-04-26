# Workspace Consistency Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all 8 master-detail pages consistent by promoting shared patterns into `useEntityWorkspace` and wiring `usePurchaseOrdersWorkspace` and `useChartOfAccountsWorkspace` to use it.

**Architecture:** `useEntityWorkspace` gains two optional config fields (`highlightParam`, `locationStateHighlightKey`) that absorb duplicated highlight/selection `useEffect`s from outer hooks. `usePurchaseOrdersWorkspace` is refactored to wrap `useEntityWorkspace` (matching the Sales Orders pattern). `useChartOfAccountsWorkspace` gets a new Redux `accountingSlice` and wraps `useEntityWorkspace`. All 8 pages end up using the same infrastructure layer.

**Tech Stack:** React 19, TypeScript, Redux Toolkit, RTK Query, React Router v6, Vitest, `@testing-library/react`

**Design spec:** `docs/superpowers/specs/2026-04-26-workspace-consistency-design.md`

---

## File Map

| Action | File |
|---|---|
| Modify | `frontend/src/hooks/useEntityWorkspace.ts` |
| Modify | `frontend/src/hooks/useEntityWorkspace.test.ts` |
| **Create** | `frontend/src/store/slices/accountingSlice.ts` |
| Modify | `frontend/src/store/index.ts` |
| Modify | `frontend/src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.ts` |
| Modify | `frontend/src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.test.tsx` |
| Modify | `frontend/src/pages/accounting/hooks/useChartOfAccountsWorkspace.ts` |
| Modify | `frontend/src/pages/accounting/ChartOfAccountsPage.tsx` |
| Modify | `frontend/src/pages/accounting/components/ChartOfAccountsTable.tsx` |
| Modify | `frontend/src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx` |
| Modify | `frontend/src/pages/sales/hooks/useOrdersWorkspace.ts` |
| Modify | `frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts` |
| Modify | `frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts` |
| Modify | `frontend/src/pages/purchasing/hooks/useGRNWorkspace.ts` |
| Modify | `frontend/src/pages/purchasing/hooks/useVendorPaymentsWorkspace.ts` |

---

## Task 1: Extend `useEntityWorkspace` with `highlightParam`

**Files:**
- Modify: `frontend/src/hooks/useEntityWorkspace.ts`
- Test: `frontend/src/hooks/useEntityWorkspace.test.ts`

- [ ] **Step 1: Write the failing test**

Open `frontend/src/hooks/useEntityWorkspace.test.ts` and add this test block after the existing tests:

```typescript
import { MemoryRouter } from 'react-router-dom'
import type { PropsWithChildren } from 'react'

// Add this wrapper factory at the top of the file alongside makeConfig:
const makeWrapper = (initialUrl: string) => {
  const wrapper = ({ children }: PropsWithChildren) => (
    <MemoryRouter initialEntries={[initialUrl]}>{children}</MemoryRouter>
  )
  return wrapper
}

describe('highlightParam', () => {
  it('selects and focuses entity matching the URL param on mount', async () => {
    const config = makeConfig()
    const { result } = renderHook(
      () => useEntityWorkspace({ ...config, highlightParam: 'highlight' }),
      { wrapper: makeWrapper('/entities?highlight=2') },
    )

    await waitFor(() => {
      expect(config.selectEntity).toHaveBeenCalledWith(config.entities[1])
      expect(result.current.focusedIndex).toBe(1)
    })
  })

  it('does nothing when highlightParam entity is not in the list', async () => {
    const config = makeConfig()
    renderHook(
      () => useEntityWorkspace({ ...config, highlightParam: 'highlight' }),
      { wrapper: makeWrapper('/entities?highlight=999') },
    )

    await waitFor(() => {
      // auto-selects first, not the missing highlight
      expect(config.selectEntity).toHaveBeenCalledWith(config.entities[0])
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/hooks/useEntityWorkspace.test.ts --no-coverage
```

Expected: FAIL — `highlightParam` config option does not exist yet.

- [ ] **Step 3: Add `highlightParam` to `useEntityWorkspace`**

In `frontend/src/hooks/useEntityWorkspace.ts`:

1. Add `highlightParam?: string` to `UseEntityWorkspaceConfig`:

```typescript
export interface UseEntityWorkspaceConfig<T extends { id: string }> {
  entities: T[]
  selectedEntity: T | null
  selectEntity: (entity: T | null) => void
  refetch: () => void
  navigate: NavigateFunction
  routes: {
    create: string
    edit: (id: string) => string
  }
  notifications: {
    showSuccess: (message: string) => void
    showError: (message: string) => void
  }
  deleteMutation: (id: string) => Promise<void>
  onEnter?: () => void
  onEscape?: () => void
  highlightParam?: string
  locationStateHighlightKey?: string
}
```

2. Add `useSearchParams` and `useLocation` imports at the top:

```typescript
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import { useLocation, useSearchParams } from 'react-router-dom'

import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
```

3. Inside `useEntityWorkspace`, destructure the new fields and add the highlight `useEffect` after the existing `useEffect`s (before `selectAtIndex`):

```typescript
const { highlightParam, locationStateHighlightKey, ...rest } = config
// keep existing destructuring for other fields

const [searchParams, setSearchParams] = useSearchParams()
const location = useLocation()
const highlightConsumedRef = useRef<string | null>(null)

// After existing useEffect blocks, add:
useEffect(() => {
  if (!highlightParam || entities.length === 0) {
    return
  }

  const highlightId = searchParams.get(highlightParam)
  if (!highlightId || highlightConsumedRef.current === highlightId) {
    return
  }

  const index = entities.findIndex((e) => e.id === highlightId)
  if (index < 0) {
    return
  }

  highlightConsumedRef.current = highlightId
  setFocusedIndex(index)
  selectEntity(entities[index])
  setSearchParams(
    (prev) => {
      prev.delete(highlightParam)
      return prev
    },
    { replace: true },
  )
}, [entities, highlightParam, searchParams, selectEntity, setSearchParams])
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/hooks/useEntityWorkspace.test.ts --no-coverage
```

Expected: All tests pass including the two new highlight tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useEntityWorkspace.ts frontend/src/hooks/useEntityWorkspace.test.ts
git commit -m "feat(workspace): add highlightParam support to useEntityWorkspace"
```

---

## Task 2: Extend `useEntityWorkspace` with `locationStateHighlightKey`

**Files:**
- Modify: `frontend/src/hooks/useEntityWorkspace.ts`
- Test: `frontend/src/hooks/useEntityWorkspace.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/hooks/useEntityWorkspace.test.ts` inside a new `describe('locationStateHighlightKey', ...)` block:

```typescript
const makeWrapperWithState = (initialUrl: string, state: Record<string, unknown>) => {
  const wrapper = ({ children }: PropsWithChildren) => (
    <MemoryRouter initialEntries={[{ pathname: initialUrl, state }]}>{children}</MemoryRouter>
  )
  return wrapper
}

describe('locationStateHighlightKey', () => {
  it('selects entity when location.state contains an id string', async () => {
    const config = makeConfig()
    const { result } = renderHook(
      () => useEntityWorkspace({ ...config, locationStateHighlightKey: 'highlightId' }),
      { wrapper: makeWrapperWithState('/entities', { highlightId: '3' }) },
    )

    await waitFor(() => {
      expect(config.selectEntity).toHaveBeenCalledWith(config.entities[2])
      expect(result.current.focusedIndex).toBe(2)
    })
  })

  it('selects entity when location.state contains an entity object', async () => {
    const config = makeConfig()
    const { result } = renderHook(
      () => useEntityWorkspace({ ...config, locationStateHighlightKey: 'highlightEntity' }),
      { wrapper: makeWrapperWithState('/entities', { highlightEntity: config.entities[1] }) },
    )

    await waitFor(() => {
      expect(config.selectEntity).toHaveBeenCalledWith(config.entities[1])
      expect(result.current.focusedIndex).toBe(1)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/hooks/useEntityWorkspace.test.ts --no-coverage
```

Expected: FAIL — `locationStateHighlightKey` not implemented yet.

- [ ] **Step 3: Implement `locationStateHighlightKey` in `useEntityWorkspace`**

In `frontend/src/hooks/useEntityWorkspace.ts`, add a second ref and `useEffect` after the `highlightParam` effect:

```typescript
const locationStateConsumedRef = useRef(false)

useEffect(() => {
  if (!locationStateHighlightKey || entities.length === 0 || locationStateConsumedRef.current) {
    return
  }

  const state = location.state as Record<string, unknown> | null
  if (!state) {
    return
  }

  const value = state[locationStateHighlightKey]
  if (!value) {
    return
  }

  // value is either a string id or an entity object with an id field
  const highlightId = typeof value === 'string' ? value : (value as { id?: string }).id
  if (!highlightId) {
    return
  }

  const index = entities.findIndex((e) => e.id === highlightId)
  if (index < 0) {
    return
  }

  locationStateConsumedRef.current = true
  setFocusedIndex(index)
  selectEntity(entities[index])
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
}, [entities, location.state, locationStateHighlightKey, selectEntity])
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/hooks/useEntityWorkspace.test.ts --no-coverage
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useEntityWorkspace.ts frontend/src/hooks/useEntityWorkspace.test.ts
git commit -m "feat(workspace): add locationStateHighlightKey support to useEntityWorkspace"
```

---

## Task 3: Create `accountingSlice` Redux slice

**Files:**
- Create: `frontend/src/store/slices/accountingSlice.ts`
- Modify: `frontend/src/store/index.ts`

- [ ] **Step 1: Create the slice**

Create `frontend/src/store/slices/accountingSlice.ts`:

```typescript
import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { RootState } from '@/store'
import type { ChartOfAccount } from '@/types'

interface AccountingState {
  selectedAccount: ChartOfAccount | null
}

const initialState: AccountingState = {
  selectedAccount: null,
}

const accountingSlice = createSlice({
  name: 'accounting',
  initialState,
  reducers: {
    setSelectedAccount: (state, action: PayloadAction<ChartOfAccount | null>) => {
      state.selectedAccount = action.payload
    },
  },
})

export const { setSelectedAccount } = accountingSlice.actions
export const selectSelectedAccount = (state: RootState) => state.accounting.selectedAccount
export default accountingSlice.reducer
```

- [ ] **Step 2: Register in store**

In `frontend/src/store/index.ts`, add the import and register the reducer:

```typescript
// Add import alongside other slice imports:
import accountingSlice from './slices/accountingSlice'

// Add to rootReducer:
const rootReducer = combineReducers({
  auth: authSlice,
  notifications: notificationSlice,
  inventory: inventorySlice,
  sales: salesSlice,
  purchasing: purchasingSlice,
  accounting: accountingSlice,   // <-- add this line
  backup: backupSlice,
  auditLogs: auditLogSlice,
  priceLists: priceListSlice,
  // ... rest unchanged
})
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: No errors. If `RootState` is used in `accountingSlice.ts` before `index.ts` exports it, TypeScript may complain about circular types — resolve by typing the selector parameter as `{ accounting: AccountingState }` instead of `RootState` in the slice file, then re-export with the correct type from the page.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/store/slices/accountingSlice.ts frontend/src/store/index.ts
git commit -m "feat(accounting): add accountingSlice with selectedAccount state"
```

---

## Task 4: Refactor `useChartOfAccountsWorkspace` to use `useEntityWorkspace`

**Files:**
- Modify: `frontend/src/pages/accounting/hooks/useChartOfAccountsWorkspace.ts`
- Modify: `frontend/src/pages/accounting/ChartOfAccountsPage.tsx`
- Modify: `frontend/src/pages/accounting/components/ChartOfAccountsTable.tsx`
- Test: `frontend/src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx`

- [ ] **Step 1: Update `ChartOfAccountsPage.test.tsx` to add Redux provider and account selection assertion**

The existing test renders `ChartOfAccountsPage` in a plain `BrowserRouter` without a Redux store. After this task the page will read `selectedAccount` from Redux, so the test needs a store. Also the existing test queries `data-account-index` which will change to `data-index` (from `EntityTable`'s always-present `data-index` attribute).

Replace the `renderPage` function and add a store setup in `frontend/src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx`:

```typescript
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import accountingReducer from '@/store/slices/accountingSlice'

// Replace renderPage with:
function renderPage() {
  const store = configureStore({
    reducer: { accounting: accountingReducer },
  })
  return render(
    <Provider store={store}>
      <BrowserRouter>
        <ChartOfAccountsPage />
      </BrowserRouter>
    </Provider>,
  )
}

// Update the selector in getRenderedAccountCodes to use data-index:
function getRenderedAccountCodes() {
  return Array.from(document.querySelectorAll('tr[data-index] td:first-child')).map((cell) =>
    cell.textContent?.trim() ?? '',
  )
}
```

- [ ] **Step 2: Run existing tests to capture baseline (they should still pass)**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx --no-coverage
```

Expected: Tests pass (they still use the old hook before we change it). Note any failures — these are pre-existing issues.

- [ ] **Step 3: Rewrite `useChartOfAccountsWorkspace`**

Replace the entire contents of `frontend/src/pages/accounting/hooks/useChartOfAccountsWorkspace.ts`:

```typescript
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import { useDeleteChartOfAccountMutation, useSeedDefaultChartOfAccountsMutation } from '@/store/api/accountingApi'
import { setSelectedAccount } from '@/store/slices/accountingSlice'
import type { AppDispatch } from '@/store'
import type { ChartOfAccount } from '@/types'

export function useChartOfAccountsWorkspace(
  accounts: ChartOfAccount[],
  selectedAccount: ChartOfAccount | null,
  dispatch: AppDispatch,
  refetch: () => void,
) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ChartOfAccount | null>(null)
  const [seedConfirmOpen, setSeedConfirmOpen] = useState(false)
  const [deletedDialogOpen, setDeletedDialogOpen] = useState(false)
  const [deleteChartOfAccount] = useDeleteChartOfAccountMutation()
  const [seedDefaultChartOfAccounts] = useSeedDefaultChartOfAccountsMutation()

  const workspace = useEntityWorkspace({
    entities: accounts,
    selectedEntity: selectedAccount,
    selectEntity: (account) => dispatch(setSelectedAccount(account)),
    refetch,
    navigate,
    highlightParam: 'highlight',
    routes: {
      create: '/accounting/chart-of-accounts',
      edit: () => '/accounting/chart-of-accounts',
    },
    notifications: { showSuccess, showError },
    deleteMutation: async (id) => {
      const target = accounts.find((a) => a.id === id)
      await deleteChartOfAccount(id).unwrap()
      showSuccess(`Account "${target?.name ?? id}" deleted successfully`)
    },
    onEnter: () => setFormDialogOpen(true),
    onEscape: () => {
      dispatch(setSelectedAccount(null))
      setFormDialogOpen(false)
      setDeleteTarget(null)
      setSeedConfirmOpen(false)
    },
  })

  const handleSeed = useCallback(async () => {
    try {
      const result = await seedDefaultChartOfAccounts().unwrap()
      showSuccess(result.message || 'Default accounts seeded successfully')
      setSeedConfirmOpen(false)
      refetch()
    } catch (error: any) {
      showError(error || 'Failed to seed default accounts')
      setSeedConfirmOpen(false)
    }
  }, [refetch, seedDefaultChartOfAccounts, showError, showSuccess])

  return {
    ...workspace,
    selected: selectedAccount,
    setSelected: (account: ChartOfAccount | null) => dispatch(setSelectedAccount(account)),
    formDialogOpen,
    setFormDialogOpen,
    deleteTarget,
    setDeleteTarget,
    seedConfirmOpen,
    setSeedConfirmOpen,
    deletedDialogOpen,
    setDeletedDialogOpen,
    handleSeed,
  }
}
```

- [ ] **Step 4: Update `ChartOfAccountsPage` to pass new args and read Redux state**

Replace the relevant parts of `frontend/src/pages/accounting/ChartOfAccountsPage.tsx`:

```typescript
// Add these imports:
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { selectSelectedAccount } from '@/store/slices/accountingSlice'

// Inside ChartOfAccountsPage component, add:
const dispatch = useAppDispatch()
const selectedAccount = useAppSelector(selectSelectedAccount)

// Change workspace initialisation from:
//   const workspace = useChartOfAccountsWorkspace(() => { void refetch() })
// To:
const workspace = useChartOfAccountsWorkspace(filteredAccounts, selectedAccount, dispatch, () => { void refetch() })

// Change all references from workspace.selected to selectedAccount:
//   workspace.selected?.id  → selectedAccount?.id
//   workspace.selected      → selectedAccount
// (There are ~6 occurrences in the JSX — update each one)
```

The full updated component:

```typescript
import React, { useMemo, useState } from 'react'

import AccountMappingWarning from '@/components/accounting/AccountMappingWarning'
import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { useGetChartOfAccountsHierarchyQuery } from '@/store/api/accountingApi'
import { selectSelectedAccount } from '@/store/slices/accountingSlice'
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
  const dispatch = useAppDispatch()
  const selectedAccount = useAppSelector(selectSelectedAccount)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const accounts = useMemo(() => {
    const result: ChartOfAccount[] = []
    const walk = (nodes: ChartOfAccount[]) => {
      for (const node of nodes) {
        result.push(node)
        if (node.children?.length) walk(node.children)
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
    if (appliedFilters.isActive) {
      const isActive = appliedFilters.isActive === 'active'
      result = result.filter((account) => account.isActive === isActive)
    }
    return [...result].sort((left, right) =>
      sortOrder === 'asc'
        ? left.code.localeCompare(right.code)
        : right.code.localeCompare(left.code),
    )
  }, [accounts, appliedFilters, sortOrder])

  const workspace = useChartOfAccountsWorkspace(filteredAccounts, selectedAccount, dispatch, () => {
    void refetch()
  })

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
            selectedId={selectedAccount?.id ?? null}
            onSelect={workspace.setSelected}
            listRef={workspace.listRef}
            focusedIndex={workspace.focusedIndex}
          />
        }
        headerSlot={
          <ChartOfAccountContextHeader
            selected={selectedAccount}
            onEdit={() => workspace.setFormDialogOpen(true)}
            onDelete={() => selectedAccount && workspace.setDeleteTarget(selectedAccount)}
          />
        }
        workspaceSlot={<ChartOfAccountWorkspaceCard selected={selectedAccount} />}
        dialogs={
          <ChartOfAccountsDialogs
            formDialogOpen={workspace.formDialogOpen}
            selected={selectedAccount}
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

- [ ] **Step 5: Update `ChartOfAccountsTable` to accept and pass `focusedIndex`**

In `frontend/src/pages/accounting/components/ChartOfAccountsTable.tsx`, add `focusedIndex` to the Props interface and pass it through:

```typescript
import { useRef, type RefObject } from 'react'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import type { ChartOfAccount } from '@/types'

interface Props {
  accounts: ChartOfAccount[]
  loading: boolean
  selectedId: string | null
  onSelect: (item: ChartOfAccount) => void
  listRef?: RefObject<HTMLDivElement | null>
  focusedIndex?: number
}

const COLUMNS: ColumnConfig<ChartOfAccount>[] = [
  { key: 'code', render: (account) => account.code },
  { key: 'name', render: (account) => account.name },
]

export function ChartOfAccountsTable({
  accounts,
  loading,
  selectedId,
  onSelect,
  listRef,
  focusedIndex = -1,
}: Props) {
  const fallbackRef = useRef<HTMLDivElement | null>(null)
  return (
    <EntityTable
      rows={accounts}
      columns={COLUMNS}
      loading={loading}
      total={accounts.length}
      label="Accounts"
      selectedId={selectedId ?? undefined}
      focusedIndex={focusedIndex}
      onSelect={onSelect}
      listRef={listRef ?? fallbackRef}
      dataAttr="account"
    />
  )
}
```

- [ ] **Step 6: Run the COA page tests**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx --no-coverage
```

Expected: All tests pass. The `getRenderedAccountCodes` helper now queries `tr[data-index]` instead of `tr[data-account-index]` — both attributes exist on the row (`EntityTable` always writes `data-index`; `dataAttr="account"` adds `data-account-index` as well), so either selector works. If tests fail due to missing Provider, ensure the `renderPage` wrapper includes the Redux `Provider` as added in Step 1.

- [ ] **Step 7: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add \
  frontend/src/pages/accounting/hooks/useChartOfAccountsWorkspace.ts \
  frontend/src/pages/accounting/ChartOfAccountsPage.tsx \
  frontend/src/pages/accounting/components/ChartOfAccountsTable.tsx \
  frontend/src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx
git commit -m "feat(accounting): migrate ChartOfAccounts to useEntityWorkspace with Redux selection and keyboard nav"
```

---

## Task 5: Refactor `usePurchaseOrdersWorkspace` to use `useEntityWorkspace`

**Files:**
- Modify: `frontend/src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.ts`
- Test: `frontend/src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.test.tsx`

- [ ] **Step 1: Write new tests for keyboard nav and highlight**

Add to `frontend/src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.test.tsx`:

```typescript
describe('highlight deep-link', () => {
  it('selects and focuses order matching ?highlight= param', async () => {
    const { result, store } = renderPurchaseOrdersWorkspace('/purchasing/orders?highlight=po-2')

    const orders = [makePurchaseOrder('po-1') as any, makePurchaseOrder('po-2') as any]

    // Re-render with orders loaded
    result.rerender()

    await waitFor(() => {
      const selected = selectSelectedPurchaseOrder(store.getState())
      expect(selected?.id).toBe('po-2')
    })
  })
})

describe('keyboard navigation', () => {
  it('exposes focusedIndex from useEntityWorkspace', () => {
    const { result } = renderPurchaseOrdersWorkspace('/purchasing/orders')
    expect(typeof result.current.focusedOrderIndex).toBe('number')
  })
})
```

- [ ] **Step 2: Run tests to verify new tests fail (or confirm existing tests still pass)**

```bash
cd frontend && npx vitest run src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.test.tsx --no-coverage
```

Note current pass/fail baseline.

- [ ] **Step 3: Rewrite `usePurchaseOrdersWorkspace` to wrap `useEntityWorkspace`**

Replace `frontend/src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.ts` with the following. The key changes: remove manual `focusedOrderIndex`, scroll `useEffect`, partial `useKeyboardShortcuts`, auto-select `useEffect`s, and pending-highlight `useEffect`s. Add `useEntityWorkspace` call. All domain handlers are preserved verbatim.

```typescript
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import type { AppDispatch } from '@/store'
import { useLazyGetJournalEntriesQuery } from '@/store/api/accountingApi'
import {
  useDeletePurchaseOrderMutation,
  useLazyGetPurchaseOrderQuery,
  useMarkPurchaseOrderAsUnpaidMutation,
  useReceiveGoodsMutation,
  useRecordOrderPaymentsMutation,
  useReturnGoodsMutation,
} from '@/store/api/purchasingApi'
import {
  setSelectedPurchaseOrder,
  updatePurchaseOrderInPlace,
} from '@/store/slices/purchasingSlice'
import type { PurchaseOrder } from '@/types'

export interface PurchaseOrdersSorting {
  sortBy: string
  sortOrder: 'asc' | 'desc'
}

export interface PurchaseJournalEntryRef {
  referenceNumber: string
  sourceType: string
  sourceId: string
}

export interface UsePurchaseOrdersWorkspaceConfig {
  dispatch: AppDispatch
  purchaseOrders: PurchaseOrder[]
  selectedOrder: PurchaseOrder | null
  refetchOrders: () => void
}

export function usePurchaseOrdersWorkspace({
  dispatch,
  purchaseOrders,
  selectedOrder,
  refetchOrders,
}: UsePurchaseOrdersWorkspaceConfig) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const [searchParams, setSearchParams] = useSearchParams()

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [orderToDelete, setOrderToDelete] = useState<PurchaseOrder | null>(null)
  const [deletedOrdersDialogOpen, setDeletedOrdersDialogOpen] = useState(false)
  const [blockedDialogOpen, setBlockedDialogOpen] = useState(false)
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [blockedDialogType, setBlockedDialogType] = useState<'edit' | 'delete'>('edit')
  const [isLoading, setIsLoading] = useState(false)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [paymentDialogOrder, setPaymentDialogOrder] = useState<PurchaseOrder | null>(null)
  const [journalEntryRef, setJournalEntryRef] = useState<PurchaseJournalEntryRef | null>(null)
  const [journalEntryRefLoading, setJournalEntryRefLoading] = useState(false)

  const [fetchPurchaseOrder] = useLazyGetPurchaseOrderQuery()
  const [fetchJournalEntries] = useLazyGetJournalEntriesQuery()
  const [receiveGoods] = useReceiveGoodsMutation()
  const [returnGoods] = useReturnGoodsMutation()
  const [markPurchaseOrderAsUnpaid] = useMarkPurchaseOrderAsUnpaidMutation()
  const [recordOrderPayments] = useRecordOrderPaymentsMutation()
  const [deletePurchaseOrder] = useDeletePurchaseOrderMutation()

  const workspace = useEntityWorkspace({
    entities: purchaseOrders,
    selectedEntity: selectedOrder,
    selectEntity: (order) => dispatch(setSelectedPurchaseOrder(order)),
    refetch: refetchOrders,
    navigate,
    highlightParam: 'highlight',
    routes: {
      create: '/purchasing/orders/create',
      edit: (id) => `/purchasing/orders/${id}/edit`,
    },
    notifications: { showSuccess, showError },
    deleteMutation: async (id) => {
      await deletePurchaseOrder(id).unwrap()
    },
    onEnter: () => {
      const idx = workspace.focusedIndex
      if (idx >= 0 && purchaseOrders[idx]) {
        navigate(`/purchasing/orders/${purchaseOrders[idx].id}/edit`)
      }
    },
    onEscape: () => {
      dispatch(setSelectedPurchaseOrder(null))
      setDeleteConfirmOpen(false)
      setBlockedDialogOpen(false)
      setDeletedOrdersDialogOpen(false)
    },
  })

  // Legacy ?poId= navigation param (cross-page navigation from GRN/VP pages)
  useEffect(() => {
    const poId = searchParams.get('poId')
    if (!poId || purchaseOrders.length === 0) {
      return
    }

    const order = purchaseOrders.find((candidate) => candidate.id === poId)
    if (order) {
      dispatch(setSelectedPurchaseOrder(order))
      workspace.setFocusedIndex(purchaseOrders.findIndex((candidate) => candidate.id === poId))
      setSearchParams({})
    }
  }, [dispatch, purchaseOrders, searchParams, setSearchParams, workspace])

  // Journal entry ref loading — domain-specific, stays here
  useEffect(() => {
    if (!selectedOrder?.id) {
      setJournalEntryRef(null)
      setJournalEntryRefLoading(false)
      return
    }

    const grnSources = (selectedOrder.goodsReceivedNotes || []).map((grn: any) => ({
      sourceType: 'goods_received_note',
      sourceId: grn.id,
    }))
    const paymentSources = (selectedOrder.vendorPayments || []).map((payment: any) => ({
      sourceType: 'vendor_payment',
      sourceId: payment.id,
    }))
    const sources = [...grnSources, ...paymentSources]

    if (sources.length === 0) {
      setJournalEntryRef(null)
      setJournalEntryRefLoading(false)
      return
    }

    let cancelled = false
    setJournalEntryRefLoading(true)

    ;(async () => {
      try {
        for (const source of sources) {
          const response = await fetchJournalEntries({
            sourceType: source.sourceType,
            sourceId: source.sourceId,
            sortBy: 'createdAt',
            sortOrder: 'DESC',
            limit: 1,
          }).unwrap()

          if (cancelled) return

          const entry = response.data?.[0]
          if (entry) {
            setJournalEntryRef({
              referenceNumber: entry.referenceNumber,
              sourceType: source.sourceType,
              sourceId: source.sourceId,
            })
            return
          }
        }
        if (!cancelled) setJournalEntryRef(null)
      } catch {
        if (!cancelled) setJournalEntryRef(null)
      } finally {
        if (!cancelled) setJournalEntryRefLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [
    fetchJournalEntries,
    selectedOrder?.goodsReceivedNotes,
    selectedOrder?.id,
    selectedOrder?.vendorPayments,
  ])

  const handleOrderSelect = useCallback(async (order: PurchaseOrder) => {
    workspace.handleSelect(order)
    try {
      const freshOrder = await fetchPurchaseOrder(order.id).unwrap()
      dispatch(setSelectedPurchaseOrder(freshOrder))
      dispatch(updatePurchaseOrderInPlace(freshOrder))
    } catch {
      dispatch(setSelectedPurchaseOrder(order))
    }
  }, [dispatch, fetchPurchaseOrder, workspace])

  const selectAfterDelete = useCallback((deletedId: string) => {
    const deletedIndex = purchaseOrders.findIndex((order) => order.id === deletedId)
    if (purchaseOrders.length > 1) {
      const nextIndex = deletedIndex > 0 ? deletedIndex - 1 : 0
      const nextOrder =
        purchaseOrders[nextIndex].id === deletedId
          ? purchaseOrders[nextIndex + 1]
          : purchaseOrders[nextIndex]
      dispatch(setSelectedPurchaseOrder(nextOrder))
      workspace.setFocusedIndex(nextIndex)
    } else {
      dispatch(setSelectedPurchaseOrder(null))
      workspace.setFocusedIndex(-1)
    }
  }, [dispatch, purchaseOrders, workspace])

  const handleReceive = useCallback(async () => {
    if (!selectedOrder || !selectedOrder.items || selectedOrder.items.length === 0) {
      showError('No items to receive in this order')
      return
    }
    if (selectedOrder.goodsReceivedNotes && selectedOrder.goodsReceivedNotes.length > 0) {
      const grn = selectedOrder.goodsReceivedNotes[0]
      if (grn.status !== 'draft') {
        showError('GRN must be in draft status to receive goods')
        return
      }
    }
    try {
      const response = await receiveGoods(selectedOrder.id).unwrap()
      showSuccess('Goods received successfully. Product quantities updated.')
      const updatedOrder = (response as any).data || response
      if (updatedOrder) dispatch(setSelectedPurchaseOrder(updatedOrder))
      refetchOrders()
    } catch (error: any) {
      showError(error?.response?.data?.message || 'Failed to receive goods')
    }
  }, [dispatch, receiveGoods, refetchOrders, selectedOrder, showError, showSuccess])

  const handleReturn = useCallback(async () => {
    if (!selectedOrder || !selectedOrder.goodsReceivedNotes || selectedOrder.goodsReceivedNotes.length === 0) {
      showError('No GRN found to return')
      return
    }
    const grn = selectedOrder.goodsReceivedNotes[0]
    if (grn.status !== 'received') {
      showError('GRN must be in received status to return goods')
      return
    }
    try {
      const response = await returnGoods(selectedOrder.id).unwrap()
      showSuccess('Goods returned successfully. Product quantities reverted.')
      const updatedOrder = (response as any).data || response
      if (updatedOrder) dispatch(setSelectedPurchaseOrder(updatedOrder))
      refetchOrders()
    } catch (error: any) {
      showError(error?.response?.data?.message || 'Failed to return goods')
    }
  }, [dispatch, refetchOrders, returnGoods, selectedOrder, showError, showSuccess])

  const handleEditClick = useCallback(() => {
    if (!selectedOrder) return
    const isReceived =
      selectedOrder.goodsReceivedNotes &&
      selectedOrder.goodsReceivedNotes.length > 0 &&
      selectedOrder.goodsReceivedNotes[0].status === 'received'
    const isPaid = selectedOrder.vendorPayments && selectedOrder.vendorPayments.length > 0
    if (isReceived || isPaid) {
      setBlockedDialogType('edit')
      setBlockedDialogOpen(true)
    } else {
      navigate(`/purchasing/orders/${selectedOrder.id}/edit`)
    }
  }, [navigate, selectedOrder])

  const handleReturnAndEdit = useCallback(async () => {
    if (!selectedOrder) return
    setIsLoading(true)
    try {
      const response = await returnGoods(selectedOrder.id).unwrap()
      showSuccess('Goods returned successfully. You can now edit the order.')
      const updatedOrder = (response as any).data || response
      if (updatedOrder) dispatch(setSelectedPurchaseOrder(updatedOrder))
      setBlockedDialogOpen(false)
      refetchOrders()
      navigate(`/purchasing/orders/${selectedOrder.id}/edit`)
    } catch (error: any) {
      showError(error?.response?.data?.message || 'Failed to return goods')
    } finally {
      setIsLoading(false)
    }
  }, [dispatch, navigate, refetchOrders, returnGoods, selectedOrder, showError, showSuccess])

  const handleReturnOnly = useCallback(async () => {
    if (!selectedOrder) return
    setIsLoading(true)
    try {
      const response = await returnGoods(selectedOrder.id).unwrap()
      showSuccess('Goods returned successfully. Product quantities reverted.')
      const updatedOrder = (response as any).data || response
      if (updatedOrder) dispatch(setSelectedPurchaseOrder(updatedOrder))
      setBlockedDialogOpen(false)
      refetchOrders()
    } catch (error: any) {
      showError(error?.response?.data?.message || 'Failed to return goods')
    } finally {
      setIsLoading(false)
    }
  }, [dispatch, refetchOrders, returnGoods, selectedOrder, showError, showSuccess])

  const handleUnpayAndEdit = useCallback(async () => {
    if (!selectedOrder) return
    setIsLoading(true)
    try {
      const isReceived =
        selectedOrder.goodsReceivedNotes &&
        selectedOrder.goodsReceivedNotes.length > 0 &&
        selectedOrder.goodsReceivedNotes[0].status === 'received'
      if (isReceived) {
        await returnGoods(selectedOrder.id).unwrap()
        const unpayResponse = await markPurchaseOrderAsUnpaid(selectedOrder.id).unwrap()
        showSuccess('Goods returned and payment deleted successfully. You can now edit the order.')
        const unpayData: any = (unpayResponse as any).data || unpayResponse
        const updatedOrder = unpayData.data || unpayData
        if (updatedOrder?.id) dispatch(setSelectedPurchaseOrder({ ...(updatedOrder as any), vendorPayments: [] }))
      } else {
        const unpayResponse = await markPurchaseOrderAsUnpaid(selectedOrder.id).unwrap()
        showSuccess('Payment deleted successfully. You can now edit the order.')
        const unpayData: any = (unpayResponse as any).data || unpayResponse
        const updatedOrder = unpayData.data || unpayData
        if (updatedOrder?.id) dispatch(setSelectedPurchaseOrder({ ...(updatedOrder as any), vendorPayments: [] }))
      }
      setBlockedDialogOpen(false)
      refetchOrders()
      navigate(`/purchasing/orders/${selectedOrder.id}/edit`)
    } catch (error: any) {
      showError(error?.response?.data?.message || 'Failed to prepare order for editing')
    } finally {
      setIsLoading(false)
    }
  }, [dispatch, markPurchaseOrderAsUnpaid, navigate, refetchOrders, returnGoods, selectedOrder, showError, showSuccess])

  const handleReturnAndDelete = useCallback(async () => {
    if (!selectedOrder) return
    setIsLoading(true)
    try {
      await returnGoods(selectedOrder.id).unwrap()
      await deletePurchaseOrder(selectedOrder.id).unwrap()
      showSuccess('Goods returned and purchase order deleted successfully.')
      setBlockedDialogOpen(false)
      selectAfterDelete(selectedOrder.id)
      refetchOrders()
    } catch (error: any) {
      showError(error?.response?.data?.message || 'Failed to return and delete order')
    } finally {
      setIsLoading(false)
    }
  }, [deletePurchaseOrder, refetchOrders, returnGoods, selectAfterDelete, selectedOrder, showError, showSuccess])

  const handleUnpayAndDelete = useCallback(async () => {
    if (!selectedOrder) return
    setIsLoading(true)
    try {
      const isReceived =
        selectedOrder.goodsReceivedNotes &&
        selectedOrder.goodsReceivedNotes.length > 0 &&
        selectedOrder.goodsReceivedNotes[0].status === 'received'
      if (isReceived) await returnGoods(selectedOrder.id).unwrap()
      await markPurchaseOrderAsUnpaid(selectedOrder.id).unwrap()
      await deletePurchaseOrder(selectedOrder.id).unwrap()
      showSuccess(
        isReceived
          ? 'Goods returned, payment deleted, and purchase order deleted successfully.'
          : 'Payment deleted and purchase order deleted successfully.',
      )
      setBlockedDialogOpen(false)
      selectAfterDelete(selectedOrder.id)
      refetchOrders()
    } catch (error: any) {
      showError(error?.response?.data?.message || 'Failed to prepare and delete order')
    } finally {
      setIsLoading(false)
    }
  }, [deletePurchaseOrder, markPurchaseOrderAsUnpaid, refetchOrders, returnGoods, selectAfterDelete, selectedOrder, showError, showSuccess])

  const handleUnpay = useCallback(async () => {
    if (!selectedOrder) return
    setIsLoading(true)
    try {
      const response = await markPurchaseOrderAsUnpaid(selectedOrder.id).unwrap()
      showSuccess('Payment deleted successfully')
      const responseData: any = (response as any).data || response
      const updatedOrder = responseData.data || responseData
      if (updatedOrder?.id) dispatch(setSelectedPurchaseOrder({ ...(updatedOrder as any), vendorPayments: [], paidAmount: 0 }))
      refetchOrders()
    } catch (error: any) {
      if (error?.response?.status === 404) {
        showError('No payment found for this purchase order')
      } else {
        showError(error?.response?.data?.message || 'Failed to delete payment')
      }
    } finally {
      setIsLoading(false)
    }
  }, [dispatch, markPurchaseOrderAsUnpaid, refetchOrders, selectedOrder, showError, showSuccess])

  const handleOpenPaymentDialog = useCallback((order: PurchaseOrder) => {
    setPaymentDialogOrder(order)
    setPaymentDialogOpen(true)
  }, [])

  const handleRecordPayments = useCallback(async (
    payments: { paymentMethodId: string; amount: number; reference?: string }[],
  ) => {
    if (!selectedOrder) return
    const response = await recordOrderPayments({
      purchaseOrderId: selectedOrder.id,
      payments,
    }).unwrap()
    const responseData: any = (response as any).data || response
    const updatedOrder = responseData.data || responseData
    if (updatedOrder?.id) dispatch(setSelectedPurchaseOrder(updatedOrder))
    refetchOrders()
    showSuccess('Payment recorded successfully.')
  }, [dispatch, recordOrderPayments, refetchOrders, selectedOrder, showSuccess])

  const handleDeleteClick = useCallback(() => {
    if (!selectedOrder) return
    const isReceived =
      selectedOrder.goodsReceivedNotes &&
      selectedOrder.goodsReceivedNotes.length > 0 &&
      selectedOrder.goodsReceivedNotes[0].status === 'received'
    const isPaid = selectedOrder.vendorPayments && selectedOrder.vendorPayments.length > 0
    if (isReceived || isPaid) {
      setBlockedDialogType('delete')
      setBlockedDialogOpen(true)
    } else {
      setOrderToDelete(selectedOrder)
      setDeleteConfirmOpen(true)
    }
  }, [selectedOrder])

  const handleDeleteConfirm = useCallback(async (order: PurchaseOrder | null) => {
    if (!order) return
    try {
      await deletePurchaseOrder(order.id).unwrap()
      showSuccess('Purchase order deleted successfully')
      setDeleteConfirmOpen(false)
      setOrderToDelete(null)
      selectAfterDelete(order.id)
      refetchOrders()
    } catch (error: any) {
      showError(error?.response?.data?.message || 'Failed to delete purchase order')
    }
  }, [deletePurchaseOrder, refetchOrders, selectAfterDelete, showError, showSuccess])

  const navigateToGoodsReceived = useCallback((grnId: string) => {
    navigate(`/purchasing/goods-received?grnId=${grnId}`)
  }, [navigate])

  const navigateToVendorPayment = useCallback((paymentId: string) => {
    navigate(`/purchasing/vendor-payments?vpId=${paymentId}`)
  }, [navigate])

  const navigateToJournalEntry = useCallback(() => {
    if (!journalEntryRef) return
    navigate(`/accounting/journal-entries?sourceType=${journalEntryRef.sourceType}&sourceId=${journalEntryRef.sourceId}`)
  }, [journalEntryRef, navigate])

  return {
    ...workspace,
    focusedOrderIndex: workspace.focusedIndex,
    orderListRef: workspace.listRef,
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    orderToDelete,
    setOrderToDelete,
    deletedOrdersDialogOpen,
    setDeletedOrdersDialogOpen,
    blockedDialogOpen,
    setBlockedDialogOpen,
    printDialogOpen,
    setPrintDialogOpen,
    blockedDialogType,
    isLoading,
    paymentDialogOpen,
    setPaymentDialogOpen,
    paymentDialogOrder,
    journalEntryRef,
    journalEntryRefLoading,
    handleOrderSelect,
    handleReceive,
    handleReturn,
    handleEditClick,
    handleReturnAndEdit,
    handleReturnOnly,
    handleUnpayAndEdit,
    handleReturnAndDelete,
    handleUnpayAndDelete,
    handleUnpay,
    handleOpenPaymentDialog,
    handleRecordPayments,
    handleDeleteClick,
    handleDeleteConfirm,
    navigateToGoodsReceived,
    navigateToVendorPayment,
    navigateToJournalEntry,
  }
}
```

- [ ] **Step 4: Run the PO workspace tests**

```bash
cd frontend && npx vitest run src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.test.tsx --no-coverage
```

Expected: All existing tests pass. New highlight and keyboard nav tests pass.

- [ ] **Step 5: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.ts \
        frontend/src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.test.tsx
git commit -m "feat(purchasing): refactor usePurchaseOrdersWorkspace to wrap useEntityWorkspace"
```

---

## Task 6: Remove manual highlight effects from remaining outer hooks

Remove the duplicated highlight `useEffect`s from five hooks and replace with config options on `useEntityWorkspace`. Each hook change is small — do them all in one commit.

**Files:**
- Modify: `frontend/src/pages/sales/hooks/useOrdersWorkspace.ts`
- Modify: `frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts`
- Modify: `frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts`
- Modify: `frontend/src/pages/purchasing/hooks/useGRNWorkspace.ts`
- Modify: `frontend/src/pages/purchasing/hooks/useVendorPaymentsWorkspace.ts`

- [ ] **Step 1: Update `useOrdersWorkspace`**

In `frontend/src/pages/sales/hooks/useOrdersWorkspace.ts`:

1. Add `highlightParam: 'highlight'` to the `useEntityWorkspace` config object (lines 92–120).

2. Delete the `useEffect` that clears the `?highlight=` param (lines 159–168):
```typescript
// DELETE this entire block:
useEffect(() => {
  if (!searchParams.get('highlight')) {
    return
  }
  setSearchParams((prev) => {
    prev.delete('highlight')
    return prev
  }, { replace: true })
}, [searchParams, setSearchParams])
```

3. Delete the `pendingOrderToSelect` resolution `useEffect` (lines 290–304):
```typescript
// DELETE this entire block:
useEffect(() => {
  if (!pendingOrderToSelect || orders.length === 0) {
    return
  }
  const orderIndex = orders.findIndex((item) => item.id === pendingOrderToSelect)
  if (orderIndex >= 0) {
    dispatch(setSelectedOrder(orders[orderIndex]))
    workspace.setFocusedIndex(orderIndex)
    processedHighlightRef.current = pendingOrderToSelect
    userHasNavigatedRef.current = false
    setPendingOrderToSelect(null)
    void triggerGetSalesOrder(orders[orderIndex].id).unwrap().then((order) => dispatch(setSelectedOrder(order)))
  }
}, [dispatch, orders, pendingOrderToSelect, triggerGetSalesOrder, workspace])
```

4. Remove `pendingOrderToSelect` state and its initializer (`searchParams.get('highlight')`), and `processedHighlightRef`, since `useEntityWorkspace` now handles this. Also remove `searchParams`/`setSearchParams` from `useSearchParams()` if they are only used for highlight (verify no other usage in the file first — `useSearchParams` is imported from react-router-dom).

> **Note:** `useOrdersWorkspace` has significant remaining complexity (stale order refresh, index sync effects). Only remove the two effects listed above and the state/refs that become unused as a result. Leave all other effects untouched.

- [ ] **Step 2: Update `usePaymentsWorkspace`**

In `frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts`:

1. Add to `useEntityWorkspace` config:
```typescript
highlightParam: 'highlight',
locationStateHighlightKey: 'highlightPaymentId',
```

2. Delete the `?highlight=` `useEffect` (lines 187–202):
```typescript
// DELETE:
useEffect(() => {
  const highlightId = searchParams.get('highlight')
  if (!highlightId || payments.length === 0) { return }
  const index = payments.findIndex((payment) => payment.id === highlightId)
  if (index >= 0) {
    dispatch(setSelectedPayment(payments[index] as any))
    setFocusedIndex(index)
    setSearchParams((prev) => { prev.delete('highlight'); return prev }, { replace: true })
  }
}, [dispatch, payments, searchParams, setFocusedIndex, setSearchParams])
```

3. Delete the `location.state` `useEffect` (lines 204–216):
```typescript
// DELETE:
useEffect(() => {
  const state = location.state as { highlightPaymentId?: string } | null
  if (!state?.highlightPaymentId || payments.length === 0) { return }
  const index = payments.findIndex((payment) => payment.id === state.highlightPaymentId)
  if (index >= 0) {
    dispatch(setSelectedPayment(payments[index] as any))
    setFocusedIndex(index)
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }
}, [dispatch, location.state, payments, setFocusedIndex])
```

4. Delete `hasRestoredSelection` ref and its `useEffect` (lines 175–185) — `useEntityWorkspace`'s auto-select already handles this.

5. Remove `searchParams`/`setSearchParams` from the hook if only used for highlight. Remove `location` from `useLocation()` if only used for highlight state.

- [ ] **Step 3: Update `useInvoicesWorkspace`**

In `frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts`:

1. Add to `useEntityWorkspace` config:
```typescript
locationStateHighlightKey: 'highlightInvoice',
```

   The Invoices hook uses two state keys: `highlightInvoice` (full object) and `highlightInvoiceId` (string). `useEntityWorkspace` handles both since it checks if the value is a string (id) or object (entity with `.id`). The `highlightInvoice` key covers the object case; add a second call for the id case by also adding:
```typescript
// In the useEntityWorkspace config — pass only one key. For the second key (highlightInvoiceId),
// keep a minimal manual useEffect since useEntityWorkspace only accepts one locationStateHighlightKey:
```

   Actually, keep a small residual `useEffect` for `highlightInvoiceId` only (the string-id fallback):
```typescript
useEffect(() => {
  const state = location.state as { highlightInvoiceId?: string } | null
  if (!state?.highlightInvoiceId || invoices.length === 0) return
  const index = invoices.findIndex((invoice) => invoice.id === state.highlightInvoiceId)
  if (index >= 0) {
    dispatch(setSelectedInvoice(invoices[index] as any))
    workspace.setFocusedIndex(index)
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }
}, [dispatch, invoices, location.state, workspace])
```

2. Delete the combined `location.state` `useEffect` (lines 186–207) — replace with `locationStateHighlightKey: 'highlightInvoice'` config + the small `highlightInvoiceId` residual above.

3. Delete `hasRestoredSelection` ref and its `useEffect` (lines 176–184).

- [ ] **Step 4: Update `useGRNWorkspace`**

In `frontend/src/pages/purchasing/hooks/useGRNWorkspace.ts`:

1. Add to `useEntityWorkspace` config:
```typescript
highlightParam: 'grnId',
```

2. Delete the `?grnId=` `useEffect` (lines 108–124):
```typescript
// DELETE:
useEffect(() => {
  const grnId = searchParams.get('grnId')
  if (!grnId || userHasNavigatedRef.current || grns.length === 0) { return }
  const grn = grns.find((item) => item.id === grnId)
  if (grn) {
    dispatch(setSelectedGRN(grn))
    setFocusedIndex(grns.findIndex((item) => item.id === grn.id))
    setSearchParams((prev) => { prev.delete('grnId'); return prev }, { replace: true })
    userHasNavigatedRef.current = true
  }
}, [dispatch, grns, searchParams, setFocusedIndex, setSearchParams])
```

3. Remove `userHasNavigatedRef` if it is no longer used elsewhere in the hook. Also remove `searchParams` and `setSearchParams` from the hook config params if they were only used for the deleted effect — check if `GoodsReceivedPage` still needs to pass them and update accordingly.

4. Remove `userHasNavigatedRef` from the return object if removed.

- [ ] **Step 5: Update `useVendorPaymentsWorkspace`**

In `frontend/src/pages/purchasing/hooks/useVendorPaymentsWorkspace.ts`:

1. Add to `useEntityWorkspace` config:
```typescript
highlightParam: 'vpId',
```

2. Delete the `?vpId=` `useEffect` (lines 106–122):
```typescript
// DELETE:
useEffect(() => {
  const paymentId = searchParams.get('vpId')
  if (!paymentId || userHasNavigatedRef.current || payments.length === 0) { return }
  const payment = payments.find((item) => item.id === paymentId)
  if (payment) {
    dispatch(setSelectedVendorPayment(payment))
    setFocusedIndex(payments.findIndex((item) => item.id === payment.id))
    setSearchParams((prev) => { prev.delete('vpId'); return prev }, { replace: true })
    userHasNavigatedRef.current = true
  }
}, [dispatch, payments, searchParams, setFocusedIndex, setSearchParams])
```

3. Remove `userHasNavigatedRef`, `searchParams`, `setSearchParams` if no longer used. Remove from hook config params and update `VendorPaymentsPage` accordingly.

4. Remove `userHasNavigatedRef` from the return object if removed.

- [ ] **Step 6: Run tests for all five changed hooks**

```bash
cd frontend && npx vitest run \
  src/pages/sales/hooks/useOrdersWorkspace.test.tsx \
  src/pages/sales/hooks/usePaymentsWorkspace.test.tsx \
  src/pages/sales/hooks/useInvoicesWorkspace.test.tsx \
  --no-coverage
```

Expected: All pass. (GRN and VP hooks have no test files — covered by page-level tests.)

- [ ] **Step 7: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: No errors. If `GoodsReceivedPage` or `VendorPaymentsPage` passed `searchParams`/`setSearchParams` to the workspace hooks and they no longer accept them, remove those props from the call sites.

- [ ] **Step 8: Commit**

```bash
git add \
  frontend/src/pages/sales/hooks/useOrdersWorkspace.ts \
  frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts \
  frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts \
  frontend/src/pages/purchasing/hooks/useGRNWorkspace.ts \
  frontend/src/pages/purchasing/hooks/useVendorPaymentsWorkspace.ts
git commit -m "refactor(workspace): remove manual highlight effects, delegate to useEntityWorkspace"
```

---

## Task 7: Smoke-test all 8 pages

- [ ] **Step 1: Run the full relevant test suite**

```bash
cd frontend && npx vitest run \
  src/hooks/useEntityWorkspace.test.ts \
  src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx \
  src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.test.tsx \
  src/pages/sales/hooks/useOrdersWorkspace.test.tsx \
  src/pages/sales/hooks/usePaymentsWorkspace.test.tsx \
  src/pages/sales/hooks/useInvoicesWorkspace.test.tsx \
  --no-coverage
```

Expected: All pass.

- [ ] **Step 2: Run the broader purchasing and sales page tests**

```bash
cd frontend && npx vitest run \
  src/pages/purchasing/__tests__/ \
  src/pages/sales/ \
  --no-coverage
```

Expected: All pass.

- [ ] **Step 3: Final type-check**

```bash
cd frontend && npm run type-check
```

Expected: No errors.

- [ ] **Step 4: Open a PR**

```bash
gh pr create \
  --title "refactor(workspace): standardise all 8 master-detail pages on useEntityWorkspace (#448)" \
  --body "$(cat <<'EOF'
## Summary
- Adds `highlightParam` and `locationStateHighlightKey` to `useEntityWorkspace`, eliminating ~50 lines of duplicated highlight logic across 5 hooks
- Refactors `usePurchaseOrdersWorkspace` to wrap `useEntityWorkspace` (gains PageUp/Down, Home/End, Enter, Escape keyboard shortcuts)
- Adds `accountingSlice` Redux slice; refactors `useChartOfAccountsWorkspace` to use `useEntityWorkspace` (gains full keyboard nav + `?highlight=` deep-linking)
- Removes manual `useEffect`s for highlight/selection restore from: `useOrdersWorkspace`, `usePaymentsWorkspace`, `useInvoicesWorkspace`, `useGRNWorkspace`, `useVendorPaymentsWorkspace`
- All 8 master-detail pages now share identical infrastructure layer

Closes #448

## Test plan
- [ ] `useEntityWorkspace` tests pass including new `highlightParam` and `locationStateHighlightKey` branches
- [ ] COA page tests pass with Redux provider
- [ ] PO workspace tests pass
- [ ] Full `src/pages/purchasing` and `src/pages/sales` test suites pass
- [ ] `npm run type-check` passes
- [ ] Manual: navigate to Chart of Accounts, press arrow keys — selection moves
- [ ] Manual: navigate to Chart of Accounts, use `?highlight=<id>` in URL — account is highlighted
- [ ] Manual: navigate to Purchase Orders, press PageDown/PageUp — selection jumps 20 rows
- [ ] Manual: navigate to Sales Payments via link with `?highlight=<id>` — payment is highlighted

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Notes

**Spec coverage check:**
- ✅ `useEntityWorkspace` `highlightParam` — Tasks 1
- ✅ `useEntityWorkspace` `locationStateHighlightKey` — Task 2
- ✅ `accountingSlice` — Task 3
- ✅ COA `useEntityWorkspace` + Redux + keyboard nav + `?highlight=` — Task 4
- ✅ PO refactor — Task 5
- ✅ SO/Payments/Invoices/GRN/VP cleanup — Task 6
- ✅ Testing — Task 7
- ✅ Customers/Suppliers: no changes needed (already clean) — confirmed in spec, no task needed

**Ambiguity resolved:** `useGRNWorkspace` and `useVendorPaymentsWorkspace` accept `searchParams`/`setSearchParams` from their parent pages — Task 6 Steps 4–5 call out updating call sites if those params are removed.

**Invoices two-key highlight:** Kept a minimal residual `useEffect` for `highlightInvoiceId` since `useEntityWorkspace` accepts one `locationStateHighlightKey`. This is noted in Task 6 Step 3 — it's the minimal honest solution.
