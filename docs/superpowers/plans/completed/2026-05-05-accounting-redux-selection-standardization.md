# Accounting Redux Selection Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate selection state for 6 accounting pages (Journal Entries, Expenses, Fund Transfers, Owner's Equity, Bank Reconciliations, Settlements) from local `useState` to Redux, adding `?highlight=ID` URL param support and consistent keyboard navigation.

**Architecture:** Expand `accountingSlice` to hold all 6 new entity selections (matching the `salesSlice` / `purchasingSlice` pattern). Each workspace hook accepts `dispatch: AppDispatch` and passes `(entity) => dispatch(setSelected*(entity))` as `selectEntity` to `useEntityWorkspace`. Each page reads selection via `useAppSelector` and passes `dispatch` to its workspace hook.

**Tech Stack:** React 19, Redux Toolkit, RTK Query, Vitest, `@testing-library/react`, `react-router-dom`

---

## File Map

| File | Change |
|------|--------|
| `frontend/src/store/slices/accountingSlice.ts` | Add 6 new selection fields, actions, selectors |
| `frontend/src/pages/accounting/hooks/useJournalEntriesWorkspace.ts` | Accept `dispatch`, wire Redux, add `highlightParam` |
| `frontend/src/pages/accounting/hooks/useExpensesWorkspace.ts` | Accept `dispatch`, wire Redux, add `highlightParam` |
| `frontend/src/pages/accounting/hooks/useFundTransfersWorkspace.ts` | Accept `dispatch`, wire Redux, add `highlightParam` |
| `frontend/src/pages/accounting/hooks/useOwnerEquityWorkspace.ts` | Accept `dispatch`, wire Redux, add `highlightParam` |
| `frontend/src/pages/accounting/hooks/useBankReconciliationsWorkspace.ts` | Accept `dispatch`, wire Redux, add `highlightParam` |
| `frontend/src/pages/accounting/hooks/useSettlementsWorkspace.ts` | Accept `dispatch`, wire Redux, add `highlightParam` |
| `frontend/src/pages/accounting/JournalEntriesPage.tsx` | Add `useAppDispatch` / `useAppSelector`, pass `dispatch` |
| `frontend/src/pages/accounting/ExpensesPage.tsx` | Add `useAppDispatch` / `useAppSelector`, pass `dispatch` |
| `frontend/src/pages/accounting/FundTransfersPage.tsx` | Add `useAppDispatch` / `useAppSelector`, pass `dispatch` |
| `frontend/src/pages/accounting/OwnerEquityPage.tsx` | Add `useAppDispatch` / `useAppSelector`, pass `dispatch` |
| `frontend/src/pages/accounting/BankReconciliationsPage.tsx` | Add `useAppDispatch` / `useAppSelector`, pass `dispatch` |
| `frontend/src/pages/accounting/SettlementsPage.tsx` | Add `useAppDispatch` / `useAppSelector`, pass `dispatch` |
| `frontend/src/pages/accounting/__tests__/JournalEntriesPage.test.tsx` | Add Redux store wrapper + `?highlight` test |
| `frontend/src/pages/accounting/__tests__/ExpensesPage.test.tsx` | Add Redux store wrapper + `?highlight` test |
| `frontend/src/pages/accounting/__tests__/FundTransfersPage.test.tsx` | Add Redux store wrapper + `?highlight` test |
| `frontend/src/pages/accounting/__tests__/OwnerEquityPage.test.tsx` | Add Redux store wrapper + `?highlight` test |
| `frontend/src/pages/accounting/__tests__/BankReconciliationsPage.test.tsx` | Add Redux store wrapper + `?highlight` test |
| `frontend/src/pages/accounting/__tests__/SettlementsPage.test.tsx` | Add Redux store wrapper + `?highlight` test |

---

## Task 1: Expand `accountingSlice` with 6 new entity selections

**Files:**
- Modify: `frontend/src/store/slices/accountingSlice.ts`

- [ ] **Step 1: Replace the entire file content**

```typescript
import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { RootState } from '@/store'
import type {
  BankReconciliation,
  ChartOfAccount,
  ExpenseRecord,
  FundTransfer,
  JournalEntry,
  OwnerEquityTransaction,
  Settlement,
} from '@/types'

interface AccountingState {
  selectedAccount: ChartOfAccount | null
  selectedJournalEntry: JournalEntry | null
  selectedExpense: ExpenseRecord | null
  selectedFundTransfer: FundTransfer | null
  selectedOwnerEquityTransaction: OwnerEquityTransaction | null
  selectedBankReconciliation: BankReconciliation | null
  selectedSettlement: Settlement | null
}

const initialState: AccountingState = {
  selectedAccount: null,
  selectedJournalEntry: null,
  selectedExpense: null,
  selectedFundTransfer: null,
  selectedOwnerEquityTransaction: null,
  selectedBankReconciliation: null,
  selectedSettlement: null,
}

const accountingSlice = createSlice({
  name: 'accounting',
  initialState,
  reducers: {
    setSelectedAccount: (state, action: PayloadAction<ChartOfAccount | null>) => {
      state.selectedAccount = action.payload
    },
    setSelectedJournalEntry: (state, action: PayloadAction<JournalEntry | null>) => {
      state.selectedJournalEntry = action.payload
    },
    setSelectedExpense: (state, action: PayloadAction<ExpenseRecord | null>) => {
      state.selectedExpense = action.payload
    },
    setSelectedFundTransfer: (state, action: PayloadAction<FundTransfer | null>) => {
      state.selectedFundTransfer = action.payload
    },
    setSelectedOwnerEquityTransaction: (state, action: PayloadAction<OwnerEquityTransaction | null>) => {
      state.selectedOwnerEquityTransaction = action.payload
    },
    setSelectedBankReconciliation: (state, action: PayloadAction<BankReconciliation | null>) => {
      state.selectedBankReconciliation = action.payload
    },
    setSelectedSettlement: (state, action: PayloadAction<Settlement | null>) => {
      state.selectedSettlement = action.payload
    },
  },
})

export const {
  setSelectedAccount,
  setSelectedJournalEntry,
  setSelectedExpense,
  setSelectedFundTransfer,
  setSelectedOwnerEquityTransaction,
  setSelectedBankReconciliation,
  setSelectedSettlement,
} = accountingSlice.actions

export const selectSelectedAccount = (state: RootState) => state.accounting.selectedAccount
export const selectSelectedJournalEntry = (state: RootState) => state.accounting.selectedJournalEntry
export const selectSelectedExpense = (state: RootState) => state.accounting.selectedExpense
export const selectSelectedFundTransfer = (state: RootState) => state.accounting.selectedFundTransfer
export const selectSelectedOwnerEquityTransaction = (state: RootState) => state.accounting.selectedOwnerEquityTransaction
export const selectSelectedBankReconciliation = (state: RootState) => state.accounting.selectedBankReconciliation
export const selectSelectedSettlement = (state: RootState) => state.accounting.selectedSettlement

export default accountingSlice.reducer
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "accountingSlice|error" | head -20
```

