# Journal Entries Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Journal Entries module into a read-only list page using `EntityTable`, `useEntityWorkspace`, and a simplified context header — removing all manual creation, editing, and action buttons.

**Architecture:** Replace the custom `JournalEntriesTable` with a thin `EntityTable` wrapper, rewrite `JournalEntryContextHeader` as a read-only info strip using `EntityContextHeaderBar`, and migrate `useJournalEntriesWorkspace` to delegate to `useEntityWorkspace`. Delete `JournalEntryFormPage` and its routes entirely.

**Tech Stack:** React 19, TypeScript, MUI v7, RTK Query, Vitest + Testing Library

---

## File Map

| Action | File |
|--------|------|
| Modify | `frontend/src/pages/accounting/hooks/useJournalEntriesWorkspace.ts` |
| Modify | `frontend/src/pages/accounting/components/JournalEntriesTable.tsx` |
| Modify | `frontend/src/pages/accounting/components/JournalEntryContextHeader.tsx` |
| Modify | `frontend/src/pages/accounting/components/JournalEntryWorkspaceCard.tsx` |
| Modify | `frontend/src/pages/accounting/JournalEntriesPage.tsx` |
| Modify | `frontend/src/router.tsx` |
| Modify | `frontend/src/pages/accounting/components/JournalEntriesTable.test.tsx` |
| Modify | `frontend/src/pages/accounting/__tests__/JournalEntriesPage.test.tsx` |
| Delete | `frontend/src/pages/accounting/JournalEntryFormPage.tsx` |
| Delete | `frontend/src/pages/accounting/__tests__/JournalEntryFormPage.test.tsx` |

---

## Task 1: Rewrite `useJournalEntriesWorkspace` using `useEntityWorkspace`

The current hook owns all mutation state. Replace it with a thin wrapper around `useEntityWorkspace`, keeping only `navigateToSource` and passing a no-op `deleteMutation` since there are no user-triggered deletes.

**Files:**
- Modify: `frontend/src/pages/accounting/hooks/useJournalEntriesWorkspace.ts`

- [ ] **Step 1: Replace the file contents**

```typescript
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import { useLazyGetJournalEntryQuery } from '@/store/api/accountingApi'
import { JournalEntry } from '@/types'

interface UseJournalEntriesWorkspaceConfig {
  entries: JournalEntry[]
  refetch: () => void
}

export function useJournalEntriesWorkspace({ entries, refetch }: UseJournalEntriesWorkspaceConfig) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null)
  const [fetchEntry] = useLazyGetJournalEntryQuery()

  const workspace = useEntityWorkspace<JournalEntry>({
    entities: entries,
    selectedEntity: selectedEntry,
    selectEntity: setSelectedEntry,
    refetch,
    navigate,
    routes: {
      create: '/accounting/journal-entries',
      edit: () => '/accounting/journal-entries',
    },
    notifications: { showSuccess, showError },
    deleteMutation: async () => {},
    onEnter: () => {},
  })

  const handleSelect = useCallback(async (entry: JournalEntry) => {
    workspace.handleSelect(entry)
    try {
      const fresh = await fetchEntry(entry.id).unwrap()
      setSelectedEntry(fresh)
    } catch { /* keep list-row data */ }
  }, [fetchEntry, workspace])

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
    selectedEntry,
    handleSelect,
    navigateToSource,
  }
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "useJournalEntriesWorkspace|JournalEntriesPage" | head -20
```

Expected: no errors in this file. Errors in `JournalEntriesPage` are fine — we fix those in Task 3.

---

## Task 2: Rewrite `JournalEntriesTable` to use `EntityTable`

Remove the custom MUI `Table` with checkboxes and action buttons. Replace with a thin `EntityTable` wrapper.

**Files:**
- Modify: `frontend/src/pages/accounting/components/JournalEntriesTable.tsx`
- Modify: `frontend/src/pages/accounting/components/JournalEntriesTable.test.tsx`

