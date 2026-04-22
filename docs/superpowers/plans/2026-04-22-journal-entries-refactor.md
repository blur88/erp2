# Journal Entries Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the Journal Entries module's components and hook with the Sales/Purchasing module pattern — remove all bulk selection, replace the table with `EntityTable`, rewrite the context header to use the two-column Grid layout, and dedup `SOURCE_ROUTES`.

**Architecture:** Six focused file changes, no new files created. The hook is simplified first, then components updated top-down so that type errors surface immediately. Tests are updated in the same task as the code they cover.

**Tech Stack:** React 19, TypeScript, MUI v7, RTK Query, Vitest

---

## File Map

| File | Change |
|------|--------|
| `frontend/src/pages/accounting/hooks/useJournalEntriesWorkspace.ts` | Remove bulk state/handlers, dedup SOURCE_ROUTES |
| `frontend/src/pages/accounting/components/JournalEntriesTable.tsx` | Rewrite using EntityTable, remove checkboxes/actions |
| `frontend/src/pages/accounting/components/JournalEntriesTable.test.tsx` | Rewrite to match new props |
| `frontend/src/pages/accounting/components/JournalEntryContextHeader.tsx` | Rewrite to Grid layout with detailTableSx |
| `frontend/src/pages/accounting/components/JournalEntryWorkspaceCard.tsx` | Minor style alignment |
| `frontend/src/pages/accounting/components/JournalEntriesDialogs.tsx` | Remove bulk dialogs |
| `frontend/src/pages/accounting/JournalEntriesPage.tsx` | Remove bulk prop threading |
| `frontend/src/pages/accounting/__tests__/JournalEntriesPage.test.tsx` | Remove bulk mock setup |

---

## Task 1: Simplify `useJournalEntriesWorkspace`

Remove all bulk state and handlers. Dedup `SOURCE_ROUTES` (currently copy-pasted in both the hook and `JournalEntryContextHeader`).

**Files:**
- Modify: `frontend/src/pages/accounting/hooks/useJournalEntriesWorkspace.ts`

- [ ] **Step 1: Replace the entire file with the simplified version**

```typescript
import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useNotification } from '@/hooks/useNotification'
import {
  useDeleteJournalEntryMutation,
  useLazyGetJournalEntryQuery,
  usePostJournalEntryMutation,
  useReverseJournalEntryMutation,
} from '@/store/api/accountingApi'
import { JournalEntry } from '@/types'
import { getErrorMessage } from '@/utils/errorMessage'

export const SOURCE_ROUTES: Record<string, (id: string) => string> = {
  sales_order: (id) => `/sales/orders?highlight=${id}`,
  payment: (id) => `/sales/payments?highlight=${id}`,
  goods_received_note: (id) => `/purchasing/goods-received?grnId=${id}`,
  vendor_payment: (id) => `/purchasing/vendor-payments?vpId=${id}`,
  expense: () => `/accounting/expenses`,
  owner_equity_transaction: () => `/accounting/owner-equity`,
  fund_transfer: () => `/accounting/fund-transfers`,
  stock_adjustment: (id) => `/inventory/stock-adjustments/${id}/edit`,
}

export function useJournalEntriesWorkspace(refetch: () => void) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()

  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null)
  const [postTarget, setPostTarget] = useState<JournalEntry | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<JournalEntry | null>(null)
  const [reverseTarget, setReverseTarget] = useState<JournalEntry | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const [fetchEntry] = useLazyGetJournalEntryQuery()
  const [postJournalEntry] = usePostJournalEntryMutation()
  const [reverseJournalEntry] = useReverseJournalEntryMutation()
  const [deleteJournalEntry] = useDeleteJournalEntryMutation()

  const handleSelect = useCallback(async (entry: JournalEntry) => {
    setSelectedEntry(entry)
    try {
      const fresh = await fetchEntry(entry.id).unwrap()
      setSelectedEntry(fresh)
    }
    catch { /* keep list-row data */ }
  }, [fetchEntry])

  const handleConfirmPost = useCallback(async () => {
    if (!postTarget) return
    setActionLoading(true)
    try {
      await postJournalEntry(postTarget.id).unwrap()
      showSuccess(`Journal entry ${postTarget.referenceNumber} posted`)
      setPostTarget(null)
      setSelectedEntry(null)
      refetch()
    }
    catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to post journal entry'))
    }
    finally {
      setActionLoading(false)
    }
  }, [postTarget, postJournalEntry, showSuccess, showError, refetch])

  const handleConfirmReverse = useCallback(async (reverseDate: string) => {
    if (!reverseTarget) return
    setActionLoading(true)
    try {
      const result = await reverseJournalEntry({ id: reverseTarget.id, reverseDate }).unwrap()
      showSuccess(`Journal entry ${reverseTarget.referenceNumber} reversed`)
      setReverseTarget(null)
      setSelectedEntry(result)
      refetch()
    }
    catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to reverse journal entry'))
    }
    finally {
      setActionLoading(false)
    }
  }, [reverseTarget, reverseJournalEntry, showSuccess, showError, refetch])

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    setActionLoading(true)
    try {
      await deleteJournalEntry(deleteTarget.id).unwrap()
      showSuccess(`Journal entry ${deleteTarget.referenceNumber} deleted`)
      setDeleteTarget(null)
      setSelectedEntry(null)
      refetch()
    }
    catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to delete journal entry'))
    }
    finally {
      setActionLoading(false)
    }
  }, [deleteTarget, deleteJournalEntry, showSuccess, showError, refetch])

  return {
    selectedEntry,
    postTarget,
    setPostTarget,
    deleteTarget,
    setDeleteTarget,
    reverseTarget,
    setReverseTarget,
    actionLoading,
    searchInputRef,
    listRef,
    handleSelect,
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
cd frontend && npm run type-check 2>&1 | head -40
```

