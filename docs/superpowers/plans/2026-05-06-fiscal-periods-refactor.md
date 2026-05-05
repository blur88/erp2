# Fiscal Periods UI/UX Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Fiscal Periods page to use Redux selection state, `useEntityWorkspace`, `EntityTable`, and keyboard navigation — matching the gold standard pattern used by all other accounting pages.

**Architecture:** Selection state moves from local `useState` to `accountingSlice`. `useFiscalPeriodsWorkspace` wraps `useEntityWorkspace` internally (same pattern as `useExpensesWorkspace`). The table switches from a manual 4-column `<Table>` to the shared `EntityTable` with a single `code` column. `FiscalPeriodContextHeader` and `FiscalPeriodWorkspaceCard` require no changes — they already meet the standard.

**Tech Stack:** React 19, Redux Toolkit, RTK Query, Material UI v7, Vitest

---

## File Map

| File | Action | What changes |
|------|--------|--------------|
| `frontend/src/store/slices/accountingSlice.ts` | Modify | Add `selectedFiscalPeriod` state, reducer, selector |
| `frontend/src/pages/accounting/hooks/useFiscalPeriodsWorkspace.ts` | Modify | Rewrite to wrap `useEntityWorkspace`; match `useExpensesWorkspace` pattern |
| `frontend/src/pages/accounting/FiscalPeriodsPage.tsx` | Modify | Wire Redux dispatch/selector; update workspace call signature |
| `frontend/src/pages/accounting/components/FiscalPeriodsTable.tsx` | Modify | Replace manual table with `EntityTable` |
| `frontend/src/pages/accounting/__tests__/FiscalPeriodsPage.test.tsx` | Modify | Add Redux mocks; update workspace mock to match new signature |

---

## Task 1: Add `selectedFiscalPeriod` to `accountingSlice`

**Files:**
- Modify: `frontend/src/store/slices/accountingSlice.ts`

- [ ] **Step 1: Add the state field, reducer, and selector**

Open `frontend/src/store/slices/accountingSlice.ts`. Make the following additions (follow the exact same pattern as `selectedExpense`):

```typescript
// Add to imports at top
import type {
  BankReconciliation,
  ChartOfAccount,
  ExpenseRecord,
  FiscalPeriod,          // ADD THIS
  FundTransfer,
  JournalEntry,
  OwnerEquityTransaction,
  Settlement,
} from '@/types'

// Add to AccountingState interface
interface AccountingState {
  selectedAccount: ChartOfAccount | null
  selectedJournalEntry: JournalEntry | null
  selectedExpense: ExpenseRecord | null
  selectedFiscalPeriod: FiscalPeriod | null    // ADD THIS
  selectedFundTransfer: FundTransfer | null
  selectedOwnerEquityTransaction: OwnerEquityTransaction | null
  selectedBankReconciliation: BankReconciliation | null
  selectedSettlement: Settlement | null
}

// Add to initialState
const initialState: AccountingState = {
  selectedAccount: null,
  selectedJournalEntry: null,
  selectedExpense: null,
  selectedFiscalPeriod: null,    // ADD THIS
  selectedFundTransfer: null,
  selectedOwnerEquityTransaction: null,
  selectedBankReconciliation: null,
  selectedSettlement: null,
}

// Add to reducers object inside createSlice
    setSelectedFiscalPeriod: (state, action: PayloadAction<FiscalPeriod | null>) => {
      state.selectedFiscalPeriod = action.payload
    },

// Add to exports (after the existing exports destructure)
export const {
  setSelectedAccount,
  setSelectedJournalEntry,
  setSelectedExpense,
  setSelectedFiscalPeriod,    // ADD THIS
  setSelectedFundTransfer,
  setSelectedOwnerEquityTransaction,
  setSelectedBankReconciliation,
  setSelectedSettlement,
} = accountingSlice.actions

// Add selector (after existing selectors)
export const selectSelectedFiscalPeriod = (state: RootState) => state.accounting.selectedFiscalPeriod
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "accounting\|fiscal" | head -20
```

