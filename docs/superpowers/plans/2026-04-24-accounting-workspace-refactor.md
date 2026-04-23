# Accounting Workspace Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `useJournalEntriesWorkspace` and `useChartOfAccountsWorkspace` to wrap `useEntityWorkspace`, add a Redux `accountingSlice`, and enable full keyboard navigation + focusedIndex table highlighting on JE and COA pages.

**Architecture:** A new `accountingSlice` holds `selectedJournalEntry` and `selectedAccount` in Redux (matching `salesSlice`). Both workspace hooks are refactored to internally wrap `useEntityWorkspace`, accept Redux dispatch/state as config, and wire lazy-fetch on selection for JE. Both page components add Redux wiring and pass `focusedIndex` to their tables.

**Tech Stack:** React 19, Redux Toolkit, RTK Query, Vitest, `@testing-library/react`, `useEntityWorkspace` (`src/hooks/useEntityWorkspace.ts`), `useKeyboardShortcuts` (from `src/hooks/useSearchAndFilter.ts`)

---

## File Map

| File | Action |
|:---|:---|
| `frontend/src/store/slices/accountingSlice.ts` | Create |
| `frontend/src/store/slices/__tests__/accountingSlice.test.ts` | Create |
| `frontend/src/store/index.ts` | Modify — register `accountingSlice` |
| `frontend/src/pages/accounting/hooks/useJournalEntriesWorkspace.ts` | Modify — wrap `useEntityWorkspace` |
| `frontend/src/pages/accounting/hooks/useChartOfAccountsWorkspace.ts` | Modify — wrap `useEntityWorkspace` |
| `frontend/src/pages/accounting/JournalEntriesPage.tsx` | Modify — Redux wiring, pass `focusedIndex` |
| `frontend/src/pages/accounting/ChartOfAccountsPage.tsx` | Modify — Redux wiring, pass `focusedIndex` |
| `frontend/src/pages/accounting/components/JournalEntriesTable.tsx` | Modify — accept and use `focusedIndex` prop |
| `frontend/src/pages/accounting/components/ChartOfAccountsTable.tsx` | Modify — add and use `focusedIndex` prop |
| `frontend/src/pages/accounting/__tests__/JournalEntriesPage.test.tsx` | Modify — add Redux Provider |
| `frontend/src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx` | Modify — add Redux Provider |
| `frontend/src/pages/accounting/components/JournalEntriesTable.test.tsx` | Modify — add `focusedIndex` test |

---

## Task 1: Create `accountingSlice`

**Files:**
- Create: `frontend/src/store/slices/accountingSlice.ts`
- Create: `frontend/src/store/slices/__tests__/accountingSlice.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/src/store/slices/__tests__/accountingSlice.test.ts
import { describe, expect, it } from 'vitest'

import accountingReducer, {
  setSelectedJournalEntry,
  setSelectedAccount,
} from '@/store/slices/accountingSlice'

describe('accountingSlice', () => {
  it('sets selectedJournalEntry', () => {
    const entry = { id: 'je-1', referenceNumber: 'JE-001' } as any
    const state = accountingReducer(undefined, setSelectedJournalEntry(entry))
    expect(state.selectedJournalEntry).toEqual(entry)
  })

  it('clears selectedJournalEntry', () => {
    const entry = { id: 'je-1', referenceNumber: 'JE-001' } as any
    const withEntry = accountingReducer(undefined, setSelectedJournalEntry(entry))
    const cleared = accountingReducer(withEntry, setSelectedJournalEntry(null))
    expect(cleared.selectedJournalEntry).toBeNull()
  })

  it('sets selectedAccount', () => {
    const account = { id: 'acc-1', code: '1000', name: 'Cash' } as any
    const state = accountingReducer(undefined, setSelectedAccount(account))
    expect(state.selectedAccount).toEqual(account)
  })

  it('clears selectedAccount', () => {
    const account = { id: 'acc-1', code: '1000', name: 'Cash' } as any
    const withAccount = accountingReducer(undefined, setSelectedAccount(account))
    const cleared = accountingReducer(withAccount, setSelectedAccount(null))
    expect(cleared.selectedAccount).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/store/slices/__tests__/accountingSlice.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create the slice**

```typescript
// frontend/src/store/slices/accountingSlice.ts
import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { RootState } from '@/store'
import type { ChartOfAccount, JournalEntry } from '@/types'