Expected: no errors mentioning `accountingSlice`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/store/slices/accountingSlice.ts
git commit -m "feat(accounting): expand accountingSlice with 6 entity selection fields"
```

---

## Task 2: Refactor `useJournalEntriesWorkspace` to use Redux

**Files:**
- Modify: `frontend/src/pages/accounting/hooks/useJournalEntriesWorkspace.ts`

- [ ] **Step 1: Replace the hook**

```typescript
import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useLazyGetJournalEntryQuery } from '@/store/api/accountingApi'
import type { AppDispatch } from '@/store'
import { setSelectedJournalEntry } from '@/store/slices/accountingSlice'
import { JournalEntry } from '@/types'

interface UseJournalEntriesWorkspaceConfig {
  entries: JournalEntry[]
  refetch: () => void
  dispatch: AppDispatch
  selectedEntry: JournalEntry | null
}

export function useJournalEntriesWorkspace({ entries, refetch, dispatch, selectedEntry }: UseJournalEntriesWorkspaceConfig) {
  const navigate = useNavigate()
  const [fetchEntry] = useLazyGetJournalEntryQuery()

  const workspace = useEntityWorkspace<JournalEntry>({
    entities: entries,
    selectedEntity: selectedEntry,
    selectEntity: (entry) => dispatch(setSelectedJournalEntry(entry)),
    refetch,
    navigate,
    highlightParam: 'highlight',
    routes: {
      create: '/accounting/journal-entries',
      edit: () => '/accounting/journal-entries',
    },
    notifications: { showSuccess: () => {}, showError: () => {} },
    deleteMutation: async () => {},
    onEnter: () => {},
    onEscape: () => {
      dispatch(setSelectedJournalEntry(null))
    },
  })

  const handleSelect = useCallback(async (entry: JournalEntry) => {
    workspace.handleSelect(entry)
    try {
      const fresh = await fetchEntry(entry.id).unwrap()
      dispatch(setSelectedJournalEntry(fresh))
    }
    catch { /* keep list-row data */ }
  }, [fetchEntry, workspace, dispatch])

  const navigateToSource = useCallback((sourceType: string, sourceId: string) => {
    const routes: Record<string, (id: string) => string> = {
      sales_order: (id) => `/sales/orders?highlight=${id}`,
      payment: (id) => `/sales/payments?highlight=${id}`,
      goods_received_note: (id) => `/purchasing/goods-received?grnId=${id}`,
      vendor_payment: (id) => `/purchasing/vendor-payments?vpId=${id}`,
      expense: () => `/accounting/expenses`,
      owner_equity_transaction: () => `/accounting/owner-equity`,
      fund_transfer: () => `/accounting/fund-transfers`,
      stock_adjustment: (id) => `/inventory/stock-adjustments/${id}/edit`,
    }
    const route = routes[sourceType]
    if (route) navigate(route(sourceId))
  }, [navigate])

  return {
    ...workspace,
    handleSelect,
    navigateToSource,
  }
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "useJournalEntries|error" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/hooks/useJournalEntriesWorkspace.ts
git commit -m "feat(accounting): migrate useJournalEntriesWorkspace selection to Redux"
```

---

## Task 3: Refactor `JournalEntriesPage` to use Redux selection

**Files:**
- Modify: `frontend/src/pages/accounting/JournalEntriesPage.tsx`

- [ ] **Step 1: Update imports — add `useAppDispatch`, `useAppSelector`, new selectors/actions**

Replace the existing imports block at the top of the file with:

```typescript
import React, { useCallback, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import AccountMappingWarning from '@/components/accounting/AccountMappingWarning'
import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { useGetJournalEntriesQuery } from '@/store/api/accountingApi'
import { selectSelectedJournalEntry } from '@/store/slices/accountingSlice'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'

import { JournalEntryContextHeader } from './components/JournalEntryContextHeader'
import { JournalEntriesTable } from './components/JournalEntriesTable'
import { JournalEntryWorkspaceCard } from './components/JournalEntryWorkspaceCard'
import { useJournalEntriesWorkspace } from './hooks/useJournalEntriesWorkspace'
```

- [ ] **Step 2: Add `dispatch` and `selectedEntry` from Redux inside the component, update `useJournalEntriesWorkspace` call**

Inside `JournalEntriesPage`, replace:
```typescript
  const workspace = useJournalEntriesWorkspace({ entries, refetch })
```
with:
```typescript
  const dispatch = useAppDispatch()
  const selectedEntry = useAppSelector(selectSelectedJournalEntry)
  const workspace = useJournalEntriesWorkspace({ entries, refetch, dispatch, selectedEntry })
```

- [ ] **Step 3: Update all `workspace.selectedEntry` references to use `selectedEntry` from Redux**

Replace every occurrence of `workspace.selectedEntry` in JSX with `selectedEntry`:

```tsx
        headerSlot={(
          <JournalEntryContextHeader
            selectedEntry={selectedEntry}
          />
        )}
        workspaceSlot={<JournalEntryWorkspaceCard selectedEntry={selectedEntry} />}
```

Also update the table slot:
```tsx
        listSlot={(
          <JournalEntriesTable
            entries={entries}
            loading={isLoading}
            total={pagination?.total ?? 0}
            selectedEntryId={selectedEntry?.id ?? null}
            focusedIndex={workspace.focusedIndex}
            onSelect={workspace.handleSelect}
            listRef={workspace.listRef}
          />
        )}
```

- [ ] **Step 4: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "JournalEntries|error" | head -20
```

Expected: no errors.

- [ ] **Step 5: Run existing tests**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/JournalEntriesPage.test.tsx 2>&1 | tail -20
```

Expected: all existing tests pass. If they fail because of missing Redux store, continue to Task 4 which fixes the tests.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/accounting/JournalEntriesPage.tsx
git commit -m "feat(accounting): wire JournalEntriesPage to Redux selection state"
```

---

## Task 4: Update `JournalEntriesPage` tests for Redux + add `?highlight` test

**Files:**
- Modify: `frontend/src/pages/accounting/__tests__/JournalEntriesPage.test.tsx`

- [ ] **Step 1: Add Redux store setup to the test file**

At the top of the file, after existing imports, add:

```typescript
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import accountingReducer, { selectSelectedJournalEntry } from '@/store/slices/accountingSlice'
```

Remove `BrowserRouter` from the existing import if present, since we'll use `MemoryRouter` going forward.

- [ ] **Step 2: Add `makeStore` helper and update `render` wrapper**

Add a helper before the `describe` block:

```typescript
function makeStore() {
  return configureStore({ reducer: { accounting: accountingReducer } })
}

function renderPage(initialUrl = '/accounting/journal-entries') {
  const store = makeStore()
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <JournalEntriesPage />
      </MemoryRouter>
    </Provider>
  )
  return { store }
}
```

Update all existing `render(<BrowserRouter>...` calls in the test file to use `renderPage()` instead.

- [ ] **Step 3: Add `?highlight` test at the end of the `describe` block**

```typescript
  it('auto-selects the entry matching the ?highlight= URL param', async () => {
    mockedApi.useGetJournalEntriesQuery.mockReturnValue({
      data: { data: [mockEntry], meta: { total: 1 } },
      isLoading: false,
      refetch: vi.fn(),
    })
    mockedApi.useLazyGetJournalEntryQuery.mockReturnValue([vi.fn().mockResolvedValue(mockEntry)])

    const { store } = renderPage('/accounting/journal-entries?highlight=1')

    await waitFor(() => {
      expect(selectSelectedJournalEntry(store.getState())?.id).toBe('1')
    })
  })
```

Also add `waitFor` to the existing imports if not already present:
```typescript
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
```

- [ ] **Step 4: Run the updated tests**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/JournalEntriesPage.test.tsx 2>&1 | tail -30
```

Expected: all tests pass including the new `?highlight` test.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/accounting/__tests__/JournalEntriesPage.test.tsx
git commit -m "test(accounting): add Redux store wrapper and highlight test for JournalEntriesPage"
```

---

## Task 5: Refactor `useExpensesWorkspace` to use Redux

**Files:**
- Modify: `frontend/src/pages/accounting/hooks/useExpensesWorkspace.ts`

- [ ] **Step 1: Replace the hook**

```typescript
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import {
  useDeleteExpenseMutation,
  usePostExpenseMutation,
} from '@/store/api/accountingApi'
import type { AppDispatch } from '@/store'
import { setSelectedExpense } from '@/store/slices/accountingSlice'
import type { ExpenseRecord } from '@/types'
import { getErrorMessage } from '@/utils/errorMessage'

export function useExpensesWorkspace(
  refetch: () => void,
  expenses: ExpenseRecord[] = [],
  dispatch: AppDispatch,
  selected: ExpenseRecord | null,
) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const [postTarget, setPostTarget] = useState<ExpenseRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ExpenseRecord | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ExpenseRecord | null>(null)

  const [postExpense] = usePostExpenseMutation()
  const [deleteExpense] = useDeleteExpenseMutation()

  const workspace = useEntityWorkspace<ExpenseRecord>({
    entities: expenses,
    selectedEntity: selected,
    selectEntity: (entity) => dispatch(setSelectedExpense(entity)),
    refetch,
    navigate,
    highlightParam: 'highlight',
    routes: {
      create: '/accounting/expenses',
      edit: () => '/accounting/expenses',
    },
    notifications: { showSuccess, showError },
    deleteMutation: async (id) => {
      await deleteExpense(id).unwrap()
    },
    onEnter: () => {
      if (selected) setFormOpen(true)
    },
    onEscape: () => {
      dispatch(setSelectedExpense(null))
      setPostTarget(null)
      setDeleteTarget(null)
    },
  })

  const handleConfirmPost = useCallback(async () => {
    if (!postTarget) return
    setActionLoading(true)
    try {
      await postExpense(postTarget.id).unwrap()
      showSuccess(`Expense ${postTarget.referenceNumber} posted`)
      setPostTarget(null)
      dispatch(setSelectedExpense(null))
      refetch()
    }
    catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to post expense'))
    }
    finally {
      setActionLoading(false)
    }
  }, [postTarget, postExpense, showSuccess, showError, refetch, dispatch])

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    setActionLoading(true)
    try {
      await deleteExpense(deleteTarget.id).unwrap()
      showSuccess(`Expense ${deleteTarget.referenceNumber} deleted`)
      setDeleteTarget(null)
      dispatch(setSelectedExpense(null))
      refetch()
    }
    catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to delete expense'))
    }
    finally {
      setActionLoading(false)
    }
  }, [deleteTarget, deleteExpense, showSuccess, showError, refetch, dispatch])

  return {
    focusedIndex: workspace.focusedIndex,
    listRef: workspace.listRef,
    searchInputRef: workspace.searchInputRef,
    formOpen,
    setFormOpen,
    editTarget,
    setEditTarget,
    postTarget,
    setPostTarget,
    deleteTarget,
    setDeleteTarget,
    actionLoading,
    handleSelect: workspace.handleSelect,
    handleConfirmPost,
    handleConfirmDelete,
  }
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "useExpenses|error" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/hooks/useExpensesWorkspace.ts
git commit -m "feat(accounting): migrate useExpensesWorkspace selection to Redux"
```

---

## Task 6: Refactor `ExpensesPage` to use Redux selection

**Files:**
- Modify: `frontend/src/pages/accounting/ExpensesPage.tsx`

- [ ] **Step 1: Update imports**

Add to the existing imports:
```typescript
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { selectSelectedExpense } from '@/store/slices/accountingSlice'
```

- [ ] **Step 2: Add `dispatch` and `selected` from Redux inside the component, update workspace call**

Inside `ExpensesPage`, replace:
```typescript
  const workspace = useExpensesWorkspace(() => {
    void refetch()
  }, rows)
```
with:
```typescript
  const dispatch = useAppDispatch()
  const selected = useAppSelector(selectSelectedExpense)
  const workspace = useExpensesWorkspace(() => { void refetch() }, rows, dispatch, selected)
```

- [ ] **Step 3: Replace all `workspace.selected` references with `selected`**

Everywhere in the JSX that reads `workspace.selected`, change to `selected`. For example:
```tsx
      headerSlot={(
        <ExpenseContextHeader
          selected={selected}
          onEdit={openEdit}
          onPost={() => selected && workspace.setPostTarget(selected)}
          onDelete={() => selected && workspace.setDeleteTarget(selected)}
        />
      )}
      workspaceSlot={<ExpenseWorkspaceCard selected={selected} />}
```

Also update the list slot:
```tsx
          <ExpensesTable
            expenses={rows}
            loading={isLoading}
            selectedId={selected?.id ?? null}
            focusedIndex={workspace.focusedIndex}
            onSelect={workspace.handleSelect}
            listRef={workspace.listRef}
          />
```

Update `openEdit`:
```typescript
  const openEdit = () => {
    if (!selected) return
    workspace.setEditTarget(selected)
    workspace.setFormOpen(true)
  }
```

- [ ] **Step 4: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "ExpensesPage|error" | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/accounting/ExpensesPage.tsx
git commit -m "feat(accounting): wire ExpensesPage to Redux selection state"
```

---

## Task 7: Update `ExpensesPage` tests for Redux + add `?highlight` test

**Files:**
- Modify: `frontend/src/pages/accounting/__tests__/ExpensesPage.test.tsx`

- [ ] **Step 1: Add Redux store setup**

Add imports at the top of the file:
```typescript
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { waitFor } from '@testing-library/react'
import accountingReducer, { selectSelectedExpense } from '@/store/slices/accountingSlice'
```

- [ ] **Step 2: Add `makeStore` helper and update `renderPage`**

Replace or update the existing `renderPage` helper to use a Redux-wrapped `MemoryRouter`:

```typescript
function makeStore() {
  return configureStore({ reducer: { accounting: accountingReducer } })
}

const renderPage = (initialUrl = '/accounting/expenses') => {
  const store = makeStore()
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <ExpensesPage />
      </MemoryRouter>
    </Provider>
  )
  return { store }
}
```

- [ ] **Step 3: Add `?highlight` test**

```typescript
  it('auto-selects the expense matching the ?highlight= URL param', async () => {
    mockedApi.useGetExpensesQuery.mockReturnValue({
      data: { data: [expense1], meta: { total: 1 } },
      isLoading: false,
      refetch: vi.fn(),
    })

    const { store } = renderPage('/accounting/expenses?highlight=ex-1')

    await waitFor(() => {
      expect(selectSelectedExpense(store.getState())?.id).toBe('ex-1')
    })
  })
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/ExpensesPage.test.tsx 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/accounting/__tests__/ExpensesPage.test.tsx
git commit -m "test(accounting): add Redux store wrapper and highlight test for ExpensesPage"
```

---

## Task 8: Refactor `useFundTransfersWorkspace` to use Redux

**Files:**
- Modify: `frontend/src/pages/accounting/hooks/useFundTransfersWorkspace.ts`

- [ ] **Step 1: Replace the hook**

```typescript
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import { useCancelFundTransferMutation, useLazyGetFundTransferQuery } from '@/store/api/accountingApi'
import type { AppDispatch } from '@/store'
import { setSelectedFundTransfer } from '@/store/slices/accountingSlice'
import type { FundTransfer } from '@/types'

export function useFundTransfersWorkspace(
  refetch: () => void,
  transfers: FundTransfer[] = [],
  dispatch: AppDispatch,
  selected: FundTransfer | null,
) {
  const navigate = useNavigate()
  const { showError, showSuccess } = useNotification()
  const [cancelTarget, setCancelTarget] = useState<FundTransfer | null>(null)
  const [fetchItem] = useLazyGetFundTransferQuery()
  const [cancelFundTransfer, { isLoading: cancelling }] = useCancelFundTransferMutation()

  const workspace = useEntityWorkspace<FundTransfer>({
    entities: transfers,
    selectedEntity: selected,
    selectEntity: (entity) => dispatch(setSelectedFundTransfer(entity)),
    refetch,
    navigate,
    highlightParam: 'highlight',
    routes: {
      create: '/accounting/fund-transfers',
      edit: () => '/accounting/fund-transfers',
    },
    notifications: { showSuccess, showError },
    deleteMutation: async () => {},
    onEscape: () => {
      dispatch(setSelectedFundTransfer(null))
      setCancelTarget(null)
    },
  })

  const { handleSelect: workspaceHandleSelect } = workspace

  const handleSelect = useCallback(async (item: FundTransfer) => {
    workspaceHandleSelect(item)
    try {
      const fresh = await fetchItem(item.id).unwrap()
      dispatch(setSelectedFundTransfer(fresh))
    }
    catch { /* keep list-row data */ }
  }, [fetchItem, workspaceHandleSelect, dispatch])

  const handleConfirmCancel = useCallback(async () => {
    if (!cancelTarget) return
    try {
      const next = await cancelFundTransfer(cancelTarget.id).unwrap()
      showSuccess(`Transfer ${cancelTarget.referenceNumber} cancelled`)
      dispatch(setSelectedFundTransfer(next))
      setCancelTarget(null)
      refetch()
    }
    catch (error: any) {
      showError(error?.data?.message ?? error?.message ?? 'Operation failed')
    }
  }, [cancelFundTransfer, cancelTarget, refetch, showError, showSuccess, dispatch])

  return {
    focusedIndex: workspace.focusedIndex,
    listRef: workspace.listRef,
    searchInputRef: workspace.searchInputRef,
    cancelTarget,
    setCancelTarget,
    cancelling,
    handleSelect,
    handleConfirmCancel,
  }
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "useFundTransfers|error" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/hooks/useFundTransfersWorkspace.ts
git commit -m "feat(accounting): migrate useFundTransfersWorkspace selection to Redux"
```

---

## Task 9: Refactor `FundTransfersPage` to use Redux selection

**Files:**
- Modify: `frontend/src/pages/accounting/FundTransfersPage.tsx`

- [ ] **Step 1: Update imports — add `useAppDispatch`, new selector**

The file already imports `useAppSelector` from `@/hooks/useRedux`. Add `useAppDispatch` to that import and add the new selector:

```typescript
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { selectSelectedFundTransfer } from '@/store/slices/accountingSlice'
```

- [ ] **Step 2: Add `dispatch` and `selected` inside the component, update workspace call**

Inside `FundTransfersPage`, add after the existing `useAppSelector` call:
```typescript
  const dispatch = useAppDispatch()
  const selected = useAppSelector(selectSelectedFundTransfer)
```

Replace:
```typescript
  const workspace = useFundTransfersWorkspace(() => { void refetch() }, transfers)
```
with:
```typescript
  const workspace = useFundTransfersWorkspace(() => { void refetch() }, transfers, dispatch, selected)
```

- [ ] **Step 3: Replace `workspace.selected` in JSX with `selected`**

```tsx
      listSlot={<FundTransfersList transfers={transfers} loading={isLoading} selectedId={selected?.id ?? null} focusedIndex={workspace.focusedIndex} onSelect={workspace.handleSelect} listRef={workspace.listRef} />}
      headerSlot={<FundTransferContextHeader selected={selected} onCancel={() => selected && workspace.setCancelTarget(selected)} canManageTransfers={canManageTransfers} />}
      workspaceSlot={<FundTransferWorkspaceCard selected={selected} />}
```

In the `dialogs` prop, also replace `workspace.cancelTarget` and related references — those remain on workspace (only selection moves to Redux):
```tsx
      dialogs={<FundTransfersDialogs ... cancelTarget={workspace.cancelTarget} cancelling={workspace.cancelling} onConfirmCancel={() => void workspace.handleConfirmCancel()} onCancelCancel={() => workspace.setCancelTarget(null)} />}
```

- [ ] **Step 4: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "FundTransfers|error" | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/accounting/FundTransfersPage.tsx
git commit -m "feat(accounting): wire FundTransfersPage to Redux selection state"
```

---

## Task 10: Update `FundTransfersPage` tests for Redux + add `?highlight` test

**Files:**
- Modify: `frontend/src/pages/accounting/__tests__/FundTransfersPage.test.tsx`

- [ ] **Step 1: Add Redux store setup**

The file currently mocks `@/hooks/useRedux` entirely with `vi.mock('@/hooks/useRedux', () => ({ useAppSelector: () => ({ role: 'admin' }) }))`. This blanket mock covers both `useAppSelector` calls. Replace that mock with one that handles both:

```typescript
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { waitFor } from '@testing-library/react'
import accountingReducer, { selectSelectedFundTransfer } from '@/store/slices/accountingSlice'
```

Replace:
```typescript
vi.mock('@/hooks/useRedux', () => ({ useAppSelector: () => ({ role: 'admin' }) }))
```
with:
```typescript
vi.mock('@/store/slices/authSlice', () => ({
  selectCurrentUser: () => ({ role: 'admin' }),
}))
```

- [ ] **Step 2: Add `makeStore` helper and update render wrapper**

```typescript
function makeStore() {
  return configureStore({ reducer: { accounting: accountingReducer } })
}

function renderPage(initialUrl = '/accounting/fund-transfers') {
  const store = makeStore()
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <FundTransfersPage />
      </MemoryRouter>
    </Provider>
  )
  return { store }
}
```

Update all existing `render(<BrowserRouter>...` calls in the file to use `renderPage()`.

- [ ] **Step 3: Add `?highlight` test**

```typescript
  it('auto-selects the transfer matching the ?highlight= URL param', async () => {
    const { store } = renderPage('/accounting/fund-transfers?highlight=trf-1')

    await waitFor(() => {
      expect(selectSelectedFundTransfer(store.getState())?.id).toBe('trf-1')
    })
  })
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/FundTransfersPage.test.tsx 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/accounting/__tests__/FundTransfersPage.test.tsx
git commit -m "test(accounting): add Redux store wrapper and highlight test for FundTransfersPage"
```

---

## Task 11: Refactor `useOwnerEquityWorkspace` to use Redux

**Files:**
- Modify: `frontend/src/pages/accounting/hooks/useOwnerEquityWorkspace.ts`

- [ ] **Step 1: Replace the hook**

```typescript
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import {
  useDeleteOwnerEquityTransactionMutation,
  usePostOwnerEquityTransactionMutation,
  useReverseOwnerEquityTransactionMutation,
} from '@/store/api/accountingApi'
import type { AppDispatch } from '@/store'
import { setSelectedOwnerEquityTransaction } from '@/store/slices/accountingSlice'
import type { OwnerEquityTransaction } from '@/types'

export function useOwnerEquityWorkspace(
  entities: OwnerEquityTransaction[],
  refetch: () => void,
  dispatch: AppDispatch,
  selected: OwnerEquityTransaction | null,
) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [postTarget, setPostTarget] = useState<OwnerEquityTransaction | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<OwnerEquityTransaction | null>(null)
  const [reverseTarget, setReverseTarget] = useState<OwnerEquityTransaction | null>(null)

  const [deleteOwnerEquityTransaction] = useDeleteOwnerEquityTransactionMutation()
  const [postOwnerEquityTransaction] = usePostOwnerEquityTransactionMutation()
  const [reverseOwnerEquityTransaction] = useReverseOwnerEquityTransactionMutation()

  const workspace = useEntityWorkspace<OwnerEquityTransaction>({
    entities,
    selectedEntity: selected,
    selectEntity: (entity) => dispatch(setSelectedOwnerEquityTransaction(entity)),
    refetch,
    navigate,
    highlightParam: 'highlight',
    routes: {
      create: '/accounting/owner-equity',
      edit: () => '/accounting/owner-equity',
    },
    notifications: { showSuccess: () => {}, showError: () => {} },
    deleteMutation: async () => {},
    onEnter: () => {
      if (selected) setDialogOpen(true)
    },
    onEscape: () => {
      dispatch(setSelectedOwnerEquityTransaction(null))
    },
  })

  const handlePost = useCallback(async () => {
    if (!postTarget) return
    try {
      const next = await postOwnerEquityTransaction(postTarget.id).unwrap()
      dispatch(setSelectedOwnerEquityTransaction(next))
      setPostTarget(null)
      showSuccess('Transaction posted')
      refetch()
    } catch (error: any) {
      showError(error?.data?.message || String(error))
    }
  }, [postOwnerEquityTransaction, postTarget, refetch, showError, showSuccess, dispatch])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await deleteOwnerEquityTransaction(deleteTarget.id).unwrap()
      showSuccess('Transaction deleted')
      if (selected?.id === deleteTarget.id) dispatch(setSelectedOwnerEquityTransaction(null))
      setDeleteTarget(null)
      refetch()
    } catch (error: any) {
      showError(error?.data?.message || String(error))
    }
  }, [deleteOwnerEquityTransaction, deleteTarget, refetch, selected?.id, showError, showSuccess, dispatch])

  const handleReverse = useCallback(async () => {
    if (!reverseTarget) return
    try {
      const next = await reverseOwnerEquityTransaction(reverseTarget.id).unwrap()
      dispatch(setSelectedOwnerEquityTransaction(next))
      setReverseTarget(null)
      showSuccess('Transaction reversed')
      refetch()
    } catch (error: any) {
      showError(error?.data?.message || String(error))
    }
  }, [refetch, reverseOwnerEquityTransaction, reverseTarget, showError, showSuccess, dispatch])

  return {
    ...workspace,
    dialogOpen,
    setDialogOpen,
    postTarget,
    setPostTarget,
    deleteTarget,
    setDeleteTarget,
    reverseTarget,
    setReverseTarget,
    handlePost,
    handleDelete,
    handleReverse,
  }
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "useOwnerEquity|error" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/hooks/useOwnerEquityWorkspace.ts
git commit -m "feat(accounting): migrate useOwnerEquityWorkspace selection to Redux"
```

---

## Task 12: Refactor `OwnerEquityPage` to use Redux selection

**Files:**
- Modify: `frontend/src/pages/accounting/OwnerEquityPage.tsx`

- [ ] **Step 1: Update imports**

Add to existing imports:
```typescript
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { selectSelectedOwnerEquityTransaction } from '@/store/slices/accountingSlice'
```

- [ ] **Step 2: Add `dispatch` and `selected` inside the component, update workspace call**

Inside `OwnerEquityPage`, replace:
```typescript
  const workspace = useOwnerEquityWorkspace(rows, () => { void refetch() })
```
with:
```typescript
  const dispatch = useAppDispatch()
  const selected = useAppSelector(selectSelectedOwnerEquityTransaction)
  const workspace = useOwnerEquityWorkspace(rows, () => { void refetch() }, dispatch, selected)
```

- [ ] **Step 3: Replace `workspace.selected` in JSX with `selected`**

```tsx
      listSlot={(
        <OwnerEquityTable
          transactions={rows}
          loading={isLoading}
          total={rows.length}
          selectedId={selected?.id ?? null}
          focusedIndex={workspace.focusedIndex}
          onSelect={workspace.handleSelect}
          listRef={workspace.listRef}
        />
      )}
      headerSlot={(
        <OwnerEquityContextHeader
          selected={selected}
          onEdit={() => selected && openEdit(selected)}
          onPost={() => selected && workspace.setPostTarget(selected)}
          onDelete={() => selected && workspace.setDeleteTarget(selected)}
          onReverse={() => selected && workspace.setReverseTarget(selected)}
        />
      )}
      workspaceSlot={<OwnerEquityWorkspaceCard selected={selected} />}
```

Also update `openEdit` which already receives the row as a parameter — no change needed there. Update `openCreate`:
```typescript
  const openCreate = () => {
    setForm({ ...defaultForm(), paymentMethodId: paymentMethods[0]?.id || '' })
    workspace.setDialogOpen(true)
  }
```

- [ ] **Step 4: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "OwnerEquity|error" | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/accounting/OwnerEquityPage.tsx
git commit -m "feat(accounting): wire OwnerEquityPage to Redux selection state"
```

---

## Task 13: Update `OwnerEquityPage` tests for Redux + add `?highlight` test

**Files:**
- Modify: `frontend/src/pages/accounting/__tests__/OwnerEquityPage.test.tsx`

- [ ] **Step 1: Add Redux store setup**

Add at the top with other imports:
```typescript
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { waitFor } from '@testing-library/react'
import accountingReducer, { selectSelectedOwnerEquityTransaction } from '@/store/slices/accountingSlice'
```

- [ ] **Step 3: Add `makeStore` helper, update render wrapper, add `?highlight` test**

```typescript
function makeStore() {
  return configureStore({ reducer: { accounting: accountingReducer } })
}

function renderPage(initialUrl = '/accounting/owner-equity') {
  const store = makeStore()
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <OwnerEquityPage />
      </MemoryRouter>
    </Provider>
  )
  return { store }
}
```

Update all existing `render(<BrowserRouter>...` calls to use `renderPage()`.

```typescript
  it('auto-selects the transaction matching the ?highlight= URL param', async () => {
    const { store } = renderPage('/accounting/owner-equity?highlight=tx-1')

    await waitFor(() => {
      expect(selectSelectedOwnerEquityTransaction(store.getState())?.id).toBe('tx-1')
    })
  })
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/OwnerEquityPage.test.tsx 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/accounting/__tests__/OwnerEquityPage.test.tsx
git commit -m "test(accounting): add Redux store wrapper and highlight test for OwnerEquityPage"
```

---

## Task 14: Refactor `useBankReconciliationsWorkspace` to use Redux

**Files:**
- Modify: `frontend/src/pages/accounting/hooks/useBankReconciliationsWorkspace.ts`

- [ ] **Step 1: Replace the hook**

```typescript
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import {
  useCompleteBankReconciliationMutation,
  useDeleteBankReconciliationMutation,
  useLazyGetBankReconciliationQuery,
  useMarkBankReconciliationClearedMutation,
  useReopenBankReconciliationMutation,
  useUnmarkBankReconciliationClearedMutation,
} from '@/store/api/accountingApi'
import type { AppDispatch } from '@/store'
import { setSelectedBankReconciliation } from '@/store/slices/accountingSlice'
import { BankReconciliation, ReconciledTransaction } from '@/types'
import { getErrorMessage } from '@/utils/errorMessage'

interface UseBankReconciliationsWorkspaceConfig {
  reconciliations: BankReconciliation[]
  refetch: () => void
  dispatch: AppDispatch
  selected: BankReconciliation | null
}

export function useBankReconciliationsWorkspace({
  reconciliations,
  refetch,
  dispatch,
  selected,
}: UseBankReconciliationsWorkspaceConfig) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const [completeTarget, setCompleteTarget] = useState<BankReconciliation | null>(null)
  const [reopenTarget, setReopenTarget] = useState<BankReconciliation | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<BankReconciliation | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const [fetchItem] = useLazyGetBankReconciliationQuery()
  const [markCleared] = useMarkBankReconciliationClearedMutation()
  const [unmarkCleared] = useUnmarkBankReconciliationClearedMutation()
  const [completeReconciliation] = useCompleteBankReconciliationMutation()
  const [reopenReconciliation] = useReopenBankReconciliationMutation()
  const [deleteReconciliation] = useDeleteBankReconciliationMutation()

  const workspace = useEntityWorkspace<BankReconciliation>({
    entities: reconciliations,
    selectedEntity: selected,
    selectEntity: (entity) => dispatch(setSelectedBankReconciliation(entity)),
    refetch,
    navigate,
    highlightParam: 'highlight',
    routes: {
      create: '/accounting/bank-reconciliations',
      edit: () => '/accounting/bank-reconciliations',
    },
    notifications: { showSuccess, showError },
    deleteMutation: async () => {},
    onEnter: () => {},
    onEscape: () => {
      dispatch(setSelectedBankReconciliation(null))
      setCompleteTarget(null)
      setReopenTarget(null)
      setDeleteTarget(null)
    },
  })

  const handleSelect = useCallback(async (item: BankReconciliation) => {
    workspace.handleSelect(item)
    try {
      const fresh = await fetchItem(item.id).unwrap()
      dispatch(setSelectedBankReconciliation(fresh))
    }
    catch { /* keep list-row data */ }
  }, [fetchItem, workspace, dispatch])

  const handleToggleCleared = useCallback(async (txn: ReconciledTransaction) => {
    if (!selected) return
    try {
      const fresh = txn.cleared
        ? await unmarkCleared({ id: selected.id, journalEntryLineIds: [txn.journalEntryLineId] }).unwrap()
        : await markCleared({ id: selected.id, journalEntryLineIds: [txn.journalEntryLineId] }).unwrap()
      dispatch(setSelectedBankReconciliation(fresh))
      refetch()
    }
    catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to update transaction'))
    }
  }, [selected, markCleared, unmarkCleared, refetch, showError, dispatch])

  const handleConfirmComplete = useCallback(async () => {
    if (!completeTarget) return
    setActionLoading(true)
    try {
      const fresh = await completeReconciliation(completeTarget.id).unwrap()
      showSuccess('Reconciliation completed')
      setCompleteTarget(null)
      dispatch(setSelectedBankReconciliation(fresh))
      refetch()
    }
    catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to complete reconciliation'))
    }
    finally {
      setActionLoading(false)
    }
  }, [completeTarget, completeReconciliation, showSuccess, showError, refetch, dispatch])

  const handleConfirmReopen = useCallback(async () => {
    if (!reopenTarget) return
    setActionLoading(true)
    try {
      const fresh = await reopenReconciliation(reopenTarget.id).unwrap()
      showSuccess('Reconciliation reopened')
      setReopenTarget(null)
      dispatch(setSelectedBankReconciliation(fresh))
      refetch()
    }
    catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to reopen reconciliation'))
    }
    finally {
      setActionLoading(false)
    }
  }, [reopenTarget, reopenReconciliation, showSuccess, showError, refetch, dispatch])

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    setActionLoading(true)
    try {
      await deleteReconciliation(deleteTarget.id).unwrap()
      showSuccess('Reconciliation deleted')
      setDeleteTarget(null)
      dispatch(setSelectedBankReconciliation(null))
      refetch()
    }
    catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to delete reconciliation'))
    }
    finally {
      setActionLoading(false)
    }
  }, [deleteTarget, deleteReconciliation, showSuccess, showError, refetch, dispatch])

  return {
    completeTarget,
    setCompleteTarget,
    reopenTarget,
    setReopenTarget,
    deleteTarget,
    setDeleteTarget,
    actionLoading,
    focusedIndex: workspace.focusedIndex,
    searchInputRef: workspace.searchInputRef,
    listRef: workspace.listRef,
    handleSelect,
    handleToggleCleared,
    handleConfirmComplete,
    handleConfirmReopen,
    handleConfirmDelete,
  }
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "useBankReconciliations|error" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/hooks/useBankReconciliationsWorkspace.ts
git commit -m "feat(accounting): migrate useBankReconciliationsWorkspace selection to Redux"
```

---

## Task 15: Refactor `BankReconciliationsPage` to use Redux selection

**Files:**
- Modify: `frontend/src/pages/accounting/BankReconciliationsPage.tsx`

- [ ] **Step 1: Update imports**

Add to existing imports:
```typescript
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { selectSelectedBankReconciliation } from '@/store/slices/accountingSlice'
```

- [ ] **Step 2: Add `dispatch` and `selected` inside the component, update workspace call**

Inside `BankReconciliationsPage`, replace:
```typescript
  const workspace = useBankReconciliationsWorkspace({
    reconciliations,
    refetch: () => {
      void refetch()
    },
  })
