# Issue #420: Normalize JE UI with Sales Module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove custom font/color styling from the JE list column and replace Chip components in the JE detail header with plain text, matching the Sales module's visual patterns.

**Architecture:** Two isolated component edits — `JournalEntriesTable.tsx` drops its custom `Typography` render and `JournalEntryContextHeader.tsx` replaces three `Chip` usages with inline text. No backend changes, no new files.

**Tech Stack:** React 19, MUI v7, TypeScript, Vitest

---

## Files

| Action | File |
|--------|------|
| Modify | `frontend/src/pages/accounting/components/JournalEntriesTable.tsx` |
| Modify | `frontend/src/pages/accounting/components/JournalEntryContextHeader.tsx` |
| Verify | `frontend/src/pages/accounting/components/JournalEntriesTable.test.tsx` (no change expected) |

---

### Task 1: Simplify `JournalEntriesTable.tsx`

**Files:**
- Modify: `frontend/src/pages/accounting/components/JournalEntriesTable.tsx`
- Verify: `frontend/src/pages/accounting/components/JournalEntriesTable.test.tsx`

- [ ] **Step 1: Verify existing test passes before touching anything**

```bash
cd frontend && npx vitest run src/pages/accounting/components/JournalEntriesTable.test.tsx
```

Expected: all 3 tests PASS.

- [ ] **Step 2: Replace the component file content**

Replace the entire file `frontend/src/pages/accounting/components/JournalEntriesTable.tsx` with:

```tsx
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
  onSelect: (entry: JournalEntry) => void
  listRef?: RefObject<HTMLDivElement | null>
}

export function JournalEntriesTable({
  entries,
  loading,
  total,
  selectedEntryId,
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
      focusedIndex={-1}
      onSelect={onSelect}
      listRef={listRef ?? fallbackRef}
      dataAttr="entry"
    />
  )
}
```

Changes from original: removed `Typography` import, removed `raw: true`, replaced custom `Typography` render with plain string render — matching `OrdersTable.tsx` exactly.

- [ ] **Step 3: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "JournalEntriesTable|error TS" | head -20
```

Expected: no errors for this file.

- [ ] **Step 4: Run the test**

```bash
cd frontend && npx vitest run src/pages/accounting/components/JournalEntriesTable.test.tsx
```

Expected: all 3 tests PASS (the mock bypasses column renders so no test change needed).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/accounting/components/JournalEntriesTable.tsx
git commit -m "refactor(accounting): normalize JournalEntriesTable column style to match Sales module (issue #420)"
```

---

### Task 2: Replace Chips with plain text in `JournalEntryContextHeader.tsx`

**Files:**
- Modify: `frontend/src/pages/accounting/components/JournalEntryContextHeader.tsx`

- [ ] **Step 1: Replace the entire file content**

Replace `frontend/src/pages/accounting/components/JournalEntryContextHeader.tsx` with:

```tsx
import { Box, Link, Paper, Table, TableBody, TableCell, TableContainer, TableRow, Typography } from '@mui/material'
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

interface Props {
  selectedEntry: JournalEntry | null
  onEdit: () => void
  onPost: () => void
  onReverse: () => void
  onDelete: () => void
  onViewSource: (sourceType: string, sourceId: string) => void
}

export function JournalEntryContextHeader({
  selectedEntry,
  onEdit,
  onPost,
  onReverse,
  onDelete,
  onViewSource,
}: Props) {
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
          JE Details - {selectedEntry.referenceNumber}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {isDraft && (
            <>
              <AppButton size="small" variant="outlined" startIcon={<EditIcon />} onClick={onEdit}>
                Edit
              </AppButton>
              <AppButton size="small" variant="success" startIcon={<PostIcon />} onClick={onPost} disabled={!isBalanced}>
                Post
              </AppButton>
              <AppButton size="small" variant="danger" startIcon={<DeleteIcon />} onClick={onDelete}>
                Delete
              </AppButton>
            </>
          )}
          {isPosted && (
            <AppButton size="small" variant="warning" startIcon={<ReverseIcon />} onClick={onReverse}>
              Reverse
            </AppButton>
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
                      {ENTRY_TYPE_LABELS[selectedEntry.sourceType ?? ''] ?? 'Manual Entry'}
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
                    <TableCell sx={valueCellSx}>{selectedEntry.status}</TableCell>
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
                      <TableCell sx={valueCellSx}>Unbalanced</TableCell>
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

Changes from original: removed `Chip` from MUI import, removed `statusColor` function, replaced all three `<Chip>` usages with plain text.

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "JournalEntryContextHeader|error TS" | head -20
```

Expected: no errors for this file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/components/JournalEntryContextHeader.tsx
git commit -m "refactor(accounting): replace Chip components with plain text in JournalEntryContextHeader (issue #420)"
```

---

### Task 3: Final verification

- [ ] **Step 1: Run full accounting component test suite**

```bash
cd frontend && npx vitest run src/pages/accounting
```

Expected: all tests PASS.

- [ ] **Step 2: Run TypeScript check across frontend**

```bash
cd frontend && npm run type-check
```

Expected: exit 0, no errors.

- [ ] **Step 3: Create PR**

```bash
gh pr create --title "refactor(accounting): normalize JE list and details UI with Sales module (issue #420)" --body "$(cat <<'EOF'
## Summary

- `JournalEntriesTable`: removed custom `Typography` render (fontWeight 500, primary color) from `referenceNumber` column — now uses `EntityTable` default formatting (fontWeight 400, standard text color), matching `OrdersTable`
- `JournalEntryContextHeader`: replaced `Chip` components for Type, Status, and Balance (unbalanced) with plain text using existing `valueCellSx` — matching `OrderContextHeader` pattern

Closes #420

## Test plan

- [ ] Run `cd frontend && npx vitest run src/pages/accounting` — all pass
- [ ] Run `cd frontend && npm run type-check` — no errors
- [ ] Visually confirm JE list reference numbers render in default text color/weight
- [ ] Visually confirm JE detail header shows Type, Status, Balance as plain text (no Chip chrome)
EOF
)"
```