interface AccountingState {
  selectedJournalEntry: JournalEntry | null
  selectedAccount: ChartOfAccount | null
}

const initialState: AccountingState = {
  selectedJournalEntry: null,
  selectedAccount: null,
}

const accountingSlice = createSlice({
  name: 'accounting',
  initialState,
  reducers: {
    setSelectedJournalEntry: (state, action: PayloadAction<JournalEntry | null>) => {
      state.selectedJournalEntry = action.payload
    },
    setSelectedAccount: (state, action: PayloadAction<ChartOfAccount | null>) => {
      state.selectedAccount = action.payload
    },
  },
})

export const { setSelectedJournalEntry, setSelectedAccount } = accountingSlice.actions

export const selectSelectedJournalEntry = (state: RootState) => state.accounting.selectedJournalEntry
export const selectSelectedAccount = (state: RootState) => state.accounting.selectedAccount

export default accountingSlice.reducer
```

- [ ] **Step 4: Register the slice in the store**

In `frontend/src/store/index.ts`, add the import after the existing slice imports:

```typescript
import accountingSlice from './slices/accountingSlice'
```

Then add it to `rootReducer`:

```typescript
const rootReducer = combineReducers({
  auth: authSlice,
  notifications: notificationSlice,
  inventory: inventorySlice,
  sales: salesSlice,
  purchasing: purchasingSlice,
  backup: backupSlice,
  auditLogs: auditLogSlice,
  priceLists: priceListSlice,
  accounting: accountingSlice,   // ← add this line
  [auditLogApiSlice.reducerPath]: auditLogApiSlice.reducer,
  // ... rest unchanged
})
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/store/slices/__tests__/accountingSlice.test.ts
```

Expected: 4 tests PASS

- [ ] **Step 6: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/store/slices/accountingSlice.ts \
        frontend/src/store/slices/__tests__/accountingSlice.test.ts \
        frontend/src/store/index.ts
git commit -m "feat(accounting): add accountingSlice with selectedJournalEntry and selectedAccount"
```

---

## Task 2: Update `JournalEntriesTable` to accept `focusedIndex`

**Files:**
- Modify: `frontend/src/pages/accounting/components/JournalEntriesTable.tsx`
- Modify: `frontend/src/pages/accounting/components/JournalEntriesTable.test.tsx`

- [ ] **Step 1: Write the failing test**

Add this test to the existing `describe('JournalEntriesTable')` block in `JournalEntriesTable.test.tsx`. The mock must expose `focusedIndex` so we can assert it:

```typescript
// Replace the existing EntityTable mock entirely:
vi.mock('@/components/common/EntityTable', () => ({
  default: ({ rows, loading, label, onSelect, focusedIndex }: any) => (
    <div>
      {loading && <div>Loading...</div>}
      {rows.length === 0 && <div>No {label} found</div>}
      {rows.map((row: any, index: number) => (
        <div
          key={row.id}
          onClick={() => onSelect(row)}
          data-testid={`row-${row.id}`}
          data-focused={index === focusedIndex ? 'true' : 'false'}
        >
          {row.referenceNumber}
        </div>
      ))}
    </div>
  ),
}))
```

Then add this test:

```typescript
it('passes focusedIndex to EntityTable', () => {
  render(
    <JournalEntriesTable
      {...defaultProps}
      entries={[makeEntry()]}
      focusedIndex={0}
    />,
  )
  expect(screen.getByTestId('row-1')).toHaveAttribute('data-focused', 'true')
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/pages/accounting/components/JournalEntriesTable.test.tsx
```

Expected: FAIL — `focusedIndex` prop not accepted by `JournalEntriesTable`

- [ ] **Step 3: Update `JournalEntriesTable` to accept and forward `focusedIndex`**

