# Settlements Gold Standard Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Settlements module to match the gold-standard List-Detail (Workspace) pattern used by Journal Entries, giving it keyboard navigation, search focus preservation, a two-column context header, and page-level sort state.

**Architecture:** `SettlementsTable` becomes a thin `EntityTable` wrapper; `useSettlementsWorkspace` delegates to `useEntityWorkspace` for all generic concerns; `SettlementContextHeader` adopts the two-column MUI Grid layout used by `JournalEntryContextHeader`. No new files are created — all five existing component files are updated in place.

**Tech Stack:** React 19, TypeScript, MUI v7, RTK Query, Vitest + React Testing Library

---

## File Map

| File | Change |
|---|---|
| `frontend/src/pages/accounting/components/SettlementsTable.tsx` | Replace manual table with `EntityTable` wrapper |
| `frontend/src/pages/accounting/hooks/useSettlementsWorkspace.ts` | Delegate to `useEntityWorkspace`; keep cancel state on top |
| `frontend/src/pages/accounting/SettlementsPage.tsx` | Add sort state; update hook call; add `filterHandlers`; plumb `focusedIndex` |
| `frontend/src/pages/accounting/components/SettlementContextHeader.tsx` | Two-column Grid layout matching `JournalEntryContextHeader` |
| `frontend/src/pages/accounting/components/SettlementWorkspaceCard.tsx` | Align section-header styling constant |
| `frontend/src/pages/accounting/__tests__/SettlementsPage.test.tsx` | Add `react-router-dom` mock for `useNavigate`/`useLocation`; add `useLazyGetSettlementQuery` mock if needed |

---

## Task 1: Rewrite `SettlementsTable.tsx` as an `EntityTable` wrapper

**Files:**
- Modify: `frontend/src/pages/accounting/components/SettlementsTable.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import type React from 'react'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import type { Settlement } from '@/types'

const COLUMNS: ColumnConfig<Settlement>[] = [
  { key: 'settlementNumber', render: (s) => s.settlementNumber },
]

interface Props {
  settlements: Settlement[]
  loading: boolean
  total: number
  selectedId: string | null
  focusedIndex: number
  onSelect: (item: Settlement) => void
  listRef: React.RefObject<HTMLDivElement | null>
}

export function SettlementsTable({ settlements, loading, total, selectedId, focusedIndex, onSelect, listRef }: Props) {
  return (
    <EntityTable
      rows={settlements}
      columns={COLUMNS}
      loading={loading}
      total={total}
      label="Settlements"
      selectedId={selectedId ?? undefined}
      focusedIndex={focusedIndex}
      onSelect={onSelect}
      listRef={listRef}
      dataAttr="settlement"
    />
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i settlement
```

Expected: no errors mentioning `SettlementsTable`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/components/SettlementsTable.tsx
git commit -m "refactor(settlements): migrate SettlementsTable to EntityTable wrapper"
```

---

## Task 2: Rewrite `useSettlementsWorkspace.ts` to use `useEntityWorkspace`

**Files:**
- Modify: `frontend/src/pages/accounting/hooks/useSettlementsWorkspace.ts`

- [ ] **Step 1: Replace the file contents**

```ts
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import { useCancelSettlementMutation } from '@/store/api/accountingApi'
import type { Settlement } from '@/types'