```
with:
```typescript
  const dispatch = useAppDispatch()
  const selected = useAppSelector(selectSelectedBankReconciliation)
  const workspace = useBankReconciliationsWorkspace({
    reconciliations,
    refetch: () => { void refetch() },
    dispatch,
    selected,
  })
```

- [ ] **Step 3: Replace `workspace.selected` in JSX with `selected`**

```tsx
      listSlot={(
        <BankReconciliationsTable
          reconciliations={reconciliations}
          loading={isLoading}
          total={total}
          selectedId={selected?.id ?? null}
          focusedIndex={workspace.focusedIndex}
          onSelect={workspace.handleSelect}
          listRef={workspace.listRef}
        />
      )}
      headerSlot={(
        <BankReconciliationContextHeader
          selected={selected}
          onComplete={() => selected && workspace.setCompleteTarget(selected)}
          onReopen={() => selected && workspace.setReopenTarget(selected)}
          onDelete={() => selected && workspace.setDeleteTarget(selected)}
        />
      )}
      workspaceSlot={(
        <BankReconciliationWorkspaceCard
          selected={selected}
          onToggleCleared={workspace.handleToggleCleared}
        />
      )}
```

- [ ] **Step 4: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "BankReconciliations|error" | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/accounting/BankReconciliationsPage.tsx
git commit -m "feat(accounting): wire BankReconciliationsPage to Redux selection state"
```