```typescript
// frontend/src/pages/accounting/components/JournalEntriesTable.tsx
import { useRef, type RefObject } from 'react'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import { JournalEntry } from '@/types'

const COLUMNS: ColumnConfig<JournalEntry>[] = [
  { key: 'referenceNumber', render: (entry) => entry.referenceNumber },
]

interface Props {
  entries: JournalEntry[]
  loading: boolean
  total: number
  selectedEntryId: string | null
  focusedIndex: number
  onSelect: (entry: JournalEntry) => void
  listRef?: RefObject<HTMLDivElement | null>
}

export function JournalEntriesTable({
  entries,
  loading,
  total,
  selectedEntryId,
  focusedIndex,
  onSelect,
  listRef,
}: Props) {
  const fallbackRef = useRef<HTMLDivElement | null>(null)

  return (
    <EntityTable
      rows={entries}
      columns={COLUMNS}
      loading={loading}
      total={total}
      label="Journal Entries"
      selectedId={selectedEntryId ?? undefined}
      focusedIndex={focusedIndex}
      onSelect={onSelect}
      listRef={listRef ?? fallbackRef}
      dataAttr="entry"
    />
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/pages/accounting/components/JournalEntriesTable.test.tsx
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/accounting/components/JournalEntriesTable.tsx \
        frontend/src/pages/accounting/components/JournalEntriesTable.test.tsx
git commit -m "feat(accounting): add focusedIndex prop to JournalEntriesTable"
```

---

## Task 3: Update `ChartOfAccountsTable` to accept `focusedIndex`

**Files:**
- Modify: `frontend/src/pages/accounting/components/ChartOfAccountsTable.tsx`

- [ ] **Step 1: Update `ChartOfAccountsTable` to accept and forward `focusedIndex`**

```typescript
// frontend/src/pages/accounting/components/ChartOfAccountsTable.tsx
import { useRef, type RefObject } from 'react'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import type { ChartOfAccount } from '@/types'

interface Props {
  accounts: ChartOfAccount[]
  loading: boolean
  selectedId: string | null
  focusedIndex: number
  onSelect: (item: ChartOfAccount) => void
  listRef?: RefObject<HTMLDivElement | null>
}

const COLUMNS: ColumnConfig<ChartOfAccount>[] = [
  { key: 'code', render: (account) => account.code },
  { key: 'name', render: (account) => account.name },
]

export function ChartOfAccountsTable({
  accounts,
  loading,
  selectedId,
  focusedIndex,
  onSelect,
  listRef,
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

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: errors about `ChartOfAccountsPage` passing no `focusedIndex` — that's expected, will be fixed in Task 5.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/components/ChartOfAccountsTable.tsx
git commit -m "feat(accounting): add focusedIndex prop to ChartOfAccountsTable"
```

---

## Task 4: Refactor `useJournalEntriesWorkspace`

**Files:**
- Modify: `frontend/src/pages/accounting/hooks/useJournalEntriesWorkspace.ts`

- [ ] **Step 1: Rewrite the hook**