- [ ] **Step 1: Rewrite the table component**

Replace the entire file with:

```typescript
import React from 'react'
import { Chip, Link, Typography } from '@mui/material'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import { EntityStatusChip } from '@/components/common/EntityStatusChip'
import { JournalEntry } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

const ENTRY_TYPE_LABELS: Record<string, string> = {
  manual: 'Manual Entry',
  sales_order: 'Sales Order',
  payment: 'Customer Payment',
  settlement: 'Settlement',
  goods_received_note: 'Goods Receipt',
  vendor_payment: 'Vendor Payment',
  stock_adjustment: 'Stock Adjustment',
  owner_equity_transaction: 'Owner Equity',
  expense: 'Expense',
  opening_balance: 'Opening Balance',
  fund_transfer: 'Fund Transfer',
}

interface Props {
  entries: JournalEntry[]
  loading: boolean
  total: number
  selectedEntryId: string | null
  focusedIndex: number
  onSelect: (entry: JournalEntry) => void
  onViewSource: (sourceType: string, sourceId: string) => void
  listRef: React.RefObject<HTMLDivElement | null>
}

export function JournalEntriesTable({
  entries,
  loading,
  total,
  selectedEntryId,
  focusedIndex,
  onSelect,
  onViewSource,
  listRef,
}: Props) {
  const columns: ColumnConfig<JournalEntry>[] = [
    {
      key: 'reference',
      width: 120,
      render: (entry) => (
        <Typography variant="body2" sx={{ fontWeight: 500, color: 'primary.main', fontSize: '0.8rem' }}>
          {entry.referenceNumber}
        </Typography>
      ),
      raw: true,
    },
    {
      key: 'date',
      width: 90,
      render: (entry) => formatDate(entry.entryDate),
    },
    {
      key: 'description',
      render: (entry) => (
        <Typography variant="body2" sx={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
          {entry.description}
        </Typography>
      ),
      raw: true,
    },
    {
      key: 'type',
      width: 120,
      render: (entry) => (
        <Chip label={ENTRY_TYPE_LABELS[entry.sourceType ?? ''] ?? 'Manual Entry'} size="small" />
      ),
      raw: true,
    },
    {
      key: 'source',
      width: 120,
      render: (entry) =>
        entry.sourceType && entry.sourceType !== 'manual' && entry.sourceId ? (
          <Link
            component="button"
            variant="body2"
            onClick={(e) => { e.stopPropagation(); onViewSource(entry.sourceType!, entry.sourceId!) }}
          >
            View Source
          </Link>
        ) : null,
      raw: true,
    },
    {
      key: 'debits',
      width: 90,
      render: (entry) => (
        <Typography variant="body2" sx={{ textAlign: 'right', fontSize: '0.8rem' }}>
          {formatCurrency(entry.totalDebits)}
        </Typography>
      ),
      raw: true,
    },
    {
      key: 'credits',
      width: 90,
      render: (entry) => (
        <Typography variant="body2" sx={{ textAlign: 'right', fontSize: '0.8rem' }}>
          {formatCurrency(entry.totalCredits)}
        </Typography>
      ),
      raw: true,
    },
    {
      key: 'status',
      width: 90,
      render: (entry) => <EntityStatusChip status={entry.status} />,
      raw: true,
    },
  ]

  return (
    <EntityTable
      rows={entries}
      columns={columns}
      loading={loading}
      total={total}
      label="Journal Entries"
      selectedId={selectedEntryId ?? undefined}
      focusedIndex={focusedIndex}
      onSelect={onSelect}
      listRef={listRef}
      dataAttr="journal-entry"
    />
  )
}
```

- [ ] **Step 2: Rewrite the table test**

Replace the entire test file with:

```typescript
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'

import { JournalEntriesTable } from './JournalEntriesTable'
import { JournalEntryStatus } from '@/types'

vi.mock('@/utils/formatters', () => ({
  formatCurrency: (value: number) => `$${value}`,
  formatDate: (date: string) => date,
}))

vi.mock('@/components/common/EntityStatusChip', () => ({
  EntityStatusChip: ({ status }: any) => <span>{status}</span>,
}))

const makeEntry = (overrides = {}) => ({
  id: '1',
  referenceNumber: 'JE-001',
  entryDate: '2026-01-01',
  description: 'Test entry',
  status: JournalEntryStatus.DRAFT,
  totalDebits: 100,
  totalCredits: 100,
  isBalanced: true,
  sourceType: 'manual',
  sourceId: null,
  lines: [],
  ...overrides,
})

const listRef = createRef<HTMLDivElement>()

describe('JournalEntriesTable', () => {
  const defaultProps = {
    entries: [],
    loading: false,
    total: 0,
    selectedEntryId: null,
    focusedIndex: -1,
    onSelect: vi.fn(),
    onViewSource: vi.fn(),
    listRef,
  }

  it('shows empty state when no entries', () => {
    render(<JournalEntriesTable {...defaultProps} />)
    expect(screen.getByText(/No Journal Entries found/i)).toBeInTheDocument()
  })

  it('renders entry rows', () => {
    render(<JournalEntriesTable {...defaultProps} entries={[makeEntry()]} total={1} />)
    expect(screen.getByText('JE-001')).toBeInTheDocument()
  })

  it('calls onSelect when row is clicked', () => {
    const onSelect = vi.fn()
    render(<JournalEntriesTable {...defaultProps} entries={[makeEntry()]} total={1} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('JE-001'))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }))
  })

  it('does not render checkboxes', () => {
    render(<JournalEntriesTable {...defaultProps} entries={[makeEntry()]} total={1} />)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('does not render Post or Delete action buttons', () => {
    render(<JournalEntriesTable {...defaultProps} entries={[makeEntry()]} total={1} />)
    expect(screen.queryByText('Post')).not.toBeInTheDocument()
    expect(screen.queryByText('Delete')).not.toBeInTheDocument()
  })

  it('shows View Source link for non-manual entries with a sourceId', () => {
    const onViewSource = vi.fn()
    render(
      <JournalEntriesTable
        {...defaultProps}
        entries={[makeEntry({ sourceType: 'sales_order', sourceId: 'so-1' })]}
        total={1}
        onViewSource={onViewSource}
      />
    )
    const link = screen.getByText('View Source')
    fireEvent.click(link)
    expect(onViewSource).toHaveBeenCalledWith('sales_order', 'so-1')
  })

  it('does not show View Source link for manual entries', () => {
    render(<JournalEntriesTable {...defaultProps} entries={[makeEntry({ sourceType: 'manual' })]} total={1} />)
    expect(screen.queryByText('View Source')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run the table test**

```bash
cd frontend && npx vitest run src/pages/accounting/components/JournalEntriesTable.test.tsx
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/accounting/components/JournalEntriesTable.tsx \
        frontend/src/pages/accounting/components/JournalEntriesTable.test.tsx