---

## Task 16: Update `BankReconciliationsPage` tests for Redux + add `?highlight` test

**Files:**
- Modify: `frontend/src/pages/accounting/__tests__/BankReconciliationsPage.test.tsx`

- [ ] **Step 1: Add Redux store setup**

Add at the top with other imports:
```typescript
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { waitFor } from '@testing-library/react'
import accountingReducer, { selectSelectedBankReconciliation } from '@/store/slices/accountingSlice'
```

- [ ] **Step 3: Add `makeStore` helper, update render wrapper, add `?highlight` test**

```typescript
function makeStore() {
  return configureStore({ reducer: { accounting: accountingReducer } })
}

function renderPage(initialUrl = '/accounting/bank-reconciliations') {
  const store = makeStore()
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <BankReconciliationsPage />
      </MemoryRouter>
    </Provider>
  )
  return { store }
}
```

Update all existing `render(<BrowserRouter>...` calls to use `renderPage()`.

```typescript
  it('auto-selects the reconciliation matching the ?highlight= URL param', async () => {
    const { store } = renderPage('/accounting/bank-reconciliations?highlight=rec-1')

    await waitFor(() => {
      expect(selectSelectedBankReconciliation(store.getState())?.id).toBe('rec-1')
    })
  })
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/BankReconciliationsPage.test.tsx 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/accounting/__tests__/BankReconciliationsPage.test.tsx
git commit -m "test(accounting): add Redux store wrapper and highlight test for BankReconciliationsPage"
```