```typescript
// frontend/src/pages/accounting/hooks/useJournalEntriesWorkspace.ts
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import type { AppDispatch } from '@/store'
import {
  useDeleteJournalEntryMutation,
  useLazyGetJournalEntryQuery,
  usePostJournalEntryMutation,
  useReverseJournalEntryMutation,
} from '@/store/api/accountingApi'
import { setSelectedJournalEntry } from '@/store/slices/accountingSlice'
import type { JournalEntry } from '@/types'
import { getErrorMessage } from '@/utils/errorMessage'

export const SOURCE_ROUTES: Record<string, (id: string) => string> = {
  sales_order: (id) => `/sales/orders?highlight=${id}`,
  payment: (id) => `/sales/payments?highlight=${id}`,
  goods_received_note: (id) => `/purchasing/goods-received?grnId=${id}`,
  vendor_payment: (id) => `/purchasing/vendor-payments?vpId=${id}`,
  expense: () => '/accounting/expenses',
  owner_equity_transaction: () => '/accounting/owner-equity',
  fund_transfer: () => '/accounting/fund-transfers',
  stock_adjustment: (id) => `/inventory/stock-adjustments/${id}/edit`,
}

interface UseJournalEntriesWorkspaceConfig {
  dispatch: AppDispatch
  entries: JournalEntry[]
  selectedEntry: JournalEntry | null
  refetch: () => void
}

export function useJournalEntriesWorkspace({
  dispatch,
  entries,
  selectedEntry,
  refetch,
}: UseJournalEntriesWorkspaceConfig) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()

  const [postTarget, setPostTarget] = useState<JournalEntry | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<JournalEntry | null>(null)
  const [reverseTarget, setReverseTarget] = useState<JournalEntry | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const [fetchEntry] = useLazyGetJournalEntryQuery()
  const [postJournalEntry] = usePostJournalEntryMutation()
  const [reverseJournalEntry] = useReverseJournalEntryMutation()
  const [deleteJournalEntry] = useDeleteJournalEntryMutation()

  const selectAndLoadEntry = useCallback(async (entry: JournalEntry) => {
    dispatch(setSelectedJournalEntry(entry))
    try {
      const fresh = await fetchEntry(entry.id).unwrap()
      dispatch(setSelectedJournalEntry(fresh))
    } catch {
      /* keep list-row data */
    }
  }, [dispatch, fetchEntry])

  const workspace = useEntityWorkspace({
    entities: entries,
    selectedEntity: selectedEntry,
    selectEntity: (entry) => {
      if (entry) {
        void selectAndLoadEntry(entry)
      } else {
        dispatch(setSelectedJournalEntry(null))
      }
    },
    refetch,
    navigate,
    routes: {
      create: '/accounting/journal-entries/new',
      edit: (id) => `/accounting/journal-entries/${id}/edit`,
    },
    notifications: { showSuccess: () => {}, showError: () => {} },
    deleteMutation: async () => {},
    onEscape: () => {
      workspace.setFocusedIndex(-1)
      dispatch(setSelectedJournalEntry(null))
      setPostTarget(null)
      setDeleteTarget(null)
      setReverseTarget(null)
    },
  })

  const handleConfirmPost = useCallback(async () => {
    if (!postTarget) return
    setActionLoading(true)
    try {
      await postJournalEntry(postTarget.id).unwrap()
      showSuccess(`Journal entry ${postTarget.referenceNumber} posted`)
      setPostTarget(null)
      dispatch(setSelectedJournalEntry(null))
      refetch()
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to post journal entry'))
    } finally {
      setActionLoading(false)
    }
  }, [dispatch, postTarget, postJournalEntry, refetch, showError, showSuccess])

  const handleConfirmReverse = useCallback(async (reverseDate: string) => {
    if (!reverseTarget) return
    setActionLoading(true)
    try {
      const result = await reverseJournalEntry({ id: reverseTarget.id, reverseDate }).unwrap()
      showSuccess(`Journal entry ${reverseTarget.referenceNumber} reversed`)
      setReverseTarget(null)
      dispatch(setSelectedJournalEntry(result))
      refetch()
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to reverse journal entry'))
    } finally {
      setActionLoading(false)
    }
  }, [dispatch, refetch, reverseJournalEntry, reverseTarget, showError, showSuccess])

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    setActionLoading(true)
    try {
      await deleteJournalEntry(deleteTarget.id).unwrap()
      showSuccess(`Journal entry ${deleteTarget.referenceNumber} deleted`)
      setDeleteTarget(null)
      dispatch(setSelectedJournalEntry(null))
      refetch()
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to delete journal entry'))
    } finally {
      setActionLoading(false)
    }
  }, [deleteJournalEntry, deleteTarget, dispatch, refetch, showError, showSuccess])

  return {
    ...workspace,
    selectedEntry,
    postTarget,
    setPostTarget,
    deleteTarget,
    setDeleteTarget,
    reverseTarget,
    setReverseTarget,
    actionLoading,
    handleConfirmPost,
    handleConfirmReverse,
    handleConfirmDelete,
    navigateToEdit: (entry: JournalEntry) => navigate(`/accounting/journal-entries/${entry.id}/edit`),
    navigateToCreate: () => navigate('/accounting/journal-entries/new'),
    navigateToSource: (sourceType: string, sourceId: string) => {
      const route = SOURCE_ROUTES[sourceType]
      if (route) navigate(route(sourceId))
    },
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: errors from `JournalEntriesPage` calling hook with old signature — expected, fixed in Task 5.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/hooks/useJournalEntriesWorkspace.ts
git commit -m "feat(accounting): refactor useJournalEntriesWorkspace to wrap useEntityWorkspace with Redux"
```