Expected: errors only in files that still reference the removed props (`JournalEntriesTable`, `JournalEntriesPage`, `JournalEntriesDialogs`) — not in the hook itself.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/hooks/useJournalEntriesWorkspace.ts
git commit -m "refactor(accounting): simplify useJournalEntriesWorkspace, dedup SOURCE_ROUTES (issue #416)"
```

---

## Task 2: Rewrite `JournalEntriesTable` using `EntityTable`

Remove checkboxes, bulk selection, and per-row action buttons. Pure display list.

**Files:**
- Modify: `frontend/src/pages/accounting/components/JournalEntriesTable.tsx`
- Modify: `frontend/src/pages/accounting/components/JournalEntriesTable.test.tsx`

- [ ] **Step 1: Rewrite the test file first**

```typescript
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { JournalEntriesTable } from './JournalEntriesTable'
import { JournalEntryStatus } from '@/types'

vi.mock('@/utils/formatters', () => ({
  formatCurrency: (value: number) => `$${value}`,
  formatDate: (date: string) => date,
}))

vi.mock('@/components/common/EntityTable', () => ({
  default: ({ rows, loading, label, onSelect }: any) => (
    <div>
      {loading && <div>Loading...</div>}
      {rows.length === 0 && <div>No {label} found</div>}
      {rows.map((row: any) => (
        <div key={row.id} onClick={() => onSelect(row)} data-testid={`row-${row.id}`}>
          {row.referenceNumber}
        </div>
      ))}
    </div>
  ),
}))

const makeEntry = (overrides = {}) => ({
  id: '1',
  referenceNumber: 'JE-001',
  entryDate: '2026-01-01',
  description: 'Test entry',
  status: JournalEntryStatus.DRAFT,
  totalDebits: 100,
  totalCredits: 100,
  sourceType: 'manual',
  sourceId: null,
  lines: [],
  ...overrides,
})