---

## Task 17: Refactor `useSettlementsWorkspace` to use Redux

**Files:**
- Modify: `frontend/src/pages/accounting/hooks/useSettlementsWorkspace.ts`

- [ ] **Step 1: Replace the hook**

```typescript
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import { useCancelSettlementMutation } from '@/store/api/accountingApi'
import type { AppDispatch } from '@/store'
import { setSelectedSettlement } from '@/store/slices/accountingSlice'
import type { Settlement } from '@/types'

export function useSettlementsWorkspace(
  entities: Settlement[],
  refetch: () => void,
  dispatch: AppDispatch,
  selected: Settlement | null,
) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<Settlement | null>(null)
  const [cancelSettlement] = useCancelSettlementMutation()

  const workspace = useEntityWorkspace<Settlement>({
    entities,
    selectedEntity: selected,
    selectEntity: (entity) => dispatch(setSelectedSettlement(entity)),
    refetch,
    navigate,
    highlightParam: 'highlight',
    routes: {
      create: '/accounting/settlements',
      edit: () => '/accounting/settlements',
    },
    notifications: { showSuccess: () => {}, showError: () => {} },
    deleteMutation: async () => {},
    onEnter: () => {},
    onEscape: () => {
      dispatch(setSelectedSettlement(null))
      setCancelTarget(null)
    },
  })

  const handleConfirmCancel = useCallback(async () => {
    if (!cancelTarget) return
    try {
      const next = await cancelSettlement(cancelTarget.id).unwrap()
      dispatch(setSelectedSettlement(next))
      setCancelTarget(null)
      showSuccess('Settlement cancelled successfully')
      refetch()
    } catch (error: any) {
      showError(error?.message || String(error) || 'Failed to cancel settlement')
    }
  }, [cancelSettlement, cancelTarget, refetch, showError, showSuccess, dispatch])

  return {
    ...workspace,
    dialogOpen,
    setDialogOpen,
    cancelTarget,
    setCancelTarget,
    handleConfirmCancel,
  }
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "useSettlements|error" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/hooks/useSettlementsWorkspace.ts
git commit -m "feat(accounting): migrate useSettlementsWorkspace selection to Redux"
```