git commit -m "refactor(accounting): replace JournalEntriesTable with EntityTable wrapper"
```

---

## Task 3: Rewrite `JournalEntryContextHeader` as read-only info strip

Remove all action buttons. Display reference, status chips, date, description, debits, credits, and source link.

**Files:**
- Modify: `frontend/src/pages/accounting/components/JournalEntryContextHeader.tsx`

- [ ] **Step 1: Replace the file contents**

```typescript
import { Link, Paper, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material'
import { Chip, Stack } from '@mui/material'

import { EntityContextHeaderBar } from '@/components/common/EntityContextHeaderBar'
import { EntityStatusChip } from '@/components/common/EntityStatusChip'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { JournalEntry } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

const ENTRY_TYPE_LABELS: Record<string, string> = {
  manual: 'Manual Entry',
  sales_order: 'Sales Order',
  payment: 'Customer Payment',
  settlement: 'Settlement',
  goods_received_note: 'Goods Receipt',
  vendor_payment: 'Vendor Payment',
  stock_adjustment: 'Stock Adjustment',
  owner_equity_transaction: 'Owner Equity',
  expense: 'Expense',
  opening_balance: 'Opening Balance',
  fund_transfer: 'Fund Transfer',
}

const SOURCE_ROUTES: Record<string, (id: string) => string> = {
  sales_order: (id) => `/sales/orders?highlight=${id}`,
  payment: (id) => `/sales/payments?highlight=${id}`,
  goods_received_note: (id) => `/purchasing/goods-received?grnId=${id}`,
  vendor_payment: (id) => `/purchasing/vendor-payments?vpId=${id}`,
  expense: () => `/accounting/expenses`,
  owner_equity_transaction: () => `/accounting/owner-equity`,
  fund_transfer: () => `/accounting/fund-transfers`,
  stock_adjustment: (id) => `/inventory/stock-adjustments/${id}/edit`,
}

const labelSx = { fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem', width: 120, border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px }
const valueSx = { fontSize: '0.8rem', border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px }

interface Props {
  selectedEntry: JournalEntry | null
  onNavigateToSource: (path: string) => void
}

export function JournalEntryContextHeader({ selectedEntry, onNavigateToSource }: Props) {
  if (!selectedEntry) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
          Select a journal entry to view details
        </Typography>
      </Paper>
    )
  }

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <EntityContextHeaderBar
        title={selectedEntry.referenceNumber}
        statusChip={(
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <EntityStatusChip status={selectedEntry.status} />
            {selectedEntry.sourceType && (
              <Chip
                label={ENTRY_TYPE_LABELS[selectedEntry.sourceType] ?? selectedEntry.sourceType}
                size="small"
                variant="outlined"
              />
            )}
          </Stack>
        )}
      />
      <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px } }}>
        <TableBody>
          <TableRow>
            <TableCell sx={labelSx}>Date</TableCell>
            <TableCell sx={valueSx}>{formatDate(selectedEntry.entryDate)}</TableCell>
            <TableCell sx={labelSx}>Debits</TableCell>
            <TableCell sx={{ ...valueSx, textAlign: 'right' }}>{formatCurrency(selectedEntry.totalDebits)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell sx={labelSx}>Description</TableCell>
            <TableCell sx={valueSx}>{selectedEntry.description}</TableCell>
            <TableCell sx={labelSx}>Credits</TableCell>
            <TableCell sx={{ ...valueSx, textAlign: 'right' }}>{formatCurrency(selectedEntry.totalCredits)}</TableCell>
          </TableRow>
          {selectedEntry.sourceType && selectedEntry.sourceId && SOURCE_ROUTES[selectedEntry.sourceType] && (
            <TableRow>
              <TableCell sx={labelSx}>Source</TableCell>
              <TableCell colSpan={3} sx={valueSx}>
                <Link
                  component="button"
                  variant="body2"
                  onClick={() => onNavigateToSource(SOURCE_ROUTES[selectedEntry.sourceType!]!(selectedEntry.sourceId!))}
                >
                  View {ENTRY_TYPE_LABELS[selectedEntry.sourceType] ?? selectedEntry.sourceType}
                </Link>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Paper>
  )
}
```

- [ ] **Step 2: Run TypeScript check on this file**

```bash
cd frontend && npm run type-check 2>&1 | grep "JournalEntryContextHeader" | head -10
```

Expected: no errors in this file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/components/JournalEntryContextHeader.tsx
git commit -m "refactor(accounting): rewrite JournalEntryContextHeader as read-only info strip"
```

---

## Task 4: Align `JournalEntryWorkspaceCard` with `OrderWorkspaceCard`

Update the section header to use the `TableContainer/Table/TableBody/TableRow` pattern matching `OrderWorkspaceCard`.

**Files:**
- Modify: `frontend/src/pages/accounting/components/JournalEntryWorkspaceCard.tsx`

- [ ] **Step 1: Replace the file contents**

```typescript
import { Alert, Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import { JournalEntry } from '@/types'
import { formatCurrency } from '@/utils/formatters'

interface Props {
  selectedEntry: JournalEntry | null
}

export function JournalEntryWorkspaceCard({ selectedEntry }: Props) {
  if (!selectedEntry) return <Paper sx={{ flex: 1 }} />

  const lines = selectedEntry.lines ?? []
  const isBalanced = Math.abs(selectedEntry.totalDebits - selectedEntry.totalCredits) < 0.01

  return (
    <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <TableContainer>
        <Table size={TABLE_STYLES.size} sx={{ tableLayout: 'fixed', '& .MuiTableCell-root': { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px } }}>
          <TableBody>
            <TableRow>
              <TableCell colSpan={4} sx={{ pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}>
                <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Ledger Lines
                </Typography>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', p: TABLE_STYLES.cell.padding.px }}>
        {!isBalanced && (
          <Alert severity="warning" sx={{ mb: 1, fontSize: '0.8rem', py: 0.5 }}>
            Entry is not balanced — debits do not equal credits
          </Alert>
        )}
        <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
          <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': { borderBottom: TABLE_STYLES.cell.border, py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px } }}>
            <TableHead>
              <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50', fontSize: '0.8rem' } }}>
                <TableCell sx={{ width: '40%' }}>Account</TableCell>
                <TableCell sx={{ width: '30%' }}>Description</TableCell>
                <TableCell align="right" sx={{ width: '15%' }}>Debit</TableCell>
                <TableCell align="right" sx={{ width: '15%' }}>Credit</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {lines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center">
                    <Typography variant="body2" color="text.secondary">No ledger lines</Typography>
                  </TableCell>
                </TableRow>
              ) : lines.map((line, index) => (
                <TableRow key={line.id ?? index} hover>
                  <TableCell sx={{ fontSize: '0.8rem' }}>{line.account?.name ?? line.accountId}</TableCell>
                  <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>{line.memo ?? '—'}</TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{Number(line.debitAmount) > 0 ? formatCurrency(line.debitAmount) : '—'}</TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{Number(line.creditAmount) > 0 ? formatCurrency(line.creditAmount) : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Paper>
  )
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep "JournalEntryWorkspaceCard" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/components/JournalEntryWorkspaceCard.tsx
git commit -m "refactor(accounting): align JournalEntryWorkspaceCard with OrderWorkspaceCard layout"
```

---

## Task 5: Rewrite `JournalEntriesPage` — remove all action/dialog/bulk code

Wire the new `useJournalEntriesWorkspace` signature and remove everything related to mutations.

**Files:**
- Modify: `frontend/src/pages/accounting/JournalEntriesPage.tsx`

- [ ] **Step 1: Replace the file contents**

```typescript
import React, { useCallback, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import AccountMappingWarning from '@/components/accounting/AccountMappingWarning'
import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useGetJournalEntriesQuery } from '@/store/api/accountingApi'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'

import { JournalEntryContextHeader } from './components/JournalEntryContextHeader'
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

  const location = useLocation()
  const navigate = useNavigate()

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
  }), [appliedFilters, dateRange, sortBy, sortOrder, sourceTypeParam, sourceIdParam])

  const { data, isLoading, refetch } = useGetJournalEntriesQuery(queryArgs)
  const entries = data?.data ?? []
  const pagination = data?.meta

  const workspace = useJournalEntriesWorkspace({ entries, refetch })

  const filterHandlers = useMemo(() => ({
    ...handlers,
    onSearchChange: (value: string) => {
      handlers.onSearchChange(value)
      window.setTimeout(() => {
        workspace.searchInputRef.current?.focus()
      }, 0)
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
        subtitle="View accounting journal entries"
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
            total={pagination?.total ?? 0}
            selectedEntryId={workspace.selectedEntry?.id ?? null}
            focusedIndex={workspace.focusedIndex}
            onSelect={workspace.handleSelect}
            onViewSource={(sourceType, sourceId) => workspace.navigateToSource(sourceType, sourceId)}
            listRef={workspace.listRef}
          />
        )}
        headerSlot={(
          <JournalEntryContextHeader
            selectedEntry={workspace.selectedEntry}
            onNavigateToSource={(path) => navigate(path)}
          />
        )}
        workspaceSlot={<JournalEntryWorkspaceCard selectedEntry={workspace.selectedEntry} />}
      />
    </>
  )
}

export default JournalEntriesPage
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "JournalEntriesPage|useJournalEntriesWorkspace" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/JournalEntriesPage.tsx \
        frontend/src/pages/accounting/hooks/useJournalEntriesWorkspace.ts
git commit -m "refactor(accounting): rewrite JournalEntriesPage as read-only list, wire useEntityWorkspace"
```

---

## Task 6: Remove form routes from router and delete form page files

**Files:**
- Modify: `frontend/src/router.tsx`
- Delete: `frontend/src/pages/accounting/JournalEntryFormPage.tsx`
- Delete: `frontend/src/pages/accounting/__tests__/JournalEntryFormPage.test.tsx`

- [ ] **Step 1: Remove routes from router**

In `frontend/src/router.tsx`, remove these three lines:

```tsx
// Remove this import (line ~77):
const JournalEntryFormPage = React.lazy(() => import('./pages/accounting/JournalEntryFormPage'))

// Remove these two routes (lines ~208-209):
{ path: '/accounting/journal-entries/new', element: <JournalEntryFormPage />, handle: { title: 'Create Journal Entry' } },
{ path: '/accounting/journal-entries/:id/edit', element: <JournalEntryFormPage />, handle: { title: 'Edit Journal Entry' } },
```

Keep the existing catch-all redirect:
```tsx
{ path: '/accounting/journal-entries/:id', element: <Navigate to="/accounting/journal-entries" replace /> },
```

- [ ] **Step 2: Delete the form page files**

```bash
rm frontend/src/pages/accounting/JournalEntryFormPage.tsx
rm frontend/src/pages/accounting/__tests__/JournalEntryFormPage.test.tsx
```

- [ ] **Step 3: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/router.tsx
git rm frontend/src/pages/accounting/JournalEntryFormPage.tsx \
        frontend/src/pages/accounting/__tests__/JournalEntryFormPage.test.tsx
git commit -m "refactor(accounting): remove JournalEntryFormPage and its routes (entries are auto-generated)"
```

---

## Task 7: Update `JournalEntriesPage` test

Remove mock stubs for mutations that no longer exist, and remove dialog/bulk action assertions.

**Files:**
- Modify: `frontend/src/pages/accounting/__tests__/JournalEntriesPage.test.tsx`

- [ ] **Step 1: Replace the file contents**

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'

import JournalEntriesPage from '../JournalEntriesPage'
import { JournalEntryStatus } from '@/types'

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))
vi.mock('@/components/accounting/AccountMappingWarning', () => ({ default: () => null }))
vi.mock('@/utils/formatters', async () => {
  const actual = await vi.importActual<typeof import('@/utils/formatters')>('@/utils/formatters')
  return {
    ...actual,
    formatCurrency: (value: number) => `$${value}`,
    formatDate: (date: string) => date,
    getCurrentDate: () => '2026-04-19',
  }
})
vi.mock('@/utils/dateRange', () => ({
  getPeriodDateRange: () => ({ from: undefined, to: undefined }),
  getStartOfWeek: () => 0,
}))

const mockedApi = vi.hoisted(() => ({
  useGetJournalEntriesQuery: vi.fn(),
  useLazyGetJournalEntryQuery: vi.fn(),
}))

const mockNavigate = vi.fn()
const mockLocation = { search: '', pathname: '/accounting/journal-entries' }

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => mockLocation,
  }
})

vi.mock('@/store/api/accountingApi', () => mockedApi)

const mockEntry = {
  id: '1',
  referenceNumber: 'JE-001',
  entryDate: '2026-01-01',
  description: 'Test',
  status: JournalEntryStatus.POSTED,
  totalDebits: 100,
  totalCredits: 100,
  isBalanced: true,
  isDraft: false,
  isPosted: true,
  isReversed: false,
  fiscalPeriodId: 'fp1',
  lines: [],
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
}

describe('JournalEntriesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.useGetJournalEntriesQuery.mockReturnValue({
      data: { data: [mockEntry], meta: { total: 1 } },
      isLoading: false,
      refetch: vi.fn(),
    })
    mockedApi.useLazyGetJournalEntryQuery.mockReturnValue([vi.fn().mockResolvedValue({ id: '1' })])
  })

  it('renders the page title', () => {
    render(<BrowserRouter><JournalEntriesPage /></BrowserRouter>)
    expect(screen.getByText('Journal Entries')).toBeInTheDocument()
  })

  it('renders journal entry rows', () => {
    render(<BrowserRouter><JournalEntriesPage /></BrowserRouter>)
    expect(screen.getByText('JE-001')).toBeInTheDocument()
  })

  it('clicking a row selects it instead of navigating', async () => {
    render(<BrowserRouter><JournalEntriesPage /></BrowserRouter>)
    fireEvent.click(screen.getByText('JE-001'))
    await waitFor(() => {
      expect(screen.getAllByText('JE-001').length).toBeGreaterThan(1)
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('does not render a New Journal Entry button', () => {
    render(<BrowserRouter><JournalEntriesPage /></BrowserRouter>)
    expect(screen.queryByText(/new journal entry/i)).not.toBeInTheDocument()
  })

  it('does not render bulk action buttons', () => {
    render(<BrowserRouter><JournalEntriesPage /></BrowserRouter>)
    expect(screen.queryByText(/post selected/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/delete selected/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the page test**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/JournalEntriesPage.test.tsx
```

Expected: all tests pass.

- [ ] **Step 3: Run the full accounting test suite**

```bash
cd frontend && npx vitest run src/pages/accounting
```

Expected: all tests pass, no files fail.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/accounting/__tests__/JournalEntriesPage.test.tsx
git commit -m "test(accounting): update JournalEntriesPage test for read-only redesign"
```

---

## Task 8: Final type-check and close issue

- [ ] **Step 1: Full TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: exit 0, no errors.

- [ ] **Step 2: Run full accounting test suite one more time**

```bash
cd frontend && npx vitest run src/pages/accounting
```

Expected: all pass.

- [ ] **Step 3: Create PR closing issue #464**

```bash
gh pr create \
  --title "refactor(accounting): redesign Journal Entries as read-only list page" \
  --body "$(cat <<'EOF'
## Summary
- Replaces custom `JournalEntriesTable` with `EntityTable` wrapper (columns: reference, date, description, type, source, debits, credits, status)
- Rewrites `JournalEntryContextHeader` as a read-only info strip using `EntityContextHeaderBar` — no action buttons
- Aligns `JournalEntryWorkspaceCard` layout with `OrderWorkspaceCard`
- Migrates `useJournalEntriesWorkspace` to delegate to `useEntityWorkspace` for focus/keyboard navigation
- Deletes `JournalEntryFormPage` and its `/new` and `/:id/edit` routes (entries are auto-generated)
- Removes all bulk-select checkboxes, per-row action buttons, Post/Delete/Reverse/Edit actions, and the "New Journal Entry" button

Closes #464

## Test plan
- [ ] `npx vitest run src/pages/accounting` — all pass
- [ ] `npm run type-check` — no errors
- [ ] Manually verify: list renders, row click selects and shows context header + workspace card, source link navigates correctly, no action buttons anywhere

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