describe('JournalEntriesTable', () => {
  const defaultProps = {
    entries: [],
    loading: false,
    selectedEntryId: null,
    onSelect: vi.fn(),
  }

  it('shows empty state when no entries', () => {
    render(<JournalEntriesTable {...defaultProps} />)
    expect(screen.getByText('No Journal Entries found')).toBeInTheDocument()
  })

  it('renders entry rows', () => {
    render(<JournalEntriesTable {...defaultProps} entries={[makeEntry()]} />)
    expect(screen.getByText('JE-001')).toBeInTheDocument()
  })

  it('calls onSelect when row is clicked', () => {
    const onSelect = vi.fn()
    render(<JournalEntriesTable {...defaultProps} entries={[makeEntry()]} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('JE-001'))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }))
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd frontend && npx vitest run src/pages/accounting/components/JournalEntriesTable.test.tsx 2>&1 | tail -20
```

Expected: FAIL — old component has wrong props.

- [ ] **Step 3: Rewrite `JournalEntriesTable.tsx`**

```typescript
import { useRef, type RefObject } from 'react'
import { Chip, Link, Typography } from '@mui/material'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import { JournalEntry, JournalEntryStatus } from '@/types'
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

function statusColor(status: JournalEntryStatus) {
  if (status === JournalEntryStatus.POSTED) return 'success' as const
  if (status === JournalEntryStatus.REVERSED) return 'error' as const
  return 'default' as const
}

interface Props {
  entries: JournalEntry[]
  loading: boolean
  selectedEntryId: string | null
  onSelect: (entry: JournalEntry) => void
  onViewSource?: (sourceType: string, sourceId: string) => void
  listRef?: RefObject<HTMLDivElement | null>
}

export function JournalEntriesTable({ entries, loading, selectedEntryId, onSelect, onViewSource, listRef }: Props) {
  const fallbackRef = useRef<HTMLDivElement | null>(null)

  const columns: ColumnConfig<JournalEntry>[] = [
    {
      key: 'referenceNumber',
      raw: true,
      render: (entry) => (
        <Typography variant="body2" sx={{ fontWeight: 500, color: 'primary.main', fontSize: '0.8rem' }}>
          {entry.referenceNumber}
        </Typography>
      ),
    },
    {
      key: 'entryDate',
      render: (entry) => formatDate(entry.entryDate),
    },
    {
      key: 'description',
      render: (entry) => entry.description,
    },
    {
      key: 'sourceType',
      raw: true,
      render: (entry) => (
        <Chip label={ENTRY_TYPE_LABELS[entry.sourceType ?? ''] ?? 'Manual Entry'} size="small" />
      ),
    },
    {
      key: 'source',
      raw: true,
      render: (entry) =>
        entry.sourceType && entry.sourceType !== 'manual' && entry.sourceId && onViewSource ? (
          <Link
            component="button"
            variant="body2"
            onClick={(e) => { e.stopPropagation(); onViewSource(entry.sourceType!, entry.sourceId!) }}
          >
            View Transaction
          </Link>
        ) : null,
    },
    {
      key: 'totalDebits',
      render: (entry) => formatCurrency(entry.totalDebits),
    },
    {
      key: 'totalCredits',
      render: (entry) => formatCurrency(entry.totalCredits),
    },
    {
      key: 'status',
      raw: true,
      render: (entry) => (
        <Chip label={entry.status} color={statusColor(entry.status)} size="small" />
      ),
    },
  ]

  return (
    <EntityTable
      rows={entries}
      columns={columns}
      loading={loading}
      total={entries.length}
      label="Journal Entries"
      selectedId={selectedEntryId ?? undefined}
      focusedIndex={-1}
      onSelect={onSelect}
      listRef={listRef ?? fallbackRef}
      dataAttr="entry"
    />
  )
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd frontend && npx vitest run src/pages/accounting/components/JournalEntriesTable.test.tsx 2>&1 | tail -20
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/accounting/components/JournalEntriesTable.tsx \
        frontend/src/pages/accounting/components/JournalEntriesTable.test.tsx
git commit -m "refactor(accounting): replace JournalEntriesTable with EntityTable, remove bulk selection (issue #416)"
```

---

## Task 3: Rewrite `JournalEntryContextHeader` to Grid layout

Match the `OrderContextHeader` / `ChartOfAccountContextHeader` pattern exactly.

**Files:**
- Modify: `frontend/src/pages/accounting/components/JournalEntryContextHeader.tsx`

- [ ] **Step 1: Replace the entire file**

```typescript
import { Box, Chip, Link, Paper, Table, TableBody, TableCell, TableContainer, TableRow, Typography } from '@mui/material'
import Grid from '@mui/material/Grid'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'
import { default as PostIcon } from '@mui/icons-material/PostAdd'
import { default as ReverseIcon } from '@mui/icons-material/Undo'

import { AppButton } from '@/components/common/AppButton'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { JournalEntry, JournalEntryStatus } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

import { SOURCE_ROUTES } from '../hooks/useJournalEntriesWorkspace'

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

const detailTableSx = {
  tableLayout: 'fixed',
  '& .MuiTableCell-root': {
    border: 'none',
    py: TABLE_STYLES.cell.padding.py,
    px: TABLE_STYLES.cell.padding.px,
    '&:nth-of-type(1)': { width: '40%' },
    '&:nth-of-type(2)': { width: '60%' },
  },
}

const labelCellSx = {
  fontWeight: 600,
  color: 'text.secondary',
  fontSize: '0.8rem',
}

const valueCellSx = {
  fontSize: '0.8rem',
}

const sectionHeaderCellSx = {
  pb: TABLE_STYLES.cell.padding.py * 0.67,
  py: TABLE_STYLES.cell.padding.py * 0.67,
  borderTop: TABLE_STYLES.cell.border,
}

function statusColor(status: JournalEntryStatus) {
  if (status === JournalEntryStatus.POSTED) return 'success' as const
  if (status === JournalEntryStatus.REVERSED) return 'error' as const
  return 'default' as const
}

interface Props {
  selectedEntry: JournalEntry | null
  onEdit: () => void
  onPost: () => void
  onReverse: () => void
  onDelete: () => void
  onViewSource: (sourceType: string, sourceId: string) => void
}

export function JournalEntryContextHeader({ selectedEntry, onEdit, onPost, onReverse, onDelete, onViewSource }: Props) {
  if (!selectedEntry) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
          Select a journal entry to view details
        </Typography>
      </Paper>
    )
  }

  const isDraft = selectedEntry.status === JournalEntryStatus.DRAFT
  const isPosted = selectedEntry.status === JournalEntryStatus.POSTED
  const isBalanced = Math.abs(selectedEntry.totalDebits - selectedEntry.totalCredits) < 0.01
  const hasSource = selectedEntry.sourceType && selectedEntry.sourceId && SOURCE_ROUTES[selectedEntry.sourceType]

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <Box
        sx={{
          p: TABLE_STYLES.cell.padding.px,
          borderBottom: TABLE_STYLES.cell.border,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Typography
          variant="tableHeader"
          sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
        >
          JE Details — {selectedEntry.referenceNumber}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {isDraft && (
            <>
              <AppButton size="small" variant="outlined" startIcon={<EditIcon />} onClick={onEdit}>Edit</AppButton>
              <AppButton size="small" variant="success" startIcon={<PostIcon />} onClick={onPost} disabled={!isBalanced}>Post</AppButton>
              <AppButton size="small" variant="danger" startIcon={<DeleteIcon />} onClick={onDelete}>Delete</AppButton>
            </>
          )}
          {isPosted && (
            <AppButton size="small" variant="warning" startIcon={<ReverseIcon />} onClick={onReverse}>Reverse</AppButton>
          )}
        </Box>
      </Box>

      <Box sx={{ p: TABLE_STYLES.cell.padding.px }}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={detailTableSx}>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={2} sx={sectionHeaderCellSx}>
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                        Entry Information
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Date</TableCell>
                    <TableCell sx={valueCellSx}>{formatDate(selectedEntry.entryDate)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Description</TableCell>
                    <TableCell sx={valueCellSx}>{selectedEntry.description}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Type</TableCell>
                    <TableCell sx={valueCellSx}>
                      <Chip
                        size="small"
                        label={ENTRY_TYPE_LABELS[selectedEntry.sourceType ?? ''] ?? 'Manual Entry'}
                      />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Source</TableCell>
                    <TableCell sx={valueCellSx}>
                      {hasSource ? (
                        <Link
                          component="button"
                          variant="body2"
                          onClick={() => onViewSource(selectedEntry.sourceType!, selectedEntry.sourceId!)}
                        >
                          View {ENTRY_TYPE_LABELS[selectedEntry.sourceType!] ?? selectedEntry.sourceType}
                        </Link>
                      ) : '—'}
                    </TableCell>
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
                        Financials
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Status</TableCell>
                    <TableCell sx={valueCellSx}>
                      <Chip label={selectedEntry.status} color={statusColor(selectedEntry.status)} size="small" />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Debits</TableCell>
                    <TableCell sx={valueCellSx}>{formatCurrency(selectedEntry.totalDebits)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Credits</TableCell>
                    <TableCell sx={valueCellSx}>{formatCurrency(selectedEntry.totalCredits)}</TableCell>
                  </TableRow>
                  {!isBalanced && (
                    <TableRow>
                      <TableCell sx={labelCellSx}>Balance</TableCell>
                      <TableCell sx={valueCellSx}>
                        <Chip label="Unbalanced" color="warning" size="small" />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
        </Grid>
      </Box>
    </Paper>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | head -40
```

Expected: errors only in `JournalEntriesPage.tsx` (still passes old `onNavigateToSource` prop).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/components/JournalEntryContextHeader.tsx
git commit -m "refactor(accounting): rewrite JournalEntryContextHeader to Grid layout (issue #416)"
```

---

## Task 4: Align `JournalEntryWorkspaceCard` styling

Minor: ensure `headerSx` exactly matches other workspace cards.

**Files:**
- Modify: `frontend/src/pages/accounting/components/JournalEntryWorkspaceCard.tsx`

- [ ] **Step 1: Update `headerSx` to use `px` for both padding axes**

Current code at line 19:
```typescript
<Box sx={{ px: 2, py: 1, borderBottom: TABLE_STYLES.cell.border }}>
```

Replace with:
```typescript
<Box sx={{ px: TABLE_STYLES.cell.padding.px, py: 1, borderBottom: TABLE_STYLES.cell.border }}>
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep WorkspaceCard
```

Expected: no output (no errors in this file).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/components/JournalEntryWorkspaceCard.tsx
git commit -m "refactor(accounting): align JournalEntryWorkspaceCard header padding (issue #416)"
```

---

## Task 5: Remove bulk dialogs from `JournalEntriesDialogs`

**Files:**
- Modify: `frontend/src/pages/accounting/components/JournalEntriesDialogs.tsx`

- [ ] **Step 1: Replace the entire file**

```typescript
import { useState } from 'react'
import { getCurrentDate } from '@/utils/formatters'

import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import { JournalEntry } from '@/types'

interface Props {
  postTarget: JournalEntry | null
  deleteTarget: JournalEntry | null
  reverseTarget: JournalEntry | null
  actionLoading: boolean
  onConfirmPost: () => void
  onConfirmDelete: () => void
  onConfirmReverse: (reverseDate: string) => void
  onCancelPost: () => void
  onCancelDelete: () => void
  onCancelReverse: () => void
}

export function JournalEntriesDialogs({
  postTarget,
  deleteTarget,
  reverseTarget,
  actionLoading,
  onConfirmPost,
  onConfirmDelete,
  onConfirmReverse,
  onCancelPost,
  onCancelDelete,
  onCancelReverse,
}: Props) {
  const [reverseDate] = useState(getCurrentDate())

  return (
    <>
      <ConfirmationDialog
        open={!!postTarget}
        title="Post Journal Entry"
        message={`Post journal entry ${postTarget?.referenceNumber}? This cannot be undone.`}
        confirmText="Post"
        cancelText="Cancel"
        onConfirm={onConfirmPost}
        onCancel={onCancelPost}
        loading={actionLoading}
      />
      <ConfirmationDialog
        open={!!deleteTarget}
        title="Delete Journal Entry"
        message={`Delete journal entry ${deleteTarget?.referenceNumber}? This cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
        loading={actionLoading}
      />
      <ConfirmationDialog
        open={!!reverseTarget}
        title="Reverse Journal Entry"
        message={`Reverse journal entry ${reverseTarget?.referenceNumber}? A new reversing entry will be created.`}
        confirmText="Reverse"
        cancelText="Cancel"
        onConfirm={() => onConfirmReverse(reverseDate)}
        onCancel={onCancelReverse}
        loading={actionLoading}
      />
    </>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep Dialogs
```

Expected: errors in `JournalEntriesPage.tsx` only (still passing removed props).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/components/JournalEntriesDialogs.tsx
git commit -m "refactor(accounting): remove bulk dialogs from JournalEntriesDialogs (issue #416)"
```

---

## Task 6: Update `JournalEntriesPage` — remove bulk prop threading

**Files:**
- Modify: `frontend/src/pages/accounting/JournalEntriesPage.tsx`
- Modify: `frontend/src/pages/accounting/__tests__/JournalEntriesPage.test.tsx`

- [ ] **Step 1: Replace the entire page file**

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
  const workspace = useJournalEntriesWorkspace(() => { void refetch() })

  const filterHandlers = useMemo(() => ({
    ...handlers,
    onSearchChange: (value: string) => {
      handlers.onSearchChange(value)
      window.setTimeout(() => { workspace.searchInputRef.current?.focus() }, 0)
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
            selectedEntryId={workspace.selectedEntry?.id ?? null}
            onSelect={workspace.handleSelect}
            onViewSource={workspace.navigateToSource}
            listRef={workspace.listRef}
          />
        )}
        headerSlot={(
          <JournalEntryContextHeader
            selectedEntry={workspace.selectedEntry}
            onEdit={() => workspace.selectedEntry && workspace.navigateToEdit(workspace.selectedEntry)}
            onPost={() => workspace.selectedEntry && workspace.setPostTarget(workspace.selectedEntry)}
            onReverse={() => workspace.selectedEntry && workspace.setReverseTarget(workspace.selectedEntry)}
            onDelete={() => workspace.selectedEntry && workspace.setDeleteTarget(workspace.selectedEntry)}
            onViewSource={workspace.navigateToSource}
          />
        )}
        workspaceSlot={<JournalEntryWorkspaceCard selectedEntry={workspace.selectedEntry} />}
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

- [ ] **Step 2: Update the page test — remove bulk mock setup**

Replace `frontend/src/pages/accounting/__tests__/JournalEntriesPage.test.tsx`:

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
    getCurrentDate: () => '2026-04-22',
  }
})
vi.mock('@/utils/dateRange', () => ({
  getPeriodDateRange: () => ({ from: undefined, to: undefined }),
  getStartOfWeek: () => 0,
}))

const mockedApi = vi.hoisted(() => ({
  useGetJournalEntriesQuery: vi.fn(),
  useLazyGetJournalEntryQuery: vi.fn(),
  useDeleteJournalEntryMutation: vi.fn(),
  usePostJournalEntryMutation: vi.fn(),
  useReverseJournalEntryMutation: vi.fn(),
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
    mockedApi.useDeleteJournalEntryMutation.mockReturnValue([vi.fn()])
    mockedApi.usePostJournalEntryMutation.mockReturnValue([vi.fn()])
    mockedApi.useReverseJournalEntryMutation.mockReturnValue([vi.fn()])
  })

  it('renders the page title', () => {
    render(<BrowserRouter><JournalEntriesPage /></BrowserRouter>)
    expect(screen.getByText('Journal Entries')).toBeInTheDocument()
  })

  it('renders journal entry rows', () => {
    render(<BrowserRouter><JournalEntriesPage /></BrowserRouter>)
    expect(screen.getByText('JE-001')).toBeInTheDocument()
  })

  it('clicking a row selects it and shows details in the context header', async () => {
    render(<BrowserRouter><JournalEntriesPage /></BrowserRouter>)

    fireEvent.click(screen.getByText('JE-001'))

    await waitFor(() => {
      expect(screen.getAllByText('JE-001').length).toBeGreaterThan(1)
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Type-check — should be clean**

```bash
cd frontend && npm run type-check 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Run both test files**

```bash
cd frontend && npx vitest run \
  src/pages/accounting/components/JournalEntriesTable.test.tsx \
  src/pages/accounting/__tests__/JournalEntriesPage.test.tsx \
  2>&1 | tail -20
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/accounting/JournalEntriesPage.tsx \
        frontend/src/pages/accounting/__tests__/JournalEntriesPage.test.tsx
git commit -m "refactor(accounting): update JournalEntriesPage, remove bulk prop threading (issue #416)"
```

---

## Task 7: Final verification

- [ ] **Step 1: Run full type-check**

```bash
cd frontend && npm run type-check 2>&1
```

Expected: no errors.

- [ ] **Step 2: Run all changed test files**

```bash
cd frontend && npx vitest run \
  src/pages/accounting/components/JournalEntriesTable.test.tsx \
  src/pages/accounting/__tests__/JournalEntriesPage.test.tsx \
  2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 3: Run lint**

```bash
cd frontend && npm run lint 2>&1 | grep -E "accounting/.*Journal" | head -20
```

Expected: no errors in Journal Entries files.

- [ ] **Step 4: Open a PR**

```bash
gh pr create \
  --title "refactor(accounting): align Journal Entries components with module pattern (issue #416)" \
  --body "$(cat <<'EOF'
## Summary
- Replaced `JournalEntriesTable` custom table with `EntityTable` — no checkboxes, no per-row actions
- Removed all bulk post/delete state and handlers from hook, page, and dialogs
- Rewrote `JournalEntryContextHeader` to use two-column Grid layout with `detailTableSx`/`labelCellSx`/`valueCellSx` matching Sales/COA pattern
- Deduplicated `SOURCE_ROUTES` — defined once in the hook, exported for header use
- Aligned `JournalEntryWorkspaceCard` header padding

Closes #416

## Test plan
- [ ] All existing tests pass
- [ ] Type-check clean
- [ ] Journal Entries page loads and displays entries
- [ ] Clicking a row shows details in context header
- [ ] Post/Delete/Reverse actions work from context header
- [ ] Navigate-to-source link works from context header and table

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