---

## Task 5: Update `JournalEntriesPage` to wire Redux

**Files:**
- Modify: `frontend/src/pages/accounting/JournalEntriesPage.tsx`
- Modify: `frontend/src/pages/accounting/__tests__/JournalEntriesPage.test.tsx`

- [ ] **Step 1: Update `JournalEntriesPage`**

```typescript
// frontend/src/pages/accounting/JournalEntriesPage.tsx
import React, { useCallback, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'

import AccountMappingWarning from '@/components/accounting/AccountMappingWarning'
import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { useGetJournalEntriesQuery } from '@/store/api/accountingApi'
import { selectSelectedJournalEntry } from '@/store/slices/accountingSlice'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'

import { JournalEntryContextHeader } from './components/JournalEntryContextHeader'
import { JournalEntriesDialogs } from './components/JournalEntriesDialogs'
import { JournalEntriesTable } from './components/JournalEntriesTable'
import { JournalEntryWorkspaceCard } from './components/JournalEntryWorkspaceCard'
import { useJournalEntriesWorkspace } from './hooks/useJournalEntriesWorkspace'

interface JEFilters {
  search: string
  status: string | null
  entryType: string | null
  period: PeriodValue
}

export const JournalEntriesPage: React.FC = () => {
  const [sortBy, setSortBy] = useState('createdAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const dispatch = useAppDispatch()
  const selectedEntry = useAppSelector(selectSelectedJournalEntry)
  const location = useLocation()

  const filterConfig = useMemo<FilterBarConfig<JEFilters>>(
    () => ({
      search: { placeholder: 'Search by reference or description...' },
      fields: [
        { field: 'period', label: 'Period', type: 'period' },
        { field: 'status', label: 'Status', type: 'journal-entry-status' },
        { field: 'entryType', label: 'Entry Type', type: 'journal-entry-type' },
      ],
      defaults: {
        search: '',
        status: null,
        entryType: null,
        period: { key: null, from: null, to: null },
      },
    }),
    [],
  )

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)

  const weekStartsOn = getStartOfWeek()
  const dateRange = useMemo(() => {
    const period = appliedFilters.period
    if (!period || period.key === null) return { fromDate: undefined, toDate: undefined }
    if (period.key === 'custom') return { fromDate: period.from ?? undefined, toDate: period.to ?? undefined }
    const resolved = getPeriodDateRange(period.key, weekStartsOn)
    return { fromDate: resolved.from, toDate: resolved.to }
  }, [appliedFilters.period, weekStartsOn])

  const urlParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const sourceTypeParam = urlParams.get('sourceType')
  const sourceIdParam = urlParams.get('sourceId')

  const queryArgs = useMemo(() => ({
    search: appliedFilters.search || undefined,
    status: appliedFilters.status ? appliedFilters.status.toUpperCase() : undefined,
    sourceType: sourceIdParam ? sourceTypeParam ?? undefined : appliedFilters.entryType || undefined,
    sourceId: sourceIdParam ?? undefined,
    startDate: dateRange.fromDate,
    endDate: dateRange.toDate,
    sortBy,
    sortOrder: sortOrder.toUpperCase() as 'ASC' | 'DESC',
  }), [appliedFilters, dateRange, sortBy, sortOrder, sourceIdParam, sourceTypeParam])

  const { data, isLoading, refetch } = useGetJournalEntriesQuery(queryArgs)
  const entries = data?.data ?? []
  const pagination = data?.meta

  const workspace = useJournalEntriesWorkspace({
    dispatch,
    entries,
    selectedEntry,
    refetch: () => { void refetch() },
  })

  const filterHandlers = useMemo(() => ({
    ...handlers,
    onSearchChange: (value: string) => {
      handlers.onSearchChange(value)
      workspace.setShouldPreserveSearchFocus(true)
    },
  }), [handlers, workspace])

  const handleSort = useCallback((field: string) => {
    setSortOrder((prev) => (sortBy === field && prev === 'desc' ? 'asc' : 'desc'))
    setSortBy(field)
  }, [sortBy])

  return (
    <>
      <AccountMappingWarning context="system" />
      <GenericListPage
        title="Journal Entries"
        subtitle="Manage and post accounting journal entries"
        primaryAction={{ label: 'New Journal Entry', onClick: workspace.navigateToCreate }}
        filterConfig={filterConfig}
        draftFilters={draftFilters}
        handlers={filterHandlers}
        hasActiveFilters={hasActiveFilters}
        searchInputRef={workspace.searchInputRef}
        sort={{ field: 'createdAt', sortBy, sortOrder, onSort: handleSort }}
        listSlot={(
          <JournalEntriesTable
            entries={entries}
            loading={isLoading}
            total={pagination?.total ?? entries.length}
            selectedEntryId={selectedEntry?.id ?? null}
            focusedIndex={workspace.focusedIndex}
            onSelect={workspace.handleSelect}
            listRef={workspace.listRef}
          />
        )}
        headerSlot={(
          <JournalEntryContextHeader
            selectedEntry={selectedEntry}
            onEdit={() => selectedEntry && workspace.navigateToEdit(selectedEntry)}
            onPost={() => selectedEntry && workspace.setPostTarget(selectedEntry)}
            onReverse={() => selectedEntry && workspace.setReverseTarget(selectedEntry)}
            onDelete={() => selectedEntry && workspace.setDeleteTarget(selectedEntry)}
            onViewSource={workspace.navigateToSource}
          />
        )}
        workspaceSlot={<JournalEntryWorkspaceCard selectedEntry={selectedEntry} />}
        dialogs={(
          <JournalEntriesDialogs
            postTarget={workspace.postTarget}
            deleteTarget={workspace.deleteTarget}
            reverseTarget={workspace.reverseTarget}
            actionLoading={workspace.actionLoading}
            onConfirmPost={workspace.handleConfirmPost}
            onConfirmDelete={workspace.handleConfirmDelete}
            onConfirmReverse={workspace.handleConfirmReverse}
            onCancelPost={() => workspace.setPostTarget(null)}
            onCancelDelete={() => workspace.setDeleteTarget(null)}
            onCancelReverse={() => workspace.setReverseTarget(null)}
          />
        )}
      />
    </>
  )
}

export default JournalEntriesPage
```