---

## Task 18: Refactor `SettlementsPage` to use Redux selection

**Files:**
- Modify: `frontend/src/pages/accounting/SettlementsPage.tsx`

- [ ] **Step 1: Update imports**

Add to existing imports:
```typescript
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { selectSelectedSettlement } from '@/store/slices/accountingSlice'
```

- [ ] **Step 2: Add `dispatch` and `selected` inside the component, update workspace call**

Inside `SettlementsPage`, replace:
```typescript
  const workspace = useSettlementsWorkspace(settlements, () => { void refetch() })
```
with:
```typescript
  const dispatch = useAppDispatch()
  const selected = useAppSelector(selectSelectedSettlement)
  const workspace = useSettlementsWorkspace(settlements, () => { void refetch() }, dispatch, selected)
```

- [ ] **Step 3: Replace `workspace.selected` in JSX with `selected`**

```tsx
      listSlot={(
        <SettlementsTable
          settlements={settlements}
          loading={isLoading}
          total={settlements.length}
          selectedId={selected?.id ?? null}
          focusedIndex={workspace.focusedIndex}
          onSelect={workspace.handleSelect}
          listRef={workspace.listRef}
        />
      )}
      headerSlot={(
        <SettlementContextHeader
          selected={selected}
          onCancel={() => selected && workspace.setCancelTarget(selected)}
        />
      )}
      workspaceSlot={<SettlementWorkspaceCard selected={selected} />}
```