export function useSettlementsWorkspace(entities: Settlement[], refetch: () => void) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<Settlement | null>(null)
  const [selected, setSelected] = useState<Settlement | null>(null)
  const [cancelSettlement] = useCancelSettlementMutation()

  const workspace = useEntityWorkspace<Settlement>({
    entities,
    selectedEntity: selected,
    selectEntity: setSelected,
    refetch,
    navigate,
    routes: {
      create: '/accounting/settlements',
      edit: () => '/accounting/settlements',
    },
    notifications: { showSuccess: () => {}, showError: () => {} },
    deleteMutation: async () => {},
    onEnter: () => {},
  })

  const handleConfirmCancel = useCallback(async () => {
    if (!cancelTarget) return
    try {
      const next = await cancelSettlement(cancelTarget.id).unwrap()
      setSelected(next)
      setCancelTarget(null)
      showSuccess('Settlement cancelled successfully')
      refetch()
    } catch (error: any) {
      showError(error?.message || String(error) || 'Failed to cancel settlement')
    }
  }, [cancelSettlement, cancelTarget, refetch, showError, showSuccess])

  return {
    ...workspace,
    selected,
    dialogOpen,
    setDialogOpen,
    cancelTarget,
    setCancelTarget,
    handleConfirmCancel,
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i settlement
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/hooks/useSettlementsWorkspace.ts
git commit -m "refactor(settlements): delegate useSettlementsWorkspace to useEntityWorkspace"
```

---

## Task 3: Update `SettlementsPage.tsx` — sort state, hook call, filterHandlers, table props

**Files:**
- Modify: `frontend/src/pages/accounting/SettlementsPage.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import React, { useCallback, useMemo, useState } from 'react'

import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useCreateSettlementMutation, useGetPendingSettlementSummaryQuery, useGetSettlementsQuery } from '@/store/api/accountingApi'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'

import { SettlementContextHeader } from './components/SettlementContextHeader'
import { SettlementsDialogs } from './components/SettlementsDialogs'
import { SettlementsTable } from './components/SettlementsTable'
import { SettlementWorkspaceCard } from './components/SettlementWorkspaceCard'
import { useSettlementsWorkspace } from './hooks/useSettlementsWorkspace'

interface SettlementFilters {
  search: string
  status: string | null
  period: PeriodValue
}

const filterConfig: FilterBarConfig<SettlementFilters> = {
  search: { placeholder: 'Search settlements...' },
  fields: [
    { field: 'period', label: 'Period', type: 'period' },
    { field: 'status', label: 'Status', type: 'settlement-status' },
  ],
  defaults: { search: '', status: null, period: { key: null, from: null, to: null } },
}

const SettlementsPage: React.FC = () => {
  const [sortBy, setSortBy] = useState('settlementDate')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)
  const weekStartsOn = getStartOfWeek()
  const dateRange = useMemo(() => {
    const period = appliedFilters.period
    if (!period || period.key === null) return { fromDate: undefined, toDate: undefined }
    if (period.key === 'custom') return { fromDate: period.from ?? undefined, toDate: period.to ?? undefined }
    const resolved = getPeriodDateRange(period.key, weekStartsOn)
    return { fromDate: resolved.from, toDate: resolved.to }
  }, [appliedFilters.period, weekStartsOn])

  const { data: settlementsResponse, isLoading, refetch } = useGetSettlementsQuery({ page: 1, status: appliedFilters.status || undefined, startDate: dateRange.fromDate, endDate: dateRange.toDate })
  useGetPendingSettlementSummaryQuery()
  const [createSettlement] = useCreateSettlementMutation()

  const settlements = useMemo(() => {
    const rows = settlementsResponse?.data ?? []
    const term = appliedFilters.search.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) => [row.settlementNumber, row.reference, row.notes, row.paymentMethod?.name].filter(Boolean).join(' ').toLowerCase().includes(term))
  }, [appliedFilters.search, settlementsResponse?.data])

  const workspace = useSettlementsWorkspace(settlements, () => { void refetch() })

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

  const onCreate = async (data: { paymentMethodId: string; settlementDate: string; paymentIds: string[]; reference?: string; notes?: string }) => {
    await createSettlement(data).unwrap()
    workspace.setDialogOpen(false)
    void refetch()
  }

  return (
    <GenericListPage
      title="Settlements"
      subtitle="Settle pending payments by payment method"
      primaryAction={{ label: 'Create Settlement', onClick: () => workspace.setDialogOpen(true) }}
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={filterHandlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={workspace.searchInputRef}
      sort={{ field: 'settlementDate', sortBy, sortOrder, onSort: handleSort }}
      listSlot={(
        <SettlementsTable
          settlements={settlements}
          loading={isLoading}
          total={settlements.length}
          selectedId={workspace.selected?.id ?? null}
          focusedIndex={workspace.focusedIndex}
          onSelect={workspace.handleSelect}
          listRef={workspace.listRef}
        />
      )}
      headerSlot={(
        <SettlementContextHeader
          selected={workspace.selected}
          onCancel={() => workspace.selected && workspace.setCancelTarget(workspace.selected)}
        />
      )}
      workspaceSlot={<SettlementWorkspaceCard selected={workspace.selected} />}
      dialogs={(
        <SettlementsDialogs
          dialogOpen={workspace.dialogOpen}
          onCloseDialog={() => workspace.setDialogOpen(false)}
          onCreate={onCreate}
          cancelTarget={workspace.cancelTarget}
          onConfirmCancel={() => void workspace.handleConfirmCancel()}
          onCancelCancel={() => workspace.setCancelTarget(null)}
        />
      )}
    />
  )
}