Expected: no errors related to accounting or fiscal.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/store/slices/accountingSlice.ts
git commit -m "feat(accounting): add selectedFiscalPeriod to accountingSlice"
```

---

## Task 2: Rewrite `useFiscalPeriodsWorkspace`

**Files:**
- Modify: `frontend/src/pages/accounting/hooks/useFiscalPeriodsWorkspace.ts`

- [ ] **Step 1: Replace the entire file**

```typescript
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import type { AppDispatch } from '@/store'
import {
  useCloseFiscalPeriodMutation,
  useDeleteFiscalPeriodMutation,
  useGenerateFiscalPeriodsMutation,
  useReopenFiscalPeriodMutation,
} from '@/store/api/accountingApi'
import { setSelectedFiscalPeriod } from '@/store/slices/accountingSlice'
import type { FiscalPeriod } from '@/types'
import { getErrorMessage } from '@/utils/errorMessage'

export function useFiscalPeriodsWorkspace(
  refetch: () => void,
  periods: FiscalPeriod[],
  dispatch: AppDispatch,
  selected: FiscalPeriod | null,
) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()

  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<FiscalPeriod | null>(null)
  const [closeTarget, setCloseTarget] = useState<FiscalPeriod | null>(null)
  const [reopenTarget, setReopenTarget] = useState<FiscalPeriod | null>(null)

  const [deleteFiscalPeriod] = useDeleteFiscalPeriodMutation()
  const [closeFiscalPeriod] = useCloseFiscalPeriodMutation()
  const [reopenFiscalPeriod] = useReopenFiscalPeriodMutation()
  const [generateFiscalPeriods] = useGenerateFiscalPeriodsMutation()

  const workspace = useEntityWorkspace<FiscalPeriod>({
    entities: periods,
    selectedEntity: selected,
    selectEntity: (entity) => dispatch(setSelectedFiscalPeriod(entity)),
    refetch,
    navigate,
    routes: {
      create: '/accounting/fiscal-periods',
      edit: () => '/accounting/fiscal-periods',
    },
    onEnter: () => {
      if (selected) setFormDialogOpen(true)
    },
    onEscape: () => {
      dispatch(setSelectedFiscalPeriod(null))
      setCloseTarget(null)
      setReopenTarget(null)
    },
  })

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await deleteFiscalPeriod(deleteTarget.id).unwrap()
      showSuccess(`Period "${deleteTarget.name}" deleted successfully`)
      setDeleteTarget(null)
      if (selected?.id === deleteTarget.id) dispatch(setSelectedFiscalPeriod(null))
      refetch()
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to delete period'))
    }
  }, [deleteFiscalPeriod, deleteTarget, dispatch, refetch, selected?.id, showError, showSuccess])

  const handleClose = useCallback(async () => {
    if (!closeTarget) return
    try {
      const next = await closeFiscalPeriod(closeTarget.id).unwrap()
      showSuccess(`Period "${closeTarget.name}" closed successfully`)
      dispatch(setSelectedFiscalPeriod(next))
      setCloseTarget(null)
      refetch()
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to close period'))
      setCloseTarget(null)
    }
  }, [closeFiscalPeriod, closeTarget, dispatch, refetch, showError, showSuccess])

  const handleReopen = useCallback(async () => {
    if (!reopenTarget) return
    try {
      const next = await reopenFiscalPeriod(reopenTarget.id).unwrap()
      showSuccess(`Period "${reopenTarget.name}" reopened successfully`)
      dispatch(setSelectedFiscalPeriod(next))
      setReopenTarget(null)
      refetch()
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to reopen period'))
      setReopenTarget(null)
    }
  }, [dispatch, refetch, reopenFiscalPeriod, reopenTarget, showError, showSuccess])

  const handleGenerate = useCallback(async (year: number, startMonth: number) => {
    try {
      await generateFiscalPeriods({ year, startMonth }).unwrap()
      showSuccess(`Successfully generated 12 periods for year ${year}`)
      setGenerateDialogOpen(false)
      refetch()
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to generate periods'))
    }
  }, [generateFiscalPeriods, refetch, showError, showSuccess])

  return {
    focusedIndex: workspace.focusedIndex,
    listRef: workspace.listRef,
    searchInputRef: workspace.searchInputRef,
    handleSelect: workspace.handleSelect,
    formDialogOpen,
    setFormDialogOpen,
    generateDialogOpen,
    setGenerateDialogOpen,
    deleteTarget,
    setDeleteTarget,
    closeTarget,
    setCloseTarget,
    reopenTarget,
    setReopenTarget,
    handleDelete,
    handleClose,
    handleReopen,
    handleGenerate,
  }
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "fiscal\|workspace" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/hooks/useFiscalPeriodsWorkspace.ts
git commit -m "feat(accounting): refactor useFiscalPeriodsWorkspace to use useEntityWorkspace"
```

---

## Task 3: Update `FiscalPeriodsPage` to use Redux

**Files:**
- Modify: `frontend/src/pages/accounting/FiscalPeriodsPage.tsx`

- [ ] **Step 1: Replace the entire file**

```typescript
import React, { useMemo } from 'react'