- [ ] **Step 2: Update `JournalEntriesPage.test.tsx` to provide Redux store**

The test needs a Redux `Provider` with `accountingSlice` so `useAppSelector` works. Replace the two `render(...)` wrappers that use `<BrowserRouter>` with a helper that also provides the store. Add these imports and the wrapper helper after the existing `beforeEach` mock setup:

```typescript
// Add these imports at the top of JournalEntriesPage.test.tsx:
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import accountingReducer from '@/store/slices/accountingSlice'

// Add this helper before the describe block:
function makeStore() {
  return configureStore({ reducer: { accounting: accountingReducer } })
}

function renderPage() {
  return render(
    <Provider store={makeStore()}>
      <BrowserRouter>
        <JournalEntriesPage />
      </BrowserRouter>
    </Provider>,
  )
}
```

Then replace all four `render(<BrowserRouter><JournalEntriesPage /></BrowserRouter>)` calls with `renderPage()`.

- [ ] **Step 3: Run existing JE page tests**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/JournalEntriesPage.test.tsx
```

Expected: all existing tests PASS

- [ ] **Step 4: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/accounting/JournalEntriesPage.tsx \
        frontend/src/pages/accounting/__tests__/JournalEntriesPage.test.tsx
git commit -m "feat(accounting): wire JournalEntriesPage to Redux accountingSlice with keyboard nav"
```

---

## Task 6: Refactor `useChartOfAccountsWorkspace`

**Files:**
- Modify: `frontend/src/pages/accounting/hooks/useChartOfAccountsWorkspace.ts`

- [ ] **Step 1: Rewrite the hook**