export default SettlementsPage
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i settlement
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/SettlementsPage.tsx
git commit -m "refactor(settlements): add sort state, filterHandlers, and focusedIndex to SettlementsPage"
```

---

## Task 4: Rewrite `SettlementContextHeader.tsx` with two-column Grid layout

**Files:**
- Modify: `frontend/src/pages/accounting/components/SettlementContextHeader.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import { Paper, Table, TableBody, TableCell, TableContainer, TableRow, Typography } from '@mui/material'
import Grid from '@mui/material/Grid'
import { default as CancelIcon } from '@mui/icons-material/Cancel'

import { AppButton } from '@/components/common/AppButton'
import { EntityContextHeaderBar } from '@/components/common/EntityContextHeaderBar'
import { EntityStatusChip } from '@/components/common/EntityStatusChip'
import { TABLE_STYLES } from '@/constants/tableStyles'
import type { Settlement } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface Props {
  selected: Settlement | null
  onCancel: () => void
}

const detailTableSx = {
  tableLayout: 'fixed' as const,
  '& .MuiTableCell-root': {
    border: 'none',
    py: TABLE_STYLES.cell.padding.py,
    px: TABLE_STYLES.cell.padding.px,
    '&:nth-of-type(1)': { width: '40%' },
    '&:nth-of-type(2)': { width: '60%' },
  },
}

const labelCellSx = { fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }
const valueCellSx = { fontSize: '0.8rem' }
const sectionHeaderCellSx = {
  pb: TABLE_STYLES.cell.padding.py * 0.67,
  py: TABLE_STYLES.cell.padding.py * 0.67,
  borderTop: TABLE_STYLES.cell.border,
}