import AccountMappingWarning from '@/components/accounting/AccountMappingWarning'
import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { useGetFiscalPeriodsQuery } from '@/store/api/accountingApi'
import { selectSelectedFiscalPeriod } from '@/store/slices/accountingSlice'
import { FiscalPeriodStatus } from '@/types'
import type { FilterBarConfig } from '@/types/filterBar.types'

import { FiscalPeriodContextHeader } from './components/FiscalPeriodContextHeader'
import { FiscalPeriodsDialogs } from './components/FiscalPeriodsDialogs'
import { FiscalPeriodsTable } from './components/FiscalPeriodsTable'
import { FiscalPeriodWorkspaceCard } from './components/FiscalPeriodWorkspaceCard'
import { useFiscalPeriodsWorkspace } from './hooks/useFiscalPeriodsWorkspace'

interface FiscalPeriodFilters {
  search: string
  status: string | null
}

const filterConfig: FilterBarConfig<FiscalPeriodFilters> = {
  search: { placeholder: 'Search by code or name...' },
  fields: [{ field: 'status', label: 'Status', type: 'fiscal-period-status' }],
  defaults: { search: '', status: null },
}

const FiscalPeriodsPage: React.FC = () => {
  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)

  const queryParams = useMemo(() => ({
    page: 1,
    sortBy: 'startDate',
    sortOrder: 'DESC' as const,
    status: appliedFilters.status ? appliedFilters.status.toUpperCase() as FiscalPeriodStatus : undefined,
    search: appliedFilters.search || undefined,
  }), [appliedFilters.search, appliedFilters.status])

  const { data: periodsResponse, isLoading, refetch } = useGetFiscalPeriodsQuery(queryParams)
  const periods = periodsResponse?.data ?? []

  const dispatch = useAppDispatch()
  const selected = useAppSelector(selectSelectedFiscalPeriod)
  const workspace = useFiscalPeriodsWorkspace(() => { void refetch() }, periods, dispatch, selected)

  return (
    <>
      <AccountMappingWarning context="system" />
      <GenericListPage
        title="Fiscal Periods"
        subtitle="Manage accounting periods and year boundaries"
        primaryAction={{ label: 'Add Period', onClick: () => { workspace.setFormDialogOpen(true) } }}
        secondaryAction={{ label: 'Generate Periods', onClick: () => workspace.setGenerateDialogOpen(true) }}
        filterConfig={filterConfig}
        draftFilters={draftFilters}
        handlers={handlers}
        hasActiveFilters={hasActiveFilters}
        searchInputRef={workspace.searchInputRef}
        sort={{ field: 'startDate', sortBy: 'startDate', sortOrder: 'desc', onSort: () => {} }}
        listSlot={(
          <FiscalPeriodsTable
            periods={periods}
            loading={isLoading}
            total={periodsResponse?.meta?.total ?? periods.length}
            selectedId={selected?.id ?? null}
            focusedIndex={workspace.focusedIndex}
            onSelect={workspace.handleSelect}
            listRef={workspace.listRef}
          />
        )}
        headerSlot={(
          <FiscalPeriodContextHeader
            selected={selected}
            onClose={() => selected && workspace.setCloseTarget(selected)}
            onReopen={() => selected && workspace.setReopenTarget(selected)}
            onEdit={() => workspace.setFormDialogOpen(true)}
            onDelete={() => selected && workspace.setDeleteTarget(selected)}
          />
        )}
        workspaceSlot={<FiscalPeriodWorkspaceCard selected={selected} />}
        dialogs={(
          <FiscalPeriodsDialogs
            formDialogOpen={workspace.formDialogOpen}
            selected={selected}
            onCloseForm={() => workspace.setFormDialogOpen(false)}
            onFormSuccess={() => { workspace.setFormDialogOpen(false); void refetch() }}
            generateDialogOpen={workspace.generateDialogOpen}
            onCloseGenerate={() => workspace.setGenerateDialogOpen(false)}
            onGenerate={workspace.handleGenerate}
            deleteTarget={workspace.deleteTarget}
            closeTarget={workspace.closeTarget}
            reopenTarget={workspace.reopenTarget}
            onConfirmDelete={() => void workspace.handleDelete()}
            onConfirmClose={() => void workspace.handleClose()}
            onConfirmReopen={() => void workspace.handleReopen()}
            onCancelDelete={() => workspace.setDeleteTarget(null)}
            onCancelClose={() => workspace.setCloseTarget(null)}
            onCancelReopen={() => workspace.setReopenTarget(null)}
          />
        )}
      />
    </>
  )
}