```typescript
// frontend/src/pages/accounting/hooks/useChartOfAccountsWorkspace.ts
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import type { AppDispatch } from '@/store'
import { useDeleteChartOfAccountMutation, useSeedDefaultChartOfAccountsMutation } from '@/store/api/accountingApi'
import { setSelectedAccount } from '@/store/slices/accountingSlice'
import type { ChartOfAccount } from '@/types'

interface UseChartOfAccountsWorkspaceConfig {
  dispatch: AppDispatch
  accounts: ChartOfAccount[]
  selectedAccount: ChartOfAccount | null
  refetch: () => void
}

export function useChartOfAccountsWorkspace({
  dispatch,
  accounts,
  selectedAccount,
  refetch,
}: UseChartOfAccountsWorkspaceConfig) {
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
    routes: {
      create: '',
      edit: () => '',
    },
    notifications: { showSuccess: () => {}, showError: () => {} },
    deleteMutation: async () => {},
    onEnter: () => {
      if (selectedAccount) {
        setFormDialogOpen(true)
      }
    },
    onEscape: () => {
      workspace.setFocusedIndex(-1)
      dispatch(setSelectedAccount(null))
      setFormDialogOpen(false)
      setDeleteTarget(null)
    },
  })

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await deleteChartOfAccount(deleteTarget.id).unwrap()
      showSuccess(`Account "${deleteTarget.name}" deleted successfully`)
      setDeleteTarget(null)
      if (selectedAccount?.id === deleteTarget.id) dispatch(setSelectedAccount(null))
      refetch()
    } catch (error: any) {
      showError(error || 'Failed to delete account')
    }
  }, [deleteChartOfAccount, deleteTarget, dispatch, refetch, selectedAccount?.id, showError, showSuccess])

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
    handleDelete,
    handleSeed,
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: errors from `ChartOfAccountsPage` calling hook with old signature — expected, fixed in Task 7.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/hooks/useChartOfAccountsWorkspace.ts
git commit -m "feat(accounting): refactor useChartOfAccountsWorkspace to wrap useEntityWorkspace with Redux"
```

---

## Task 7: Update `ChartOfAccountsPage` to wire Redux

**Files:**
- Modify: `frontend/src/pages/accounting/ChartOfAccountsPage.tsx`
- Modify: `frontend/src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx`

- [ ] **Step 1: Update `ChartOfAccountsPage`**

```typescript
// frontend/src/pages/accounting/ChartOfAccountsPage.tsx
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
  const dispatch = useAppDispatch()
  const selectedAccount = useAppSelector(selectSelectedAccount)
  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)
  const { data: hierarchyData, isLoading, error, refetch } = useGetChartOfAccountsHierarchyQuery()
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

  const workspace = useChartOfAccountsWorkspace({
    dispatch,
    accounts: filteredAccounts,
    selectedAccount,
    refetch: () => { void refetch() },
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
            focusedIndex={workspace.focusedIndex}
            onSelect={workspace.handleSelect}
            listRef={workspace.listRef}
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

- [ ] **Step 2: Update `ChartOfAccountsPage.test.tsx` to provide Redux store**

Add these imports at the top:

```typescript
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import accountingReducer from '@/store/slices/accountingSlice'
```

Add this helper before the `describe` block, replacing the existing `renderPage`:

```typescript
function makeStore() {
  return configureStore({ reducer: { accounting: accountingReducer } })
}

function renderPage() {
  return render(
    <Provider store={makeStore()}>
      <BrowserRouter>
        <ChartOfAccountsPage />
      </BrowserRouter>
    </Provider>,
  )
}
```

- [ ] **Step 3: Run COA page tests**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx
```

Expected: all existing tests PASS

- [ ] **Step 4: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/accounting/ChartOfAccountsPage.tsx \
        frontend/src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx
git commit -m "feat(accounting): wire ChartOfAccountsPage to Redux accountingSlice with keyboard nav"
```

---

## Task 8: Final verification

- [ ] **Step 1: Run all accounting-related tests**

```bash
cd frontend && npx vitest run \
  src/store/slices/__tests__/accountingSlice.test.ts \
  src/pages/accounting/__tests__/JournalEntriesPage.test.tsx \
  src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx \
  src/pages/accounting/components/JournalEntriesTable.test.tsx
```

Expected: all tests PASS

- [ ] **Step 2: Full type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 3: Lint**

```bash
cd frontend && npm run lint
```

Expected: no errors

- [ ] **Step 4: Commit (if any lint fixes were needed)**

```bash
git add -p
git commit -m "fix(accounting): lint fixes after workspace refactor"
```

Skip this step if lint was already clean.