- [ ] **Step 4: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "SettlementsPage|error" | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/accounting/SettlementsPage.tsx
git commit -m "feat(accounting): wire SettlementsPage to Redux selection state"
```

---

## Task 19: Update `SettlementsPage` tests for Redux + add `?highlight` test

**Files:**
- Modify: `frontend/src/pages/accounting/__tests__/SettlementsPage.test.tsx`

- [ ] **Step 1: Add Redux store setup**

Add at the top with other imports:
```typescript
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { waitFor } from '@testing-library/react'
import accountingReducer, { selectSelectedSettlement } from '@/store/slices/accountingSlice'
```

- [ ] **Step 3: Add `makeStore` helper, update render wrapper, add `?highlight` test**

```typescript
function makeStore() {
  return configureStore({ reducer: { accounting: accountingReducer } })
}

function renderPage(initialUrl = '/accounting/settlements') {
  const store = makeStore()
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <SettlementsPage />
      </MemoryRouter>
    </Provider>
  )
  return { store }
}
```

Update all existing `render(<BrowserRouter>...` calls to use `renderPage()`.

```typescript
  it('auto-selects the settlement matching the ?highlight= URL param', async () => {
    const { store } = renderPage('/accounting/settlements?highlight=s-1')

    await waitFor(() => {
      expect(selectSelectedSettlement(store.getState())?.id).toBe('s-1')
    })
  })
```

- [ ] **Step 4: Run all 6 accounting page tests together**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/JournalEntriesPage.test.tsx src/pages/accounting/__tests__/ExpensesPage.test.tsx src/pages/accounting/__tests__/FundTransfersPage.test.tsx src/pages/accounting/__tests__/OwnerEquityPage.test.tsx src/pages/accounting/__tests__/BankReconciliationsPage.test.tsx src/pages/accounting/__tests__/SettlementsPage.test.tsx 2>&1 | tail -40
```

Expected: all tests pass across all 6 files.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/accounting/__tests__/SettlementsPage.test.tsx
git commit -m "test(accounting): add Redux store wrapper and highlight test for SettlementsPage"
```

---

## Task 20: Final TypeScript check and create PR

**Files:** none (verification only)

- [ ] **Step 1: Run full TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -c "error" || echo "0 errors"
```

Expected: 0 errors.

- [ ] **Step 2: Run all accounting page tests**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/ 2>&1 | tail -40
```

Expected: all tests pass.

- [ ] **Step 3: Create PR**

```bash
gh pr create \
  --title "feat(accounting): standardize selection state to Redux across 6 accounting pages" \
  --body "$(cat <<'EOF'
## Summary

- Expands `accountingSlice` with 6 new entity selections (Journal Entries, Expenses, Fund Transfers, Owner's Equity, Bank Reconciliations, Settlements)
- Migrates all 6 workspace hooks from local `useState` to Redux dispatch, matching the Sales/Purchasing gold standard pattern
- Adds `?highlight=ID` URL param support to all 6 pages via `highlightParam: 'highlight'` in `useEntityWorkspace`
- Keyboard navigation (↑↓, PgUp/Dn, Home/End, Escape) enabled consistently across all pages

Closes #521

## Test plan

- [ ] All 6 page test suites pass with Redux store wrapper
- [ ] Each page has a `?highlight=<id>` auto-selection test
- [ ] `npm run type-check` reports 0 errors
- [ ] Manual smoke test: navigate to each page, verify selection highlights, keyboard nav, and `?highlight=` deep link works

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