export default FiscalPeriodsPage
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "fiscal\|FiscalPeriods" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/FiscalPeriodsPage.tsx
git commit -m "feat(accounting): wire FiscalPeriodsPage to Redux and new workspace hook"
```

---

## Task 4: Replace `FiscalPeriodsTable` with `EntityTable`

**Files:**
- Modify: `frontend/src/pages/accounting/components/FiscalPeriodsTable.tsx`

- [ ] **Step 1: Replace the entire file**

```typescript
import React from 'react'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import type { FiscalPeriod } from '@/types'

const COLUMNS: ColumnConfig<FiscalPeriod>[] = [
  { key: 'code', render: (period) => period.code },
]

interface Props {
  periods: FiscalPeriod[]
  loading: boolean
  total: number
  selectedId: string | null
  focusedIndex: number
  onSelect: (period: FiscalPeriod) => void
  listRef: React.RefObject<HTMLDivElement | null>
}

export function FiscalPeriodsTable({ periods, loading, total, selectedId, focusedIndex, onSelect, listRef }: Props) {
  return (
    <EntityTable
      rows={periods}
      columns={COLUMNS}
      loading={loading}
      total={total}
      label="Fiscal Periods List"
      selectedId={selectedId ?? undefined}
      focusedIndex={focusedIndex}
      onSelect={onSelect}
      listRef={listRef}
      dataAttr="period"
    />
  )
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "fiscal\|FiscalPeriods" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/components/FiscalPeriodsTable.tsx
git commit -m "feat(accounting): replace FiscalPeriodsTable with EntityTable"
```

---

## Task 5: Update the test file

**Files:**
- Modify: `frontend/src/pages/accounting/__tests__/FiscalPeriodsPage.test.tsx`

- [ ] **Step 1: Replace the entire test file**

The page now uses `useAppDispatch` and `useAppSelector`, so we need to mock `@/hooks/useRedux`. The workspace hook now takes a different signature, so we mock it too. The `EntityTable` replaces the manual table, but the period code is still rendered — the assertion stays.

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'

import FiscalPeriodsPage from '../FiscalPeriodsPage'
import { FiscalPeriodStatus } from '@/types'

const mockedApi = vi.hoisted(() => ({
  useGetFiscalPeriodsQuery: vi.fn(),
  useDeleteFiscalPeriodMutation: vi.fn(),
  useCloseFiscalPeriodMutation: vi.fn(),
  useReopenFiscalPeriodMutation: vi.fn(),
  useGenerateFiscalPeriodsMutation: vi.fn(),
  useCreateFiscalPeriodMutation: vi.fn(),
  useUpdateFiscalPeriodMutation: vi.fn(),
}))

const mockDispatch = vi.fn()

vi.mock('@/store/api/accountingApi', () => mockedApi)
vi.mock('@/hooks/useNotification', () => ({ useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }) }))
vi.mock('@/components/accounting/AccountMappingWarning', () => ({ default: () => null }))
vi.mock('@/utils/formatters', async () => await vi.importActual('@/utils/formatters'))
vi.mock('@/hooks/useRedux', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: () => null,
}))
vi.mock('@/hooks/useEntityWorkspace', () => ({
  useEntityWorkspace: () => ({
    focusedIndex: -1,
    listRef: { current: null },
    searchInputRef: { current: null },
    handleSelect: vi.fn(),
  }),
}))

describe('FiscalPeriodsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.useGetFiscalPeriodsQuery.mockReturnValue({
      data: {
        data: [{
          id: '1',
          code: '2026-01',
          name: 'January 2026',
          startDate: '2026-01-01T00:00:00Z',
          endDate: '2026-01-31T00:00:00Z',
          status: FiscalPeriodStatus.OPEN,
          isOpen: true,
          isClosed: false,
          durationDays: 31,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        }],
        meta: { total: 1 },
      },
      isLoading: false,
      refetch: vi.fn(),
    })
    mockedApi.useDeleteFiscalPeriodMutation.mockReturnValue([vi.fn()])
    mockedApi.useCloseFiscalPeriodMutation.mockReturnValue([vi.fn()])
    mockedApi.useReopenFiscalPeriodMutation.mockReturnValue([vi.fn()])
    mockedApi.useGenerateFiscalPeriodsMutation.mockReturnValue([vi.fn()])
    mockedApi.useCreateFiscalPeriodMutation.mockReturnValue([vi.fn()])
    mockedApi.useUpdateFiscalPeriodMutation.mockReturnValue([vi.fn()])
  })

  it('renders header and row', () => {
    render(<BrowserRouter><FiscalPeriodsPage /></BrowserRouter>)
    expect(screen.getByText('Fiscal Periods')).toBeInTheDocument()
    expect(screen.getByText('2026-01')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/FiscalPeriodsPage.test.tsx
```

Expected: 1 test passes.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/__tests__/FiscalPeriodsPage.test.tsx
git commit -m "test(accounting): update FiscalPeriodsPage test for Redux and EntityTable"
```

---

## Task 6: Final type-check and smoke test

- [ ] **Step 1: Full TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | tail -5
```

Expected: `Found 0 errors.`

- [ ] **Step 2: Run the full accounting test suite**

```bash
cd frontend && npx vitest run src/pages/accounting
```

Expected: all tests pass.

- [ ] **Step 3: Manual smoke test**

Start the dev server:
```bash
cd frontend && npm run dev
```

Navigate to the Fiscal Periods page and verify:
1. Period codes show in the single-column list (e.g., "2026-01").
2. Clicking a row selects it and populates the context header and workspace card.
3. Arrow Up/Down moves selection between periods.
4. Enter opens the Edit dialog.
5. Escape clears selection.
6. `/` focuses the search input.
7. Close, Reopen, Edit, Delete all work from the context header.
8. "Generate Periods" dialog opens and generates periods correctly.
9. First period auto-selects on load.

- [ ] **Step 4: Final commit (if any cleanup needed)**

```bash
git add -p
git commit -m "chore(accounting): fiscal periods refactor cleanup"
```