export function SettlementContextHeader({ selected, onCancel }: Props) {
  if (!selected) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
          Select a settlement to view details
        </Typography>
      </Paper>
    )
  }

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <EntityContextHeaderBar
        title={selected.settlementNumber}
        statusChip={<EntityStatusChip status={selected.status} />}
        actions={
          selected.status === 'completed' ? (
            <AppButton size="small" variant="danger" startIcon={<CancelIcon />} onClick={onCancel}>
              Cancel
            </AppButton>
          ) : null
        }
      />
      <Grid container spacing={3} sx={{ p: TABLE_STYLES.cell.padding.px }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <TableContainer>
            <Table size={TABLE_STYLES.size} sx={detailTableSx}>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={2} sx={sectionHeaderCellSx}>
                    <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                      Settlement Information
                    </Typography>
                  </TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Date</TableCell>
                  <TableCell sx={valueCellSx}>{formatDate(selected.settlementDate)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={labelCellSx}>Payment Method</TableCell>
                  <TableCell sx={valueCellSx}>{selected.paymentMethod?.name || '—'}</TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Status</TableCell>
                  <TableCell sx={valueCellSx}><EntityStatusChip status={selected.status} /></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <TableContainer>
            <Table size={TABLE_STYLES.size} sx={detailTableSx}>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={2} sx={sectionHeaderCellSx}>
                    <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                      Amounts & Details
                    </Typography>
                  </TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Total Amount</TableCell>
                  <TableCell sx={valueCellSx}>{formatCurrency(Number(selected.totalAmount || 0))}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={labelCellSx}>Linked Payments</TableCell>
                  <TableCell sx={valueCellSx}>{selected.paymentCount}</TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Reference</TableCell>
                  <TableCell sx={valueCellSx}>{selected.reference || '—'}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={labelCellSx}>Notes</TableCell>
                  <TableCell sx={valueCellSx}>{selected.notes || '—'}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Grid>
      </Grid>
    </Paper>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i settlement
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/components/SettlementContextHeader.tsx
git commit -m "refactor(settlements): adopt two-column Grid layout in SettlementContextHeader"
```

---

## Task 5: Align `SettlementWorkspaceCard.tsx` section-header styling

**Files:**
- Modify: `frontend/src/pages/accounting/components/SettlementWorkspaceCard.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import { Box, Paper, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { Settlement } from '@/types'

interface Props { selected: Settlement | null }

const cellSx = { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px }
const labelCellSx = { ...cellSx, color: 'text.secondary', width: '35%' }
const sectionHeaderCellSx = {
  pb: TABLE_STYLES.cell.padding.py * 0.67,
  py: TABLE_STYLES.cell.padding.py * 0.67,
  borderTop: TABLE_STYLES.cell.border,
}

export function SettlementWorkspaceCard({ selected }: Props) {
  if (!selected) return <Paper sx={{ flex: 1 }} />
  return (
    <Paper sx={{ flex: 1 }}>
      <Box sx={{ px: 2, py: 1, borderBottom: TABLE_STYLES.cell.border }}>
        <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Details</Typography>
      </Box>
      <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': cellSx }}>
        <TableBody>
          <TableRow>
            <TableCell colSpan={2} sx={sectionHeaderCellSx}>
              <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                Payment Details
              </Typography>
            </TableCell>
          </TableRow>
          <TableRow><TableCell sx={labelCellSx}>Payment Method</TableCell><TableCell>{selected.paymentMethod?.name || '-'}</TableCell></TableRow>
          <TableRow><TableCell sx={labelCellSx}>Linked Payments</TableCell><TableCell>{selected.paymentCount}</TableCell></TableRow>
          <TableRow><TableCell sx={labelCellSx}>Reference</TableCell><TableCell>{selected.reference || '—'}</TableCell></TableRow>
          <TableRow><TableCell sx={labelCellSx}>Notes</TableCell><TableCell>{selected.notes || '—'}</TableCell></TableRow>
        </TableBody>
      </Table>
    </Paper>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i settlement
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/components/SettlementWorkspaceCard.tsx
git commit -m "refactor(settlements): align SettlementWorkspaceCard section-header styling"
```

---

## Task 6: Update `SettlementsPage.test.tsx` and verify tests pass

**Files:**
- Modify: `frontend/src/pages/accounting/__tests__/SettlementsPage.test.tsx`

`useEntityWorkspace` (used internally by `useSettlementsWorkspace`) calls `useNavigate`, `useLocation`, and `useSearchParams` from react-router-dom. The existing test wraps in `BrowserRouter` which satisfies these — but we must also mock `react-router-dom` to provide a stable `useNavigate` (otherwise navigation calls in the hook produce warnings). Additionally, `useEntityWorkspace` calls `useLazyGetJournalEntryQuery` — wait, no, that's `useJournalEntriesWorkspace`. The settlements workspace only uses `useCancelSettlementMutation` which is already mocked.

- [ ] **Step 1: Update the test file**

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'

import SettlementsPage from '../SettlementsPage'

const mocked = vi.hoisted(() => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  useGetSettlementsQuery: vi.fn(),
  useGetPendingSettlementSummaryQuery: vi.fn(),
  useCreateSettlementMutation: vi.fn(),
  useCancelSettlementMutation: vi.fn(),
}))

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ search: '', pathname: '/accounting/settlements', state: null }),
  }
})

vi.mock('@/hooks/useNotification', () => ({ useNotification: () => ({ showSuccess: mocked.showSuccess, showError: mocked.showError }) }))
vi.mock('@/utils/dateRange', () => ({ getPeriodDateRange: () => ({ from: undefined, to: undefined }), getStartOfWeek: () => 0 }))
vi.mock('@/utils/formatters', async () => {
  const actual = await vi.importActual<typeof import('@/utils/formatters')>('@/utils/formatters')
  return { ...actual, formatCurrency: (value: number) => `$${value}`, formatDate: (value: string) => value }
})
vi.mock('@/store/api/accountingApi', () => mocked)
vi.mock('@/components/accounting/CreateSettlementDialog', () => ({ default: () => null }))

describe('SettlementsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.useGetSettlementsQuery.mockReturnValue({
      data: {
        data: [{
          id: 's-1',
          settlementNumber: 'SET-001',
          paymentMethod: { name: 'Cash' },
          settlementDate: '2026-02-26',
          totalAmount: 120,
          paymentCount: 1,
          reference: 'ref',
          notes: null,
          status: 'completed',
        }],
      },
      isLoading: false,
      refetch: vi.fn(),
    })
    mocked.useGetPendingSettlementSummaryQuery.mockReturnValue({})
    mocked.useCreateSettlementMutation.mockReturnValue([vi.fn()])
    mocked.useCancelSettlementMutation.mockReturnValue([vi.fn()])
  })

  it('renders title and settlement row', () => {
    render(<BrowserRouter><SettlementsPage /></BrowserRouter>)
    expect(screen.getByText('Settlements')).toBeInTheDocument()
    expect(screen.getByText('SET-001')).toBeInTheDocument()
  })

  it('renders create action', () => {
    render(<BrowserRouter><SettlementsPage /></BrowserRouter>)
    expect(screen.getByRole('button', { name: 'Create Settlement' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run only the settlements test**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/SettlementsPage.test.tsx
```

Expected output: `✓ renders title and settlement row` and `✓ renders create action` — 2 tests pass, 0 fail.

- [ ] **Step 3: If tests fail, diagnose**

Common failure modes:
- `useEntityWorkspace` calls a hook not mocked → add the mock to `vi.mock('@/store/api/accountingApi', ...)`
- `window.matchMedia` not defined → add `Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn().mockReturnValue({ matches: false, addListener: vi.fn(), removeListener: vi.fn() }) })` in a `beforeEach`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/accounting/__tests__/SettlementsPage.test.tsx
git commit -m "test(settlements): update test mocks for useEntityWorkspace compatibility"
```

---

## Task 7: Full type-check and close issue

**Files:** None modified.

- [ ] **Step 1: Full frontend type-check**

```bash
cd frontend && npm run type-check
```

Expected: exit 0 with no errors.

- [ ] **Step 2: Run the settlements test one more time to confirm clean**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/SettlementsPage.test.tsx
```

Expected: 2 passed.

- [ ] **Step 3: Create PR**

```bash
gh pr create \
  --title "refactor(settlements): gold standard List-Detail pattern (#517)" \
  --body "$(cat <<'EOF'
## Summary
- Replaces manual 5-column `SettlementsTable` with `EntityTable` wrapper (single `settlementNumber` column)
- Rewrites `useSettlementsWorkspace` to delegate to `useEntityWorkspace` — adds keyboard navigation (Up/Down/PgUp/PgDn/Home/End/Escape), auto-select, and search focus preservation for free
- Adds page-level `sortBy`/`sortOrder` state and `filterHandlers` with search focus preservation to `SettlementsPage`
- Refactors `SettlementContextHeader` to use the two-column MUI Grid layout matching `JournalEntryContextHeader`
- Aligns `SettlementWorkspaceCard` section-header styling to the shared constant pattern

Closes #517

## Test plan
- [ ] Run `npx vitest run src/pages/accounting/__tests__/SettlementsPage.test.tsx` — 2 tests pass
- [ ] Run `npm run type-check` — exit 0
- [ ] Manually verify in browser: keyboard Up/Down navigates settlements list, search box retains focus while typing, settlement detail shows two-column layout

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
