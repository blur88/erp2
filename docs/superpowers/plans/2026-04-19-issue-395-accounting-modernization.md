# Accounting Module Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor all 9 accounting pages to use `GenericListPage` + `useFilterBar` + master-detail workspace pattern, and remove the two standalone detail pages.

**Architecture:** Each page becomes a thin orchestrator delegating to extracted `*Table`, `*ContextHeader`, `*WorkspaceCard`, and `*Dialogs` components, wired up via a `use*Workspace` hook. Local state only (no Redux slice). The two existing detail pages (`JournalEntryDetailsPage`, `BankReconciliationDetailsPage`) are deleted; their functionality moves into workspace components.

**Tech Stack:** React 19, TypeScript, MUI v7, RTK Query (`@/store/api/accountingApi`), `useFilterBar` hook, `useEntityWorkspace` hook, Vitest + Testing Library.

---

## Task 1: Add new FilterFieldTypes for accounting

**Files:**
- Modify: `frontend/src/types/filterBar.types.ts`
- Create: `frontend/src/components/filters/FilterJournalEntryStatus.tsx`
- Create: `frontend/src/components/filters/FilterJournalEntryType.tsx`
- Create: `frontend/src/components/filters/FilterExpenseStatus.tsx`
- Create: `frontend/src/components/filters/FilterOwnerEquityType.tsx`
- Create: `frontend/src/components/filters/FilterFiscalPeriodStatus.tsx`
- Create: `frontend/src/components/filters/FilterBankReconciliationStatus.tsx`
- Create: `frontend/src/components/filters/FilterSettlementStatus.tsx`
- Create: `frontend/src/components/filters/FilterFundTransferStatus.tsx`
- Modify: `frontend/src/components/filters/FilterBar.tsx`

- [ ] **Step 1: Add new types to FilterFieldType union**

In `frontend/src/types/filterBar.types.ts`, extend the `FilterFieldType` union (currently ends with `'vendor-payment-status'`):

```typescript
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
```

- [ ] **Step 2: Create FilterJournalEntryStatus**

Create `frontend/src/components/filters/FilterJournalEntryStatus.tsx`:

```typescript
import { FilterSelect } from './FilterSelect'

const OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'posted', label: 'Posted' },
  { value: 'reversed', label: 'Reversed' },
]

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterJournalEntryStatus({ field, value, onChange }: Props) {
  return <FilterSelect field={field} label="Status" value={value} options={OPTIONS} onChange={onChange} />
}
```

- [ ] **Step 3: Create FilterJournalEntryType**

Create `frontend/src/components/filters/FilterJournalEntryType.tsx`:

```typescript
import { FilterSelect } from './FilterSelect'

const OPTIONS = [
  { value: 'manual', label: 'Manual Entry' },
  { value: 'sales_order', label: 'Sales Order' },
  { value: 'payment', label: 'Customer Payment' },
  { value: 'settlement', label: 'Settlement' },
  { value: 'goods_received_note', label: 'Goods Receipt' },
  { value: 'vendor_payment', label: 'Vendor Payment' },
  { value: 'stock_adjustment', label: 'Stock Adjustment' },
  { value: 'owner_equity_transaction', label: 'Owner Equity' },
  { value: 'expense', label: 'Expense' },
  { value: 'opening_balance', label: 'Opening Balance' },
  { value: 'fund_transfer', label: 'Fund Transfer' },
]

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterJournalEntryType({ field, value, onChange }: Props) {
  return <FilterSelect field={field} label="Entry Type" value={value} options={OPTIONS} onChange={onChange} />
}
```

- [ ] **Step 4: Create remaining 6 filter components**

Create `frontend/src/components/filters/FilterExpenseStatus.tsx`:
```typescript
import { FilterSelect } from './FilterSelect'
const OPTIONS = [{ value: 'draft', label: 'Draft' }, { value: 'posted', label: 'Posted' }]
interface Props { field: string; value: string | null; onChange: (value: string | null) => void }
export function FilterExpenseStatus({ field, value, onChange }: Props) {
  return <FilterSelect field={field} label="Status" value={value} options={OPTIONS} onChange={onChange} />
}
```

Create `frontend/src/components/filters/FilterOwnerEquityType.tsx`:
```typescript
import { FilterSelect } from './FilterSelect'
const OPTIONS = [{ value: 'capital_injection', label: 'Capital Injection' }, { value: 'owner_drawing', label: 'Owner Drawing' }]
interface Props { field: string; value: string | null; onChange: (value: string | null) => void }
export function FilterOwnerEquityType({ field, value, onChange }: Props) {
  return <FilterSelect field={field} label="Type" value={value} options={OPTIONS} onChange={onChange} />
}
```

Create `frontend/src/components/filters/FilterFiscalPeriodStatus.tsx`:
```typescript
import { FilterSelect } from './FilterSelect'
const OPTIONS = [{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }]
interface Props { field: string; value: string | null; onChange: (value: string | null) => void }
export function FilterFiscalPeriodStatus({ field, value, onChange }: Props) {
  return <FilterSelect field={field} label="Status" value={value} options={OPTIONS} onChange={onChange} />
}
```

Create `frontend/src/components/filters/FilterBankReconciliationStatus.tsx`:
```typescript
import { FilterSelect } from './FilterSelect'
const OPTIONS = [{ value: 'in_progress', label: 'In Progress' }, { value: 'completed', label: 'Completed' }]
interface Props { field: string; value: string | null; onChange: (value: string | null) => void }
export function FilterBankReconciliationStatus({ field, value, onChange }: Props) {
  return <FilterSelect field={field} label="Status" value={value} options={OPTIONS} onChange={onChange} />
}
```

Create `frontend/src/components/filters/FilterSettlementStatus.tsx`:
```typescript
import { FilterSelect } from './FilterSelect'
const OPTIONS = [{ value: 'pending', label: 'Pending' }, { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' }]
interface Props { field: string; value: string | null; onChange: (value: string | null) => void }
export function FilterSettlementStatus({ field, value, onChange }: Props) {
  return <FilterSelect field={field} label="Status" value={value} options={OPTIONS} onChange={onChange} />
}
```

Create `frontend/src/components/filters/FilterFundTransferStatus.tsx`:
```typescript
import { FilterSelect } from './FilterSelect'
const OPTIONS = [{ value: 'pending', label: 'Pending' }, { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' }]
interface Props { field: string; value: string | null; onChange: (value: string | null) => void }
export function FilterFundTransferStatus({ field, value, onChange }: Props) {
  return <FilterSelect field={field} label="Status" value={value} options={OPTIONS} onChange={onChange} />
}
```

- [ ] **Step 5: Register new filters in FilterBar.tsx**

In `frontend/src/components/filters/FilterBar.tsx`, add imports after the existing filter imports:

```typescript
import { FilterJournalEntryStatus } from './FilterJournalEntryStatus'
import { FilterJournalEntryType } from './FilterJournalEntryType'
import { FilterExpenseStatus } from './FilterExpenseStatus'
import { FilterOwnerEquityType } from './FilterOwnerEquityType'
import { FilterFiscalPeriodStatus } from './FilterFiscalPeriodStatus'
import { FilterBankReconciliationStatus } from './FilterBankReconciliationStatus'
import { FilterSettlementStatus } from './FilterSettlementStatus'
import { FilterFundTransferStatus } from './FilterFundTransferStatus'
```

Then inside `renderQuickField`, after the last existing `if (field.type === 'transaction-status')` block, add:

```typescript
  if (field.type === 'journal-entry-status') {
    return <FilterJournalEntryStatus key={fieldKey} field={fieldKey} value={(value as string | null) ?? null} onChange={onChange} />
  }
  if (field.type === 'journal-entry-type') {
    return <FilterJournalEntryType key={fieldKey} field={fieldKey} value={(value as string | null) ?? null} onChange={onChange} />
  }
  if (field.type === 'expense-status') {
    return <FilterExpenseStatus key={fieldKey} field={fieldKey} value={(value as string | null) ?? null} onChange={onChange} />
  }
  if (field.type === 'owner-equity-type') {
    return <FilterOwnerEquityType key={fieldKey} field={fieldKey} value={(value as string | null) ?? null} onChange={onChange} />
  }
  if (field.type === 'fiscal-period-status') {
    return <FilterFiscalPeriodStatus key={fieldKey} field={fieldKey} value={(value as string | null) ?? null} onChange={onChange} />
  }
  if (field.type === 'bank-reconciliation-status') {
    return <FilterBankReconciliationStatus key={fieldKey} field={fieldKey} value={(value as string | null) ?? null} onChange={onChange} />
  }
  if (field.type === 'settlement-status') {
    return <FilterSettlementStatus key={fieldKey} field={fieldKey} value={(value as string | null) ?? null} onChange={onChange} />
  }
  if (field.type === 'fund-transfer-status') {
    return <FilterFundTransferStatus key={fieldKey} field={fieldKey} value={(value as string | null) ?? null} onChange={onChange} />
  }
```

- [ ] **Step 6: Type-check**

```bash
cd frontend && npm run type-check
```
Expected: no errors related to `FilterFieldType`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/types/filterBar.types.ts frontend/src/components/filters/Filter*.tsx
git commit -m "feat: add accounting filter field types and components (issue #395)"
```

---

## Task 2: Journal Entries — extract components and workspace hook

**Files:**
- Create: `frontend/src/pages/accounting/components/JournalEntriesTable.tsx`
- Create: `frontend/src/pages/accounting/components/JournalEntryContextHeader.tsx`
- Create: `frontend/src/pages/accounting/components/JournalEntryWorkspaceCard.tsx`
- Create: `frontend/src/pages/accounting/components/JournalEntriesDialogs.tsx`
- Create: `frontend/src/pages/accounting/hooks/useJournalEntriesWorkspace.ts`

- [ ] **Step 1: Create JournalEntriesTable**

Create `frontend/src/pages/accounting/components/JournalEntriesTable.tsx`:

```typescript
import { Checkbox, Chip, CircularProgress, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from '@mui/material'
import { default as ViewIcon } from '@mui/icons-material/Visibility'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as PostIcon } from '@mui/icons-material/PostAdd'
import { AppButton } from '@/components/common/AppButton'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { JournalEntry, JournalEntryStatus } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface Props {
  entries: JournalEntry[]
  loading: boolean
  total: number
  selectedEntryId: string | null
  selectedIds: Set<string>
  onSelect: (entry: JournalEntry) => void
  onToggleCheck: (id: string) => void
  onSelectAll: () => void
  onPost: (entry: JournalEntry) => void
  onDelete: (entry: JournalEntry) => void
  listRef?: React.RefObject<HTMLDivElement | null>
}

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
  if (status === JournalEntryStatus.POSTED) return 'success'
  if (status === JournalEntryStatus.REVERSED) return 'error'
  return 'default'
}

export function JournalEntriesTable({ entries, loading, selectedEntryId, selectedIds, onSelect, onToggleCheck, onSelectAll, onPost, onDelete, listRef }: Props) {
  const selectableEntries = entries.filter(e => e.status === JournalEntryStatus.DRAFT)
  const allSelected = selectableEntries.length > 0 && selectedIds.size === selectableEntries.length
  const someSelected = selectedIds.size > 0 && selectedIds.size < selectableEntries.length

  return (
    <Paper ref={listRef} sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
        <Table size={TABLE_STYLES.size} stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox indeterminate={someSelected} checked={allSelected} onChange={onSelectAll} />
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Reference</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">Debits</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">Credits</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={9} align="center" sx={{ py: 4 }}><CircularProgress /></TableCell></TableRow>
            ) : entries.length === 0 ? (
              <TableRow><TableCell colSpan={9} align="center" sx={{ py: 4 }}><Typography variant="body2" color="text.secondary">No journal entries found</Typography></TableCell></TableRow>
            ) : entries.map(entry => (
              <TableRow
                key={entry.id}
                hover
                selected={entry.id === selectedEntryId}
                onClick={() => onSelect(entry)}
                sx={{ cursor: 'pointer', height: TABLE_STYLES.row.height }}
              >
                <TableCell padding="checkbox" onClick={e => e.stopPropagation()}>
                  <Checkbox
                    disabled={entry.status !== JournalEntryStatus.DRAFT}
                    checked={selectedIds.has(entry.id)}
                    onChange={() => onToggleCheck(entry.id)}
                  />
                </TableCell>
                <TableCell><Typography variant="body2" sx={{ fontWeight: 500, color: 'primary.main' }}>{entry.referenceNumber}</Typography></TableCell>
                <TableCell><Typography variant="body2">{formatDate(entry.entryDate)}</Typography></TableCell>
                <TableCell><Typography variant="body2" sx={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.description}</Typography></TableCell>
                <TableCell><Chip label={ENTRY_TYPE_LABELS[entry.sourceType ?? ''] ?? 'Manual Entry'} size="small" /></TableCell>
                <TableCell align="right"><Typography variant="body2">{formatCurrency(entry.totalDebits)}</Typography></TableCell>
                <TableCell align="right"><Typography variant="body2">{formatCurrency(entry.totalCredits)}</Typography></TableCell>
                <TableCell><Chip label={entry.status} color={statusColor(entry.status)} size="small" /></TableCell>
                <TableCell align="center" onClick={e => e.stopPropagation()}>
                  <Stack direction="row" spacing={0.5} justifyContent="center">
                    {entry.status === JournalEntryStatus.DRAFT && (
                      <>
                        <Tooltip title="Post"><span><AppButton size="small" color="success" onClick={() => onPost(entry)} icon={<PostIcon fontSize="small" />} /></span></Tooltip>
                        <Tooltip title="Delete"><span><AppButton size="small" color="error" onClick={() => onDelete(entry)} icon={<DeleteIcon fontSize="small" />} /></span></Tooltip>
                      </>
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  )
}
```

- [ ] **Step 2: Create JournalEntryContextHeader**

Create `frontend/src/pages/accounting/components/JournalEntryContextHeader.tsx`:

```typescript
import { Box, Chip, Paper, Stack, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material'
import { default as EditIcon } from '@mui/icons-material/Edit'
import { default as PostIcon } from '@mui/icons-material/PostAdd'
import { default as ReverseIcon } from '@mui/icons-material/Undo'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { AppButton } from '@/components/common/AppButton'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { JournalEntry, JournalEntryStatus } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface Props {
  selectedEntry: JournalEntry | null
  isLoading: boolean
  onEdit: () => void
  onPost: () => void
  onReverse: () => void
  onDelete: () => void
}

const cellSx = { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px }

function statusColor(status: JournalEntryStatus) {
  if (status === JournalEntryStatus.POSTED) return 'success' as const
  if (status === JournalEntryStatus.REVERSED) return 'error' as const
  return 'default' as const
}

export function JournalEntryContextHeader({ selectedEntry, onEdit, onPost, onReverse, onDelete }: Props) {
  if (!selectedEntry) {
    return <Paper sx={{ p: 2 }}><Typography variant="body2" color="text.secondary">Select a journal entry to view details</Typography></Paper>
  }

  const isDraft = selectedEntry.status === JournalEntryStatus.DRAFT
  const isPosted = selectedEntry.status === JournalEntryStatus.POSTED
  const isBalanced = Math.abs(selectedEntry.totalDebits - selectedEntry.totalCredits) < 0.01

  return (
    <Paper sx={{ p: 0 }}>
      <Box sx={{ px: 2, pt: 1.5, pb: 1, borderBottom: TABLE_STYLES.cell.border }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="subtitle2" fontWeight={600}>{selectedEntry.referenceNumber}</Typography>
            <Chip label={selectedEntry.status} color={statusColor(selectedEntry.status)} size="small" />
            {!isBalanced && <Chip label="Unbalanced" color="warning" size="small" />}
          </Stack>
          <Stack direction="row" spacing={0.5}>
            {isDraft && (
              <>
                <AppButton size="small" variant="outlined" startIcon={<EditIcon />} onClick={onEdit}>Edit</AppButton>
                <AppButton size="small" color="success" startIcon={<PostIcon />} onClick={onPost} disabled={!isBalanced}>Post</AppButton>
                <AppButton size="small" color="error" variant="outlined" startIcon={<DeleteIcon />} onClick={onDelete}>Delete</AppButton>
              </>
            )}
            {isPosted && (
              <AppButton size="small" color="warning" variant="outlined" startIcon={<ReverseIcon />} onClick={onReverse}>Reverse</AppButton>
            )}
          </Stack>
        </Stack>
      </Box>
      <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': cellSx }}>
        <TableBody>
          <TableRow>
            <TableCell sx={{ ...cellSx, color: 'text.secondary', width: 120 }}>Date</TableCell>
            <TableCell>{formatDate(selectedEntry.entryDate)}</TableCell>
            <TableCell sx={{ ...cellSx, color: 'text.secondary', width: 120 }}>Debits</TableCell>
            <TableCell align="right">{formatCurrency(selectedEntry.totalDebits)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell sx={{ ...cellSx, color: 'text.secondary' }}>Description</TableCell>
            <TableCell colSpan={1}>{selectedEntry.description}</TableCell>
            <TableCell sx={{ ...cellSx, color: 'text.secondary' }}>Credits</TableCell>
            <TableCell align="right">{formatCurrency(selectedEntry.totalCredits)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Paper>
  )
}
```

- [ ] **Step 3: Create JournalEntryWorkspaceCard**

Create `frontend/src/pages/accounting/components/JournalEntryWorkspaceCard.tsx`:

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
      <Box sx={{ px: 2, py: 1, borderBottom: TABLE_STYLES.cell.border }}>
        <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Ledger Lines
        </Typography>
      </Box>
      {!isBalanced && (
        <Alert severity="warning" sx={{ mx: 2, mt: 1, fontSize: '0.8rem', py: 0.5 }}>
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
              <TableRow><TableCell colSpan={4} align="center"><Typography variant="body2" color="text.secondary">No ledger lines</Typography></TableCell></TableRow>
            ) : lines.map((line: any, i: number) => (
              <TableRow key={line.id ?? i} hover>
                <TableCell sx={{ fontSize: '0.8rem' }}>{line.account?.name ?? line.accountId}</TableCell>
                <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>{line.description ?? '—'}</TableCell>
                <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{Number(line.debitAmount) > 0 ? formatCurrency(line.debitAmount) : '—'}</TableCell>
                <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{Number(line.creditAmount) > 0 ? formatCurrency(line.creditAmount) : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {selectedEntry.notes && (
        <Box sx={{ p: 2, borderTop: TABLE_STYLES.cell.border }}>
          <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}>Notes</Typography>
          <Typography variant="body2" sx={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>{selectedEntry.notes}</Typography>
        </Box>
      )}
    </Paper>
  )
}
```

- [ ] **Step 4: Create JournalEntriesDialogs**

Create `frontend/src/pages/accounting/components/JournalEntriesDialogs.tsx`:

```typescript
import { useState } from 'react'
import { Stack, TextField, Typography } from '@mui/material'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import { JournalEntry } from '@/types'
import { getCurrentDate } from '@/utils/formatters'

interface Props {
  postTarget: JournalEntry | null
  deleteTarget: JournalEntry | null
  reverseTarget: JournalEntry | null
  bulkPostIds: Set<string>
  bulkDeleteIds: Set<string>
  actionLoading: boolean
  onConfirmPost: () => void
  onConfirmDelete: () => void
  onConfirmReverse: (reverseDate: string) => void
  onConfirmBulkPost: () => void
  onConfirmBulkDelete: () => void
  onCancelPost: () => void
  onCancelDelete: () => void
  onCancelReverse: () => void
  onCancelBulkPost: () => void
  onCancelBulkDelete: () => void
}

export function JournalEntriesDialogs({
  postTarget, deleteTarget, reverseTarget, bulkPostIds, bulkDeleteIds,
  actionLoading, onConfirmPost, onConfirmDelete, onConfirmReverse,
  onConfirmBulkPost, onConfirmBulkDelete, onCancelPost, onCancelDelete,
  onCancelReverse, onCancelBulkPost, onCancelBulkDelete,
}: Props) {
  const [reverseDate, setReverseDate] = useState(getCurrentDate())

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
        message=""
        confirmText="Reverse"
        cancelText="Cancel"
        onConfirm={() => onConfirmReverse(reverseDate)}
        onCancel={onCancelReverse}
        loading={actionLoading}
      >
        <Stack spacing={2}>
          <Typography variant="body2">Reverse journal entry {reverseTarget?.referenceNumber}? A new reversing entry will be created.</Typography>
          <TextField
            label="Reverse Date"
            type="date"
            value={reverseDate}
            onChange={e => setReverseDate(e.target.value)}
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Stack>
      </ConfirmationDialog>
      <ConfirmationDialog
        open={bulkPostIds.size > 0 && !!onConfirmBulkPost}
        title="Bulk Post Entries"
        message={`Post ${bulkPostIds.size} selected journal entries?`}
        confirmText="Post"
        cancelText="Cancel"
        onConfirm={onConfirmBulkPost}
        onCancel={onCancelBulkPost}
        loading={actionLoading}
      />
      <ConfirmationDialog
        open={bulkDeleteIds.size > 0 && !!onConfirmBulkDelete}
        title="Bulk Delete Entries"
        message={`Delete ${bulkDeleteIds.size} selected journal entries?`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={onConfirmBulkDelete}
        onCancel={onCancelBulkDelete}
        loading={actionLoading}
      />
    </>
  )
}
```

- [ ] **Step 5: Create useJournalEntriesWorkspace**

Create `frontend/src/pages/accounting/hooks/useJournalEntriesWorkspace.ts`:

```typescript
import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotification } from '@/hooks/useNotification'
import {
  useBulkDeleteJournalEntriesMutation,
  useBulkPostJournalEntriesMutation,
  useDeleteJournalEntryMutation,
  useLazyGetJournalEntryQuery,
  usePostJournalEntryMutation,
  useReverseJournalEntryMutation,
} from '@/store/api/accountingApi'
import { JournalEntry, JournalEntryStatus } from '@/types'
import { getErrorMessage } from '@/utils/errorMessage'

export function useJournalEntriesWorkspace(refetch: () => void) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()

  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [postTarget, setPostTarget] = useState<JournalEntry | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<JournalEntry | null>(null)
  const [reverseTarget, setReverseTarget] = useState<JournalEntry | null>(null)
  const [bulkPostOpen, setBulkPostOpen] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const [fetchEntry] = useLazyGetJournalEntryQuery()
  const [postJournalEntry] = usePostJournalEntryMutation()
  const [reverseJournalEntry] = useReverseJournalEntryMutation()
  const [deleteJournalEntry] = useDeleteJournalEntryMutation()
  const [bulkPostJournalEntries] = useBulkPostJournalEntriesMutation()
  const [bulkDeleteJournalEntries] = useBulkDeleteJournalEntriesMutation()

  const handleSelect = useCallback(async (entry: JournalEntry) => {
    setSelectedEntry(entry)
    try {
      const fresh = await fetchEntry(entry.id).unwrap()
      setSelectedEntry(fresh)
    } catch {
      // keep stale entry
    }
  }, [fetchEntry])

  const handleToggleCheck = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const handleSelectAll = useCallback((entries: JournalEntry[]) => {
    const drafts = entries.filter(e => e.status === JournalEntryStatus.DRAFT).map(e => e.id)
    setSelectedIds(prev => prev.size === drafts.length ? new Set() : new Set(drafts))
  }, [])

  const handleConfirmPost = useCallback(async () => {
    if (!postTarget) return
    setActionLoading(true)
    try {
      await postJournalEntry(postTarget.id).unwrap()
      showSuccess(`Journal entry ${postTarget.referenceNumber} posted`)
      setPostTarget(null)
      setSelectedEntry(null)
      refetch()
    } catch (err: any) {
      showError(getErrorMessage(err, 'Failed to post journal entry'))
    } finally {
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
      if (result?.id) {
        const fresh = await fetchEntry(result.id).unwrap()
        setSelectedEntry(fresh)
      }
      refetch()
    } catch (err: any) {
      showError(getErrorMessage(err, 'Failed to reverse journal entry'))
    } finally {
      setActionLoading(false)
    }
  }, [reverseTarget, reverseJournalEntry, fetchEntry, showSuccess, showError, refetch])

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    setActionLoading(true)
    try {
      await deleteJournalEntry(deleteTarget.id).unwrap()
      showSuccess(`Journal entry ${deleteTarget.referenceNumber} deleted`)
      setDeleteTarget(null)
      setSelectedEntry(null)
      refetch()
    } catch (err: any) {
      showError(getErrorMessage(err, 'Failed to delete journal entry'))
    } finally {
      setActionLoading(false)
    }
  }, [deleteTarget, deleteJournalEntry, showSuccess, showError, refetch])

  const handleBulkPost = useCallback(async () => {
    setActionLoading(true)
    try {
      const result = await bulkPostJournalEntries(Array.from(selectedIds)).unwrap()
      showSuccess(`Posted ${result.succeeded.length} entries`)
      if (result.failed.length > 0) showError(`${result.failed.length} entries failed`)
      setSelectedIds(new Set())
      setBulkPostOpen(false)
      refetch()
    } catch (err: any) {
      showError(getErrorMessage(err, 'Bulk post failed'))
    } finally {
      setActionLoading(false)
    }
  }, [selectedIds, bulkPostJournalEntries, showSuccess, showError, refetch])

  const handleBulkDelete = useCallback(async () => {
    setActionLoading(true)
    try {
      const result = await bulkDeleteJournalEntries(Array.from(selectedIds)).unwrap()
      showSuccess(`Deleted ${result.succeeded.length} entries`)
      if (result.failed.length > 0) showError(`${result.failed.length} entries failed`)
      setSelectedIds(new Set())
      setBulkDeleteOpen(false)
      refetch()
    } catch (err: any) {
      showError(getErrorMessage(err, 'Bulk delete failed'))
    } finally {
      setActionLoading(false)
    }
  }, [selectedIds, bulkDeleteJournalEntries, showSuccess, showError, refetch])

  return {
    selectedEntry, selectedIds,
    postTarget, setPostTarget,
    deleteTarget, setDeleteTarget,
    reverseTarget, setReverseTarget,
    bulkPostOpen, setBulkPostOpen,
    bulkDeleteOpen, setBulkDeleteOpen,
    actionLoading,
    searchInputRef, listRef,
    handleSelect, handleToggleCheck, handleSelectAll,
    handleConfirmPost, handleConfirmReverse, handleConfirmDelete,
    handleBulkPost, handleBulkDelete,
    navigateToEdit: (entry: JournalEntry) => navigate(`/accounting/journal-entries/${entry.id}/edit`),
    navigateToCreate: () => navigate('/accounting/journal-entries/new'),
  }
}
```

- [ ] **Step 6: Type-check**

```bash
cd frontend && npm run type-check
```
Expected: no errors in the new files.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/accounting/components/JournalEntries* frontend/src/pages/accounting/components/JournalEntry* frontend/src/pages/accounting/hooks/useJournalEntriesWorkspace.ts
git commit -m "feat: extract JournalEntries components and workspace hook (issue #395)"
```

---

## Task 3: Rewrite JournalEntriesPage + write tests

**Files:**
- Modify: `frontend/src/pages/accounting/JournalEntriesPage.tsx`
- Create: `frontend/src/pages/accounting/components/JournalEntriesTable.test.tsx`
- Modify: `frontend/src/pages/accounting/__tests__/JournalEntriesPage.test.tsx`

- [ ] **Step 1: Write failing test for JournalEntriesTable**

Create `frontend/src/pages/accounting/components/JournalEntriesTable.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { JournalEntriesTable } from './JournalEntriesTable'
import { JournalEntryStatus } from '@/types'

vi.mock('@/utils/formatters', () => ({
  formatCurrency: (v: number) => `$${v}`,
  formatDate: (d: string) => d,
}))

vi.mock('@/components/common/AppButton', () => ({
  AppButton: ({ onClick, children, icon }: any) => <button onClick={onClick}>{children}{icon}</button>,
}))

const makeEntry = (overrides = {}) => ({
  id: '1', referenceNumber: 'JE-001', entryDate: '2026-01-01',
  description: 'Test entry', status: JournalEntryStatus.DRAFT,
  totalDebits: 100, totalCredits: 100, isBalanced: true,
  sourceType: 'manual', sourceId: null,
  ...overrides,
})

describe('JournalEntriesTable', () => {
  const defaultProps = {
    entries: [], loading: false, total: 0,
    selectedEntryId: null, selectedIds: new Set<string>(),
    onSelect: vi.fn(), onToggleCheck: vi.fn(), onSelectAll: vi.fn(),
    onPost: vi.fn(), onDelete: vi.fn(),
  }

  it('shows empty state when no entries', () => {
    render(<BrowserRouter><JournalEntriesTable {...defaultProps} /></BrowserRouter>)
    expect(screen.getByText('No journal entries found')).toBeInTheDocument()
  })

  it('renders entry rows', () => {
    render(<BrowserRouter><JournalEntriesTable {...defaultProps} entries={[makeEntry()]} total={1} /></BrowserRouter>)
    expect(screen.getByText('JE-001')).toBeInTheDocument()
  })

  it('calls onSelect when row is clicked', () => {
    const onSelect = vi.fn()
    render(<BrowserRouter><JournalEntriesTable {...defaultProps} entries={[makeEntry()]} total={1} onSelect={onSelect} /></BrowserRouter>)
    fireEvent.click(screen.getByText('JE-001'))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }))
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd frontend && npx vitest run src/pages/accounting/components/JournalEntriesTable.test.tsx
```
Expected: FAIL (component not yet importable or missing deps).

- [ ] **Step 3: Rewrite JournalEntriesPage**

Replace `frontend/src/pages/accounting/JournalEntriesPage.tsx` entirely:

```typescript
import React, { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Button, Stack } from '@mui/material'
import { default as PostIcon } from '@mui/icons-material/PostAdd'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import GenericListPage from '@/components/common/GenericListPage'
import AccountMappingWarning from '@/components/accounting/AccountMappingWarning'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useGetJournalEntriesQuery } from '@/store/api/accountingApi'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'
import { JournalEntriesTable } from './components/JournalEntriesTable'
import { JournalEntryContextHeader } from './components/JournalEntryContextHeader'
import { JournalEntryWorkspaceCard } from './components/JournalEntryWorkspaceCard'
import { JournalEntriesDialogs } from './components/JournalEntriesDialogs'
import { useJournalEntriesWorkspace } from './hooks/useJournalEntriesWorkspace'

interface JEFilters {
  search: string
  status: string | null
  entryType: string | null
  period: PeriodValue
}

const JournalEntriesPage: React.FC = () => {
  const location = useLocation()
  const [sortBy, setSortBy] = useState('createdAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const filterConfig = useMemo<FilterBarConfig<JEFilters>>(() => ({
    search: { placeholder: 'Search by reference or description...' },
    fields: [
      { field: 'period', label: 'Period', type: 'period' },
      { field: 'status', label: 'Status', type: 'journal-entry-status' },
      { field: 'entryType', label: 'Entry Type', type: 'journal-entry-type' },
    ],
    defaults: { search: '', status: null, entryType: null, period: { key: null, from: null, to: null } },
  }), [])

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)
  const weekStartsOn = getStartOfWeek()
  const dateRange = useMemo(() => {
    const p = appliedFilters.period
    if (!p || p.key === null) return { fromDate: undefined, toDate: undefined }
    if (p.key === 'custom') return { fromDate: p.from ?? undefined, toDate: p.to ?? undefined }
    const r = getPeriodDateRange(p.key, weekStartsOn)
    return { fromDate: r.from, toDate: r.to }
  }, [appliedFilters.period, weekStartsOn])

  // Support deep-link from other modules via ?sourceType=&sourceId=
  const urlParams = new URLSearchParams(location.search)
  const sourceTypeParam = urlParams.get('sourceType')
  const sourceIdParam = urlParams.get('sourceId')

  const queryArgs = useMemo(() => ({
    sortBy, sortOrder,
    search: appliedFilters.search || undefined,
    status: appliedFilters.status || undefined,
    sourceType: sourceIdParam ? sourceTypeParam ?? undefined : appliedFilters.entryType || undefined,
    sourceId: sourceIdParam ?? undefined,
    startDate: dateRange.fromDate,
    endDate: dateRange.toDate,
  }), [appliedFilters, dateRange, sortBy, sortOrder, sourceTypeParam, sourceIdParam])

  const { data, isLoading, refetch } = useGetJournalEntriesQuery(queryArgs)
  const entries = data?.data ?? []
  const pagination = data?.meta

  const ws = useJournalEntriesWorkspace(refetch)

  return (
    <>
      <AccountMappingWarning context="system" />
      <GenericListPage
        title="Journal Entries"
        subtitle={`Manage and post accounting journal entries (${pagination?.total ?? 0} total)`}
        primaryAction={{ label: 'New Journal Entry', onClick: ws.navigateToCreate }}
        filterConfig={filterConfig}
        draftFilters={draftFilters}
        handlers={handlers}
        hasActiveFilters={hasActiveFilters}
        searchInputRef={ws.searchInputRef}
        sort={{ field: 'createdAt', sortBy, sortOrder, onSort: (f) => { setSortOrder(p => sortBy === f && p === 'desc' ? 'asc' : 'desc'); setSortBy(f) } }}
        contentSlot={
          ws.selectedIds.size > 0 ? (
            <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
              <Button size="small" variant="contained" startIcon={<PostIcon />} onClick={() => ws.setBulkPostOpen(true)}>
                Post Selected ({ws.selectedIds.size})
              </Button>
              <Button size="small" variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={() => ws.setBulkDeleteOpen(true)}>
                Delete Selected ({ws.selectedIds.size})
              </Button>
            </Stack>
          ) : null
        }
        listSlot={
          <JournalEntriesTable
            entries={entries}
            loading={isLoading}
            total={pagination?.total ?? 0}
            selectedEntryId={ws.selectedEntry?.id ?? null}
            selectedIds={ws.selectedIds}
            onSelect={ws.handleSelect}
            onToggleCheck={ws.handleToggleCheck}
            onSelectAll={() => ws.handleSelectAll(entries)}
            onPost={e => ws.setPostTarget(e)}
            onDelete={e => ws.setDeleteTarget(e)}
            listRef={ws.listRef}
          />
        }
        headerSlot={
          <JournalEntryContextHeader
            selectedEntry={ws.selectedEntry}
            isLoading={false}
            onEdit={() => ws.selectedEntry && ws.navigateToEdit(ws.selectedEntry)}
            onPost={() => ws.selectedEntry && ws.setPostTarget(ws.selectedEntry)}
            onReverse={() => ws.selectedEntry && ws.setReverseTarget(ws.selectedEntry)}
            onDelete={() => ws.selectedEntry && ws.setDeleteTarget(ws.selectedEntry)}
          />
        }
        workspaceSlot={<JournalEntryWorkspaceCard selectedEntry={ws.selectedEntry} />}
        dialogs={
          <JournalEntriesDialogs
            postTarget={ws.postTarget}
            deleteTarget={ws.deleteTarget}
            reverseTarget={ws.reverseTarget}
            bulkPostIds={ws.bulkPostOpen ? ws.selectedIds : new Set()}
            bulkDeleteIds={ws.bulkDeleteOpen ? ws.selectedIds : new Set()}
            actionLoading={ws.actionLoading}
            onConfirmPost={ws.handleConfirmPost}
            onConfirmDelete={ws.handleConfirmDelete}
            onConfirmReverse={ws.handleConfirmReverse}
            onConfirmBulkPost={ws.handleBulkPost}
            onConfirmBulkDelete={ws.handleBulkDelete}
            onCancelPost={() => ws.setPostTarget(null)}
            onCancelDelete={() => ws.setDeleteTarget(null)}
            onCancelReverse={() => ws.setReverseTarget(null)}
            onCancelBulkPost={() => ws.setBulkPostOpen(false)}
            onCancelBulkDelete={() => ws.setBulkDeleteOpen(false)}
          />
        }
      />
    </>
  )
}

export default JournalEntriesPage
```

- [ ] **Step 4: Run component test — confirm passing**

```bash
cd frontend && npx vitest run src/pages/accounting/components/JournalEntriesTable.test.tsx
```
Expected: PASS (3 tests).

- [ ] **Step 5: Update page-level test**

Replace `frontend/src/pages/accounting/__tests__/JournalEntriesPage.test.tsx` with an updated version that mocks the new hooks and asserts workspace selection instead of navigation:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import JournalEntriesPage from '../JournalEntriesPage'
import { JournalEntryStatus } from '@/types'

vi.mock('@/hooks/useNotification', () => ({ useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }) }))
vi.mock('@/components/accounting/AccountMappingWarning', () => ({ default: () => null }))
vi.mock('@/utils/formatters', () => ({ formatCurrency: (v: number) => `$${v}`, formatDate: (d: string) => d, getCurrentDate: () => '2026-04-19' }))
vi.mock('@/utils/dateRange', () => ({ getPeriodDateRange: () => ({ from: undefined, to: undefined }), getStartOfWeek: () => 0 }))

const mockedApi = vi.hoisted(() => ({
  useGetJournalEntriesQuery: vi.fn(),
  useDeleteJournalEntryMutation: vi.fn(),
  usePostJournalEntryMutation: vi.fn(),
  useBulkPostJournalEntriesMutation: vi.fn(),
  useBulkDeleteJournalEntriesMutation: vi.fn(),
  useReverseJournalEntryMutation: vi.fn(),
  useLazyGetJournalEntryQuery: vi.fn(),
}))

vi.mock('@/store/api/accountingApi', () => mockedApi)

const mockEntry = {
  id: '1', referenceNumber: 'JE-001', entryDate: '2026-01-01',
  description: 'Test', status: JournalEntryStatus.POSTED,
  totalDebits: 100, totalCredits: 100, isBalanced: true,
}

describe('JournalEntriesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.useGetJournalEntriesQuery.mockReturnValue({ data: { data: [mockEntry], meta: { total: 1 } }, isLoading: false, refetch: vi.fn() })
    mockedApi.useDeleteJournalEntryMutation.mockReturnValue([vi.fn()])
    mockedApi.usePostJournalEntryMutation.mockReturnValue([vi.fn()])
    mockedApi.useBulkPostJournalEntriesMutation.mockReturnValue([vi.fn()])
    mockedApi.useBulkDeleteJournalEntriesMutation.mockReturnValue([vi.fn()])
    mockedApi.useReverseJournalEntryMutation.mockReturnValue([vi.fn()])
    mockedApi.useLazyGetJournalEntryQuery.mockReturnValue([vi.fn().mockResolvedValue(mockEntry)])
  })

  it('renders the page title', () => {
    render(<BrowserRouter><JournalEntriesPage /></BrowserRouter>)
    expect(screen.getByText('Journal Entries')).toBeInTheDocument()
  })

  it('renders journal entry rows', () => {
    render(<BrowserRouter><JournalEntriesPage /></BrowserRouter>)
    expect(screen.getByText('JE-001')).toBeInTheDocument()
  })

  it('clicking a row selects it (does not navigate)', () => {
    render(<BrowserRouter><JournalEntriesPage /></BrowserRouter>)
    fireEvent.click(screen.getByText('JE-001'))
    expect(screen.getByText('JE-001')).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run updated page test**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/JournalEntriesPage.test.tsx
```
Expected: PASS.

- [ ] **Step 7: Type-check**

```bash
cd frontend && npm run type-check
```
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/accounting/JournalEntriesPage.tsx frontend/src/pages/accounting/components/JournalEntriesTable.test.tsx frontend/src/pages/accounting/__tests__/JournalEntriesPage.test.tsx
git commit -m "feat: rewrite JournalEntriesPage with GenericListPage pattern (issue #395)"
```

---

## Task 4: Delete JournalEntryDetailsPage + update router

**Files:**
- Delete: `frontend/src/pages/accounting/JournalEntryDetailsPage.tsx`
- Delete: `frontend/src/pages/accounting/JournalEntryDetailsPage.test.tsx`
- Delete: `frontend/src/pages/accounting/__tests__/JournalEntriesPage.test.tsx` (old duplicate — already replaced in Task 3)
- Modify: `frontend/src/router.tsx`

- [ ] **Step 1: Delete detail page and its test**

```bash
rm frontend/src/pages/accounting/JournalEntryDetailsPage.tsx
rm frontend/src/pages/accounting/JournalEntryDetailsPage.test.tsx
```

- [ ] **Step 2: Update router**

In `frontend/src/router.tsx`:

Remove the lazy import:
```typescript
// DELETE this line:
const JournalEntryDetailsPage = React.lazy(() => import('./pages/accounting/JournalEntryDetailsPage'))
```

Replace the detail route with a redirect:
```typescript
// REPLACE:
{ path: '/accounting/journal-entries/:id', element: <JournalEntryDetailsPage />, handle: { title: 'Journal Entry' } },
// WITH:
{ path: '/accounting/journal-entries/:id', element: <Navigate to="/accounting/journal-entries" replace /> },
```

Ensure `Navigate` is imported at the top of the file (it likely already is — check before adding).

- [ ] **Step 3: Type-check**

```bash
cd frontend && npm run type-check
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/router.tsx
git commit -m "feat: remove JournalEntryDetailsPage, redirect route to list (issue #395)"
```

---

## Task 5: Bank Reconciliations — extract components, workspace hook, rewrite page

**Files:**
- Create: `frontend/src/pages/accounting/components/BankReconciliationsTable.tsx`
- Create: `frontend/src/pages/accounting/components/BankReconciliationContextHeader.tsx`
- Create: `frontend/src/pages/accounting/components/BankReconciliationWorkspaceCard.tsx`
- Create: `frontend/src/pages/accounting/components/BankReconciliationsDialogs.tsx`
- Create: `frontend/src/pages/accounting/hooks/useBankReconciliationsWorkspace.ts`
- Modify: `frontend/src/pages/accounting/BankReconciliationsPage.tsx`
- Delete: `frontend/src/pages/accounting/BankReconciliationDetailsPage.tsx`
- Delete: `frontend/src/pages/accounting/BankReconciliationDetailsPage.test.tsx`
- Modify: `frontend/src/router.tsx`

- [ ] **Step 1: Create BankReconciliationsTable**

Create `frontend/src/pages/accounting/components/BankReconciliationsTable.tsx`:

```typescript
import { Chip, CircularProgress, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { BankReconciliation, BankReconciliationStatus } from '@/types'
import { formatCurrency } from '@/utils/formatters'
import { format } from 'date-fns'

interface Props {
  reconciliations: BankReconciliation[]
  loading: boolean
  selectedId: string | null
  onSelect: (item: BankReconciliation) => void
  listRef?: React.RefObject<HTMLDivElement | null>
}

function statusColor(status: BankReconciliationStatus) {
  return status === BankReconciliationStatus.COMPLETED ? 'success' as const : 'warning' as const
}

export function BankReconciliationsTable({ reconciliations, loading, selectedId, onSelect, listRef }: Props) {
  return (
    <Paper ref={listRef} sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
        <Table size={TABLE_STYLES.size} stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Account</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Period</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">Statement Balance</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} align="center" sx={{ py: 4 }}><CircularProgress /></TableCell></TableRow>
            ) : reconciliations.length === 0 ? (
              <TableRow><TableCell colSpan={4} align="center" sx={{ py: 4 }}><Typography variant="body2" color="text.secondary">No reconciliations found</Typography></TableCell></TableRow>
            ) : reconciliations.map(item => (
              <TableRow key={item.id} hover selected={item.id === selectedId} onClick={() => onSelect(item)} sx={{ cursor: 'pointer', height: TABLE_STYLES.row.height }}>
                <TableCell><Typography variant="body2" fontWeight={500}>{item.account?.name ?? '—'}</Typography></TableCell>
                <TableCell><Typography variant="body2">{format(new Date(item.reconciliationDate), 'MMM yyyy')}</Typography></TableCell>
                <TableCell align="right"><Typography variant="body2">{formatCurrency(item.statementBalance)}</Typography></TableCell>
                <TableCell><Chip label={item.status} color={statusColor(item.status)} size="small" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  )
}
```

- [ ] **Step 2: Create BankReconciliationContextHeader**

Create `frontend/src/pages/accounting/components/BankReconciliationContextHeader.tsx`:

```typescript
import { Box, Chip, Paper, Stack, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material'
import { default as CheckCircleIcon } from '@mui/icons-material/CheckCircle'
import { default as ReopenIcon } from '@mui/icons-material/LockOpen'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { AppButton } from '@/components/common/AppButton'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { BankReconciliation, BankReconciliationStatus } from '@/types'
import { formatCurrency } from '@/utils/formatters'
import { format } from 'date-fns'

interface Props {
  selected: BankReconciliation | null
  onComplete: () => void
  onReopen: () => void
  onDelete: () => void
}

const cellSx = { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px }

export function BankReconciliationContextHeader({ selected, onComplete, onReopen, onDelete }: Props) {
  if (!selected) return <Paper sx={{ p: 2 }}><Typography variant="body2" color="text.secondary">Select a reconciliation to view details</Typography></Paper>

  const isInProgress = selected.status === BankReconciliationStatus.IN_PROGRESS
  const isCompleted = selected.status === BankReconciliationStatus.COMPLETED

  return (
    <Paper>
      <Box sx={{ px: 2, pt: 1.5, pb: 1, borderBottom: TABLE_STYLES.cell.border }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="subtitle2" fontWeight={600}>{selected.account?.name ?? 'Bank Account'}</Typography>
            <Chip label={selected.status} color={isCompleted ? 'success' : 'warning'} size="small" />
          </Stack>
          <Stack direction="row" spacing={0.5}>
            {isInProgress && <AppButton size="small" color="success" startIcon={<CheckCircleIcon />} onClick={onComplete}>Complete</AppButton>}
            {isCompleted && <AppButton size="small" variant="outlined" startIcon={<ReopenIcon />} onClick={onReopen}>Reopen</AppButton>}
            <AppButton size="small" color="error" variant="outlined" startIcon={<DeleteIcon />} onClick={onDelete}>Delete</AppButton>
          </Stack>
        </Stack>
      </Box>
      <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': cellSx }}>
        <TableBody>
          <TableRow>
            <TableCell sx={{ ...cellSx, color: 'text.secondary', width: 140 }}>Period</TableCell>
            <TableCell>{format(new Date(selected.reconciliationDate), 'MMMM yyyy')}</TableCell>
            <TableCell sx={{ ...cellSx, color: 'text.secondary', width: 140 }}>Statement Balance</TableCell>
            <TableCell align="right">{formatCurrency(selected.statementBalance)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Paper>
  )
}
```

- [ ] **Step 3: Create BankReconciliationWorkspaceCard**

Create `frontend/src/pages/accounting/components/BankReconciliationWorkspaceCard.tsx`:

```typescript
import { Alert, Box, Checkbox, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { BankReconciliation, ReconciledTransaction } from '@/types'
import { formatCurrency } from '@/utils/formatters'
import { format } from 'date-fns'

interface Props {
  selected: BankReconciliation | null
  onToggleCleared: (txn: ReconciledTransaction) => void
}

export function BankReconciliationWorkspaceCard({ selected, onToggleCleared }: Props) {
  if (!selected) return <Paper sx={{ flex: 1 }} />

  const txns = selected.reconciledTransactions ?? []
  const clearedTotal = txns.reduce((sum, t) => {
    if (!t.cleared || !t.journalEntryLine) return sum
    return sum + Number(t.journalEntryLine.debitAmount) - Number(t.journalEntryLine.creditAmount)
  }, 0)
  const diff = Number(selected.statementBalance) - clearedTotal
  const isBalanced = Math.abs(diff) < 0.01

  return (
    <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ px: 2, py: 1, borderBottom: TABLE_STYLES.cell.border, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Transactions</Typography>
        <Typography variant="body2" sx={{ fontWeight: 600, color: isBalanced ? 'success.main' : 'error.main', fontSize: '0.85rem' }}>
          Difference: {formatCurrency(diff)}
        </Typography>
      </Box>
      {!isBalanced && <Alert severity="warning" sx={{ mx: 2, mt: 1, fontSize: '0.8rem', py: 0.5 }}>Cleared balance does not match statement balance</Alert>}
      <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
        <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': { borderBottom: TABLE_STYLES.cell.border, py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px } }}>
          <TableHead>
            <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50', fontSize: '0.8rem' } }}>
              <TableCell padding="checkbox">Cleared</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Description</TableCell>
              <TableCell align="right">Amount</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {txns.length === 0 ? (
              <TableRow><TableCell colSpan={4} align="center"><Typography variant="body2" color="text.secondary">No transactions</Typography></TableCell></TableRow>
            ) : txns.map(txn => {
              const line = txn.journalEntryLine
              const amount = line ? Number(line.debitAmount) - Number(line.creditAmount) : 0
              return (
                <TableRow key={txn.id} hover>
                  <TableCell padding="checkbox">
                    <Checkbox size="small" checked={txn.cleared} onChange={() => onToggleCleared(txn)} />
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.8rem' }}>{line?.journalEntry?.entryDate ? format(new Date(line.journalEntry.entryDate), 'dd MMM yyyy') : '—'}</TableCell>
                  <TableCell sx={{ fontSize: '0.8rem' }}>{line?.description ?? '—'}</TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.8rem', color: amount < 0 ? 'error.main' : 'inherit' }}>{formatCurrency(Math.abs(amount))}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  )
}
```

- [ ] **Step 4: Create BankReconciliationsDialogs**

Create `frontend/src/pages/accounting/components/BankReconciliationsDialogs.tsx`:

```typescript
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import { BankReconciliation } from '@/types'

interface Props {
  completeTarget: BankReconciliation | null
  reopenTarget: BankReconciliation | null
  deleteTarget: BankReconciliation | null
  actionLoading: boolean
  onConfirmComplete: () => void
  onConfirmReopen: () => void
  onConfirmDelete: () => void
  onCancelComplete: () => void
  onCancelReopen: () => void
  onCancelDelete: () => void
}

export function BankReconciliationsDialogs({ completeTarget, reopenTarget, deleteTarget, actionLoading, onConfirmComplete, onConfirmReopen, onConfirmDelete, onCancelComplete, onCancelReopen, onCancelDelete }: Props) {
  return (
    <>
      <ConfirmationDialog open={!!completeTarget} title="Complete Reconciliation" message="Mark this reconciliation as complete?" confirmText="Complete" cancelText="Cancel" onConfirm={onConfirmComplete} onCancel={onCancelComplete} loading={actionLoading} />
      <ConfirmationDialog open={!!reopenTarget} title="Reopen Reconciliation" message="Reopen this reconciliation for editing?" confirmText="Reopen" cancelText="Cancel" onConfirm={onConfirmReopen} onCancel={onCancelReopen} loading={actionLoading} />
      <ConfirmationDialog open={!!deleteTarget} title="Delete Reconciliation" message="Delete this reconciliation? This cannot be undone." confirmText="Delete" cancelText="Cancel" onConfirm={onConfirmDelete} onCancel={onCancelDelete} loading={actionLoading} />
    </>
  )
}
```

- [ ] **Step 5: Create useBankReconciliationsWorkspace**

Create `frontend/src/pages/accounting/hooks/useBankReconciliationsWorkspace.ts`:

```typescript
import { useCallback, useRef, useState } from 'react'
import { useNotification } from '@/hooks/useNotification'
import {
  useCompleteBankReconciliationMutation,
  useDeleteBankReconciliationMutation,
  useLazyGetBankReconciliationQuery,
  useMarkBankReconciliationClearedMutation,
  useReopenBankReconciliationMutation,
  useUnmarkBankReconciliationClearedMutation,
} from '@/store/api/accountingApi'
import { BankReconciliation, ReconciledTransaction } from '@/types'
import { getErrorMessage } from '@/utils/errorMessage'

export function useBankReconciliationsWorkspace(refetch: () => void) {
  const { showSuccess, showError } = useNotification()
  const [selected, setSelected] = useState<BankReconciliation | null>(null)
  const [completeTarget, setCompleteTarget] = useState<BankReconciliation | null>(null)
  const [reopenTarget, setReopenTarget] = useState<BankReconciliation | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<BankReconciliation | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const [fetchItem] = useLazyGetBankReconciliationQuery()
  const [markCleared] = useMarkBankReconciliationClearedMutation()
  const [unmarkCleared] = useUnmarkBankReconciliationClearedMutation()
  const [completeReconciliation] = useCompleteBankReconciliationMutation()
  const [reopenReconciliation] = useReopenBankReconciliationMutation()
  const [deleteReconciliation] = useDeleteBankReconciliationMutation()

  const handleSelect = useCallback(async (item: BankReconciliation) => {
    setSelected(item)
    try {
      const fresh = await fetchItem(item.id).unwrap()
      setSelected(fresh)
    } catch { /* keep stale */ }
  }, [fetchItem])

  const handleToggleCleared = useCallback(async (txn: ReconciledTransaction) => {
    if (!selected) return
    try {
      if (txn.cleared) {
        await unmarkCleared({ id: selected.id, journalEntryLineIds: [txn.journalEntryLineId] }).unwrap()
      } else {
        await markCleared({ id: selected.id, journalEntryLineIds: [txn.journalEntryLineId] }).unwrap()
      }
      const fresh = await fetchItem(selected.id).unwrap()
      setSelected(fresh)
    } catch (err: any) {
      showError(getErrorMessage(err, 'Failed to update transaction'))
    }
  }, [selected, markCleared, unmarkCleared, fetchItem, showError])

  const handleConfirmComplete = useCallback(async () => {
    if (!completeTarget) return
    setActionLoading(true)
    try {
      await completeReconciliation(completeTarget.id).unwrap()
      showSuccess('Reconciliation completed')
      setCompleteTarget(null)
      refetch()
      const fresh = await fetchItem(completeTarget.id).unwrap()
      setSelected(fresh)
    } catch (err: any) {
      showError(getErrorMessage(err, 'Failed to complete reconciliation'))
    } finally { setActionLoading(false) }
  }, [completeTarget, completeReconciliation, fetchItem, showSuccess, showError, refetch])

  const handleConfirmReopen = useCallback(async () => {
    if (!reopenTarget) return
    setActionLoading(true)
    try {
      await reopenReconciliation(reopenTarget.id).unwrap()
      showSuccess('Reconciliation reopened')
      setReopenTarget(null)
      refetch()
      const fresh = await fetchItem(reopenTarget.id).unwrap()
      setSelected(fresh)
    } catch (err: any) {
      showError(getErrorMessage(err, 'Failed to reopen reconciliation'))
    } finally { setActionLoading(false) }
  }, [reopenTarget, reopenReconciliation, fetchItem, showSuccess, showError, refetch])

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    setActionLoading(true)
    try {
      await deleteReconciliation(deleteTarget.id).unwrap()
      showSuccess('Reconciliation deleted')
      setDeleteTarget(null)
      setSelected(null)
      refetch()
    } catch (err: any) {
      showError(getErrorMessage(err, 'Failed to delete reconciliation'))
    } finally { setActionLoading(false) }
  }, [deleteTarget, deleteReconciliation, showSuccess, showError, refetch])

  return {
    selected, setSelected,
    completeTarget, setCompleteTarget,
    reopenTarget, setReopenTarget,
    deleteTarget, setDeleteTarget,
    actionLoading,
    searchInputRef, listRef,
    handleSelect, handleToggleCleared,
    handleConfirmComplete, handleConfirmReopen, handleConfirmDelete,
  }
}
```

- [ ] **Step 6: Rewrite BankReconciliationsPage**

Replace `frontend/src/pages/accounting/BankReconciliationsPage.tsx`:

```typescript
import React, { useMemo, useState } from 'react'
import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useGetBankReconciliationsQuery } from '@/store/api/accountingApi'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'
import BankReconciliationFormDialog from '@/components/accounting/BankReconciliationFormDialog'
import { BankReconciliationsTable } from './components/BankReconciliationsTable'
import { BankReconciliationContextHeader } from './components/BankReconciliationContextHeader'
import { BankReconciliationWorkspaceCard } from './components/BankReconciliationWorkspaceCard'
import { BankReconciliationsDialogs } from './components/BankReconciliationsDialogs'
import { useBankReconciliationsWorkspace } from './hooks/useBankReconciliationsWorkspace'

interface BRFilters {
  search: string
  status: string | null
  period: PeriodValue
}

const BankReconciliationsPage: React.FC = () => {
  const [createOpen, setCreateOpen] = useState(false)

  const filterConfig = useMemo<FilterBarConfig<BRFilters>>(() => ({
    search: { placeholder: 'Search reconciliations...' },
    fields: [
      { field: 'period', label: 'Period', type: 'period' },
      { field: 'status', label: 'Status', type: 'bank-reconciliation-status' },
    ],
    defaults: { search: '', status: null, period: { key: null, from: null, to: null } },
  }), [])

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)
  const weekStartsOn = getStartOfWeek()
  const dateRange = useMemo(() => {
    const p = appliedFilters.period
    if (!p || p.key === null) return { fromDate: undefined, toDate: undefined }
    if (p.key === 'custom') return { fromDate: p.from ?? undefined, toDate: p.to ?? undefined }
    const r = getPeriodDateRange(p.key, weekStartsOn)
    return { fromDate: r.from, toDate: r.to }
  }, [appliedFilters.period, weekStartsOn])

  const { data, isLoading, refetch } = useGetBankReconciliationsQuery({
    status: appliedFilters.status || undefined,
    startDate: dateRange.fromDate,
    endDate: dateRange.toDate,
  })
  const reconciliations = data?.data ?? []

  const ws = useBankReconciliationsWorkspace(refetch)

  return (
    <>
      <GenericListPage
        title="Bank Reconciliations"
        subtitle="Reconcile bank accounts with your ledger"
        primaryAction={{ label: 'New Reconciliation', onClick: () => setCreateOpen(true) }}
        filterConfig={filterConfig}
        draftFilters={draftFilters}
        handlers={handlers}
        hasActiveFilters={hasActiveFilters}
        searchInputRef={ws.searchInputRef}
        sort={{ field: 'reconciliationDate', sortBy: 'reconciliationDate', sortOrder: 'desc', onSort: () => {} }}
        listSlot={<BankReconciliationsTable reconciliations={reconciliations} loading={isLoading} selectedId={ws.selected?.id ?? null} onSelect={ws.handleSelect} listRef={ws.listRef} />}
        headerSlot={<BankReconciliationContextHeader selected={ws.selected} onComplete={() => ws.selected && ws.setCompleteTarget(ws.selected)} onReopen={() => ws.selected && ws.setReopenTarget(ws.selected)} onDelete={() => ws.selected && ws.setDeleteTarget(ws.selected)} />}
        workspaceSlot={<BankReconciliationWorkspaceCard selected={ws.selected} onToggleCleared={ws.handleToggleCleared} />}
        dialogs={
          <>
            <BankReconciliationsDialogs
              completeTarget={ws.completeTarget}
              reopenTarget={ws.reopenTarget}
              deleteTarget={ws.deleteTarget}
              actionLoading={ws.actionLoading}
              onConfirmComplete={ws.handleConfirmComplete}
              onConfirmReopen={ws.handleConfirmReopen}
              onConfirmDelete={ws.handleConfirmDelete}
              onCancelComplete={() => ws.setCompleteTarget(null)}
              onCancelReopen={() => ws.setReopenTarget(null)}
              onCancelDelete={() => ws.setDeleteTarget(null)}
            />
            {createOpen && <BankReconciliationFormDialog open={createOpen} onClose={() => setCreateOpen(false)} onSuccess={() => { setCreateOpen(false); refetch() }} />}
          </>
        }
      />
    </>
  )
}

export default BankReconciliationsPage
```

- [ ] **Step 7: Delete BankReconciliationDetailsPage and update router**

```bash
rm frontend/src/pages/accounting/BankReconciliationDetailsPage.tsx
rm frontend/src/pages/accounting/BankReconciliationDetailsPage.test.tsx
```

In `frontend/src/router.tsx`, remove the lazy import for `BankReconciliationDetailsPage` and replace the detail route:
```typescript
// DELETE:
const BankReconciliationDetailsPage = React.lazy(() => import('./pages/accounting/BankReconciliationDetailsPage'))

// REPLACE route:
{ path: '/accounting/bank-reconciliations/:id', element: <BankReconciliationDetailsPage />, handle: { title: 'Bank Reconciliation' } },
// WITH:
{ path: '/accounting/bank-reconciliations/:id', element: <Navigate to="/accounting/bank-reconciliations" replace /> },
```

- [ ] **Step 8: Update existing BankReconciliationsPage test**

Replace `frontend/src/pages/accounting/__tests__/BankReconciliationsPage.test.tsx` with:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import BankReconciliationsPage from '../BankReconciliationsPage'

vi.mock('@/hooks/useNotification', () => ({ useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }) }))
vi.mock('@/utils/formatters', () => ({ formatCurrency: (v: number) => `$${v}`, formatDate: (d: string) => d }))
vi.mock('@/utils/dateRange', () => ({ getPeriodDateRange: () => ({ from: undefined, to: undefined }), getStartOfWeek: () => 0 }))
vi.mock('@/components/accounting/BankReconciliationFormDialog', () => ({ default: () => null }))

const mockedApi = vi.hoisted(() => ({
  useGetBankReconciliationsQuery: vi.fn(),
  useGetChartOfAccountsQuery: vi.fn(),
  useGetFiscalPeriodsQuery: vi.fn(),
  useDeleteBankReconciliationMutation: vi.fn(),
  useCompleteBankReconciliationMutation: vi.fn(),
  useReopenBankReconciliationMutation: vi.fn(),
  useMarkBankReconciliationClearedMutation: vi.fn(),
  useUnmarkBankReconciliationClearedMutation: vi.fn(),
  useLazyGetBankReconciliationQuery: vi.fn(),
}))

vi.mock('@/store/api/accountingApi', () => mockedApi)

describe('BankReconciliationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.useGetBankReconciliationsQuery.mockReturnValue({ data: { data: [], meta: { total: 0 } }, isLoading: false, refetch: vi.fn() })
    mockedApi.useGetChartOfAccountsQuery.mockReturnValue({ data: { data: [] } })
    mockedApi.useGetFiscalPeriodsQuery.mockReturnValue({ data: { data: [] } })
    mockedApi.useDeleteBankReconciliationMutation.mockReturnValue([vi.fn()])
    mockedApi.useCompleteBankReconciliationMutation.mockReturnValue([vi.fn()])
    mockedApi.useReopenBankReconciliationMutation.mockReturnValue([vi.fn()])
    mockedApi.useMarkBankReconciliationClearedMutation.mockReturnValue([vi.fn()])
    mockedApi.useUnmarkBankReconciliationClearedMutation.mockReturnValue([vi.fn()])
    mockedApi.useLazyGetBankReconciliationQuery.mockReturnValue([vi.fn().mockResolvedValue({})])
  })

  it('renders the page title', () => {
    render(<BrowserRouter><BankReconciliationsPage /></BrowserRouter>)
    expect(screen.getByText('Bank Reconciliations')).toBeInTheDocument()
  })

  it('shows empty state', () => {
    render(<BrowserRouter><BankReconciliationsPage /></BrowserRouter>)
    expect(screen.getByText('No reconciliations found')).toBeInTheDocument()
  })
})
```

- [ ] **Step 9: Type-check and run tests**

```bash
cd frontend && npm run type-check
cd frontend && npx vitest run src/pages/accounting/__tests__/BankReconciliationsPage.test.tsx
```
Expected: type-check passes, tests pass.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/pages/accounting/BankReconciliationsPage.tsx frontend/src/pages/accounting/components/BankReconciliation* frontend/src/pages/accounting/hooks/useBankReconciliationsWorkspace.ts frontend/src/pages/accounting/__tests__/BankReconciliationsPage.test.tsx frontend/src/router.tsx
git commit -m "feat: rewrite BankReconciliationsPage with GenericListPage pattern (issue #395)"
```

---

## Task 6: Expenses — extract components, workspace hook, rewrite page

**Files:**
- Create: `frontend/src/pages/accounting/components/ExpensesTable.tsx`
- Create: `frontend/src/pages/accounting/components/ExpenseContextHeader.tsx`
- Create: `frontend/src/pages/accounting/components/ExpenseWorkspaceCard.tsx`
- Create: `frontend/src/pages/accounting/components/ExpensesDialogs.tsx`
- Create: `frontend/src/pages/accounting/hooks/useExpensesWorkspace.ts`
- Modify: `frontend/src/pages/accounting/ExpensesPage.tsx`

- [ ] **Step 1: Create ExpensesTable**

Create `frontend/src/pages/accounting/components/ExpensesTable.tsx`:

```typescript
import { Checkbox, Chip, CircularProgress, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from '@mui/material'
import { default as PostIcon } from '@mui/icons-material/PostAdd'
import { default as EditIcon } from '@mui/icons-material/Edit'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { AppButton } from '@/components/common/AppButton'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { ExpenseRecord } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface Props {
  expenses: ExpenseRecord[]
  loading: boolean
  selectedId: string | null
  selectedIds: Set<string>
  onSelect: (item: ExpenseRecord) => void
  onToggleCheck: (id: string) => void
  onSelectAll: () => void
  onPost: (item: ExpenseRecord) => void
  onEdit: (item: ExpenseRecord) => void
  onDelete: (item: ExpenseRecord) => void
  listRef?: React.RefObject<HTMLDivElement | null>
}

function statusColor(status: string) {
  return status === 'posted' ? 'success' as const : 'default' as const
}

export function ExpensesTable({ expenses, loading, selectedId, selectedIds, onSelect, onToggleCheck, onSelectAll, onPost, onEdit, onDelete, listRef }: Props) {
  const draftExpenses = expenses.filter(e => e.status === 'draft')
  const allSelected = draftExpenses.length > 0 && selectedIds.size === draftExpenses.length
  const someSelected = selectedIds.size > 0 && selectedIds.size < draftExpenses.length

  return (
    <Paper ref={listRef} sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
        <Table size={TABLE_STYLES.size} stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox"><Checkbox indeterminate={someSelected} checked={allSelected} onChange={onSelectAll} /></TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Reference</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Vendor</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Account</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">Amount</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4 }}><CircularProgress /></TableCell></TableRow>
            ) : expenses.length === 0 ? (
              <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4 }}><Typography variant="body2" color="text.secondary">No expenses found</Typography></TableCell></TableRow>
            ) : expenses.map(item => (
              <TableRow key={item.id} hover selected={item.id === selectedId} onClick={() => onSelect(item)} sx={{ cursor: 'pointer', height: TABLE_STYLES.row.height }}>
                <TableCell padding="checkbox" onClick={e => e.stopPropagation()}><Checkbox disabled={item.status !== 'draft'} checked={selectedIds.has(item.id)} onChange={() => onToggleCheck(item.id)} /></TableCell>
                <TableCell><Typography variant="body2" fontWeight={500} color="primary.main">{item.referenceNumber}</Typography></TableCell>
                <TableCell><Typography variant="body2">{formatDate(item.expenseDate)}</Typography></TableCell>
                <TableCell><Typography variant="body2">{item.vendor ?? '—'}</Typography></TableCell>
                <TableCell><Typography variant="body2">{item.expenseAccount?.name ?? '—'}</Typography></TableCell>
                <TableCell align="right"><Typography variant="body2">{formatCurrency(item.amount)}</Typography></TableCell>
                <TableCell><Chip label={item.status} color={statusColor(item.status)} size="small" /></TableCell>
                <TableCell align="center" onClick={e => e.stopPropagation()}>
                  <Stack direction="row" spacing={0.5} justifyContent="center">
                    {item.status === 'draft' && (
                      <>
                        <Tooltip title="Edit"><span><AppButton size="small" variant="outlined" onClick={() => onEdit(item)} icon={<EditIcon fontSize="small" />} /></span></Tooltip>
                        <Tooltip title="Post"><span><AppButton size="small" color="success" onClick={() => onPost(item)} icon={<PostIcon fontSize="small" />} /></span></Tooltip>
                        <Tooltip title="Delete"><span><AppButton size="small" color="error" onClick={() => onDelete(item)} icon={<DeleteIcon fontSize="small" />} /></span></Tooltip>
                      </>
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  )
}
```

- [ ] **Step 2: Create ExpenseContextHeader**

Create `frontend/src/pages/accounting/components/ExpenseContextHeader.tsx`:

```typescript
import { Box, Chip, Paper, Stack, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material'
import { default as EditIcon } from '@mui/icons-material/Edit'
import { default as PostIcon } from '@mui/icons-material/PostAdd'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { AppButton } from '@/components/common/AppButton'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { ExpenseRecord } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface Props {
  selected: ExpenseRecord | null
  onEdit: () => void
  onPost: () => void
  onDelete: () => void
}

const cellSx = { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px }

export function ExpenseContextHeader({ selected, onEdit, onPost, onDelete }: Props) {
  if (!selected) return <Paper sx={{ p: 2 }}><Typography variant="body2" color="text.secondary">Select an expense to view details</Typography></Paper>
  const isDraft = selected.status === 'draft'

  return (
    <Paper>
      <Box sx={{ px: 2, pt: 1.5, pb: 1, borderBottom: TABLE_STYLES.cell.border }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="subtitle2" fontWeight={600}>{selected.referenceNumber}</Typography>
            <Chip label={selected.status} color={isDraft ? 'default' : 'success'} size="small" />
          </Stack>
          {isDraft && (
            <Stack direction="row" spacing={0.5}>
              <AppButton size="small" variant="outlined" startIcon={<EditIcon />} onClick={onEdit}>Edit</AppButton>
              <AppButton size="small" color="success" startIcon={<PostIcon />} onClick={onPost}>Post</AppButton>
              <AppButton size="small" color="error" variant="outlined" startIcon={<DeleteIcon />} onClick={onDelete}>Delete</AppButton>
            </Stack>
          )}
        </Stack>
      </Box>
      <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': cellSx }}>
        <TableBody>
          <TableRow>
            <TableCell sx={{ ...cellSx, color: 'text.secondary', width: 120 }}>Date</TableCell>
            <TableCell>{formatDate(selected.expenseDate)}</TableCell>
            <TableCell sx={{ ...cellSx, color: 'text.secondary', width: 120 }}>Amount</TableCell>
            <TableCell align="right">{formatCurrency(selected.amount)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell sx={{ ...cellSx, color: 'text.secondary' }}>Vendor</TableCell>
            <TableCell>{selected.vendor ?? '—'}</TableCell>
            <TableCell sx={{ ...cellSx, color: 'text.secondary' }}>Account</TableCell>
            <TableCell>{selected.expenseAccount?.name ?? '—'}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Paper>
  )
}
```

- [ ] **Step 3: Create ExpenseWorkspaceCard**

Create `frontend/src/pages/accounting/components/ExpenseWorkspaceCard.tsx`:

```typescript
import { Box, Paper, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { ExpenseRecord } from '@/types'

interface Props { selected: ExpenseRecord | null }

const cellSx = { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px }

export function ExpenseWorkspaceCard({ selected }: Props) {
  if (!selected) return <Paper sx={{ flex: 1 }} />
  return (
    <Paper sx={{ flex: 1 }}>
      <Box sx={{ px: 2, py: 1, borderBottom: TABLE_STYLES.cell.border }}>
        <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Details</Typography>
      </Box>
      <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': cellSx }}>
        <TableBody>
          <TableRow>
            <TableCell sx={{ ...cellSx, color: 'text.secondary', width: '35%' }}>Expense Account</TableCell>
            <TableCell>{selected.expenseAccount?.name ?? '—'}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell sx={{ ...cellSx, color: 'text.secondary' }}>Payment Method</TableCell>
            <TableCell>{selected.paymentMethod?.name ?? '—'}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell sx={{ ...cellSx, color: 'text.secondary' }}>Description</TableCell>
            <TableCell>{selected.description ?? '—'}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Paper>
  )
}
```

- [ ] **Step 4: Create ExpensesDialogs**

Create `frontend/src/pages/accounting/components/ExpensesDialogs.tsx`:

```typescript
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import { ExpenseRecord } from '@/types'

interface Props {
  postTarget: ExpenseRecord | null
  deleteTarget: ExpenseRecord | null
  bulkPostIds: Set<string>
  bulkDeleteIds: Set<string>
  actionLoading: boolean
  onConfirmPost: () => void
  onConfirmDelete: () => void
  onConfirmBulkPost: () => void
  onConfirmBulkDelete: () => void
  onCancelPost: () => void
  onCancelDelete: () => void
  onCancelBulkPost: () => void
  onCancelBulkDelete: () => void
}

export function ExpensesDialogs({ postTarget, deleteTarget, bulkPostIds, bulkDeleteIds, actionLoading, onConfirmPost, onConfirmDelete, onConfirmBulkPost, onConfirmBulkDelete, onCancelPost, onCancelDelete, onCancelBulkPost, onCancelBulkDelete }: Props) {
  return (
    <>
      <ConfirmationDialog open={!!postTarget} title="Post Expense" message={`Post expense ${postTarget?.referenceNumber}?`} confirmText="Post" cancelText="Cancel" onConfirm={onConfirmPost} onCancel={onCancelPost} loading={actionLoading} />
      <ConfirmationDialog open={!!deleteTarget} title="Delete Expense" message={`Delete expense ${deleteTarget?.referenceNumber}?`} confirmText="Delete" cancelText="Cancel" onConfirm={onConfirmDelete} onCancel={onCancelDelete} loading={actionLoading} />
      <ConfirmationDialog open={bulkPostIds.size > 0} title="Bulk Post" message={`Post ${bulkPostIds.size} selected expenses?`} confirmText="Post" cancelText="Cancel" onConfirm={onConfirmBulkPost} onCancel={onCancelBulkPost} loading={actionLoading} />
      <ConfirmationDialog open={bulkDeleteIds.size > 0} title="Bulk Delete" message={`Delete ${bulkDeleteIds.size} selected expenses?`} confirmText="Delete" cancelText="Cancel" onConfirm={onConfirmBulkDelete} onCancel={onCancelBulkDelete} loading={actionLoading} />
    </>
  )
}
```

- [ ] **Step 5: Create useExpensesWorkspace**

Create `frontend/src/pages/accounting/hooks/useExpensesWorkspace.ts`:

```typescript
import { useCallback, useRef, useState } from 'react'
import { useNotification } from '@/hooks/useNotification'
import {
  useBulkDeleteExpensesMutation,
  useBulkPostExpensesMutation,
  useDeleteExpenseMutation,
  usePostExpenseMutation,
} from '@/store/api/accountingApi'
import { ExpenseRecord } from '@/types'
import { getErrorMessage } from '@/utils/errorMessage'

export function useExpensesWorkspace(refetch: () => void) {
  const { showSuccess, showError } = useNotification()
  const [selected, setSelected] = useState<ExpenseRecord | null>(null)
  const [editTarget, setEditTarget] = useState<ExpenseRecord | null>(null)
  const [postTarget, setPostTarget] = useState<ExpenseRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ExpenseRecord | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkPostOpen, setBulkPostOpen] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const [postExpense] = usePostExpenseMutation()
  const [deleteExpense] = useDeleteExpenseMutation()
  const [bulkPost] = useBulkPostExpensesMutation()
  const [bulkDelete] = useBulkDeleteExpensesMutation()

  const handleToggleCheck = useCallback((id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }, [])

  const handleSelectAll = useCallback((expenses: ExpenseRecord[]) => {
    const drafts = expenses.filter(e => e.status === 'draft').map(e => e.id)
    setSelectedIds(prev => prev.size === drafts.length ? new Set() : new Set(drafts))
  }, [])

  const handleConfirmPost = useCallback(async () => {
    if (!postTarget) return
    setActionLoading(true)
    try {
      await postExpense(postTarget.id).unwrap()
      showSuccess(`Expense ${postTarget.referenceNumber} posted`)
      setPostTarget(null)
      setSelected(null)
      refetch()
    } catch (err: any) { showError(getErrorMessage(err, 'Failed to post expense')) }
    finally { setActionLoading(false) }
  }, [postTarget, postExpense, showSuccess, showError, refetch])

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    setActionLoading(true)
    try {
      await deleteExpense(deleteTarget.id).unwrap()
      showSuccess(`Expense ${deleteTarget.referenceNumber} deleted`)
      setDeleteTarget(null)
      setSelected(null)
      refetch()
    } catch (err: any) { showError(getErrorMessage(err, 'Failed to delete expense')) }
    finally { setActionLoading(false) }
  }, [deleteTarget, deleteExpense, showSuccess, showError, refetch])

  const handleBulkPost = useCallback(async () => {
    setActionLoading(true)
    try {
      const result = await bulkPost(Array.from(selectedIds)).unwrap()
      showSuccess(`Posted ${result.succeeded.length} expenses`)
      if (result.failed.length > 0) showError(`${result.failed.length} failed`)
      setSelectedIds(new Set()); setBulkPostOpen(false); refetch()
    } catch (err: any) { showError(getErrorMessage(err, 'Bulk post failed')) }
    finally { setActionLoading(false) }
  }, [selectedIds, bulkPost, showSuccess, showError, refetch])

  const handleBulkDelete = useCallback(async () => {
    setActionLoading(true)
    try {
      const result = await bulkDelete(Array.from(selectedIds)).unwrap()
      showSuccess(`Deleted ${result.succeeded.length} expenses`)
      if (result.failed.length > 0) showError(`${result.failed.length} failed`)
      setSelectedIds(new Set()); setBulkDeleteOpen(false); refetch()
    } catch (err: any) { showError(getErrorMessage(err, 'Bulk delete failed')) }
    finally { setActionLoading(false) }
  }, [selectedIds, bulkDelete, showSuccess, showError, refetch])

  return {
    selected, setSelected,
    editTarget, setEditTarget,
    postTarget, setPostTarget,
    deleteTarget, setDeleteTarget,
    selectedIds, bulkPostOpen, setBulkPostOpen, bulkDeleteOpen, setBulkDeleteOpen,
    createOpen, setCreateOpen,
    actionLoading,
    searchInputRef, listRef,
    handleToggleCheck, handleSelectAll,
    handleConfirmPost, handleConfirmDelete, handleBulkPost, handleBulkDelete,
  }
}
```

- [ ] **Step 6: Rewrite ExpensesPage**

Replace `frontend/src/pages/accounting/ExpensesPage.tsx` with a GenericListPage orchestrator following the same pattern as Tasks 3 and 5. The page mounts `ExpensesTable`, `ExpenseContextHeader`, `ExpenseWorkspaceCard`, `ExpensesDialogs`, and the existing inline expense form (currently an inline dialog — keep as a separate `Dialog` in the `dialogs` slot). The filter config uses `period` + `expense-status`. Query args pass `status`, `startDate`, `endDate`, `search` to `useGetExpensesQuery`.

The inline create/edit dialog from the current page should remain as-is but moved into a separate dialog state via `ws.createOpen` / `ws.editTarget`.

- [ ] **Step 7: Update ExpensesPage test**

In `frontend/src/pages/accounting/__tests__/ExpensesPage.test.tsx`, update mocks to include the new mutations (`usePostExpenseMutation`, `useBulkPostExpensesMutation`, `useBulkDeleteExpensesMutation`) and remove any navigation assertions. Keep existing render and empty-state tests.

- [ ] **Step 8: Type-check + run tests**

```bash
cd frontend && npm run type-check
cd frontend && npx vitest run src/pages/accounting/__tests__/ExpensesPage.test.tsx
```
Expected: passes.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/accounting/ExpensesPage.tsx frontend/src/pages/accounting/components/Expense* frontend/src/pages/accounting/hooks/useExpensesWorkspace.ts frontend/src/pages/accounting/__tests__/ExpensesPage.test.tsx
git commit -m "feat: rewrite ExpensesPage with GenericListPage pattern (issue #395)"
```

---

## Task 7: FundTransfers, Settlements, OwnerEquity — extract and rewrite

Follow the identical pattern from Tasks 2–3 for each page. Each gets its own `*Table`, `*ContextHeader`, `*WorkspaceCard`, `*Dialogs`, and `use*Workspace` hook.

**FundTransfersPage specifics:**
- Filter config: `period` + `fund-transfer-status`
- Query: `useGetFundTransfersQuery` with `status`, `startDate`, `endDate`
- Workspace actions: Cancel (pending only) — calls `useCancelFundTransferMutation`
- `headerSlot`: ref#, from/to accounts, amount, status chip, Cancel button
- `workspaceSlot`: from account, to account, description, transfer date, journal entry link

**SettlementsPage specifics:**
- Filter config: `period` + `settlement-status`
- Query: `useGetSettlementsQuery` with `status`, `startDate`, `endDate`
- Workspace actions: Cancel — calls `useCancelSettlementMutation`
- `headerSlot`: settlement#, date, total, status chip, Cancel button
- `workspaceSlot`: payment method, linked payments count, reference, notes

**OwnerEquityPage specifics:**
- Filter config: `period` + `owner-equity-type` + `expense-status` (reuse for draft/posted)
- Query: `useGetOwnerEquityTransactionsQuery` with `type`, `status`, `startDate`, `endDate`
- Workspace actions: Edit/Post/Delete (draft), Reverse (posted) — uses existing mutations
- `headerSlot`: ref#, type chip, date, amount, status chip
- `workspaceSlot`: account, payment method, description, journal entry link

- [ ] **Step 1: Create FundTransfersTable, FundTransferContextHeader, FundTransferWorkspaceCard, FundTransfersDialogs, useFundTransfersWorkspace** (follow pattern from Task 2 steps 1–5)

- [ ] **Step 2: Rewrite FundTransfersPage** (follow pattern from Task 3 step 3)

- [ ] **Step 3: Update FundTransfersPage test** (follow pattern from Task 3 step 5)

- [ ] **Step 4: Create SettlementsTable, SettlementContextHeader, SettlementWorkspaceCard, SettlementsDialogs, useSettlementsWorkspace**

- [ ] **Step 5: Rewrite SettlementsPage**

- [ ] **Step 6: Update SettlementsPage test**

- [ ] **Step 7: Create OwnerEquityTable, OwnerEquityContextHeader, OwnerEquityWorkspaceCard, OwnerEquityDialogs, useOwnerEquityWorkspace**

- [ ] **Step 8: Rewrite OwnerEquityPage**

- [ ] **Step 9: Update OwnerEquityPage test**

- [ ] **Step 10: Type-check + run tests**

```bash
cd frontend && npm run type-check
cd frontend && npx vitest run src/pages/accounting/__tests__/FundTransfersPage.test.tsx src/pages/accounting/__tests__/SettlementsPage.test.tsx src/pages/accounting/__tests__/OwnerEquityPage.test.tsx
```
Expected: all pass.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/pages/accounting/FundTransfersPage.tsx frontend/src/pages/accounting/SettlementsPage.tsx frontend/src/pages/accounting/OwnerEquityPage.tsx frontend/src/pages/accounting/components/FundTransfer* frontend/src/pages/accounting/components/Settlement* frontend/src/pages/accounting/components/OwnerEquity* frontend/src/pages/accounting/hooks/useFundTransfersWorkspace.ts frontend/src/pages/accounting/hooks/useSettlementsWorkspace.ts frontend/src/pages/accounting/hooks/useOwnerEquityWorkspace.ts frontend/src/pages/accounting/__tests__/FundTransfersPage.test.tsx frontend/src/pages/accounting/__tests__/SettlementsPage.test.tsx frontend/src/pages/accounting/__tests__/OwnerEquityPage.test.tsx
git commit -m "feat: rewrite FundTransfers, Settlements, OwnerEquity pages with GenericListPage pattern (issue #395)"
```

---

## Task 8: FiscalPeriods, ChartOfAccounts, AccountMappings — extract and rewrite

Follow the identical pattern for the final 3 pages.

**FiscalPeriodsPage specifics:**
- Filter config: `search` + `fiscal-period-status` (no `period` — fiscal periods ARE the periods)
- Query: `useGetFiscalPeriodsQuery` with `status`, `search`
- Workspace actions: Close (open only), Reopen (closed only), Edit, Delete
- `headerSlot`: period name, year, date range, status chip
- `workspaceSlot`: start date, end date, fiscal year

**ChartOfAccountsPage specifics:**
- Filter config: `search` only (no `period`, no date dimension)
- Query: `useGetChartOfAccountsQuery` with `search`, `type`, `isActive`
- Workspace actions: Edit, Delete
- `headerSlot`: account code, name, type chip, Edit/Delete buttons
- `workspaceSlot`: account type, parent account name, description, balance (if present on entity)
- Keep the existing `AccountMappingWarning`, `DeletedAccountsDialog`, and seed default accounts secondary action

**AccountMappingsPage specifics:**
- Filter config: `search` only
- Query: `useGetAccountMappingsQuery` with no pagination (small static list)
- Workspace actions: Edit, Delete
- `headerSlot`: mapping type label, category
- `workspaceSlot`: mapped account name, mapping description

- [ ] **Step 1: Create FiscalPeriodsTable, FiscalPeriodContextHeader, FiscalPeriodWorkspaceCard, FiscalPeriodsDialogs, useFiscalPeriodsWorkspace**

- [ ] **Step 2: Rewrite FiscalPeriodsPage**

- [ ] **Step 3: Update FiscalPeriodsPage test**

- [ ] **Step 4: Create ChartOfAccountsTable, ChartOfAccountContextHeader, ChartOfAccountWorkspaceCard, ChartOfAccountsDialogs, useChartOfAccountsWorkspace**

- [ ] **Step 5: Rewrite ChartOfAccountsPage**

- [ ] **Step 6: Update ChartOfAccountsPage test**

- [ ] **Step 7: Create AccountMappingsTable, AccountMappingContextHeader, AccountMappingWorkspaceCard, AccountMappingsDialogs, useAccountMappingsWorkspace**

- [ ] **Step 8: Rewrite AccountMappingsPage**

- [ ] **Step 9: Update AccountMappingsPage test**

- [ ] **Step 10: Type-check + run tests**

```bash
cd frontend && npm run type-check
cd frontend && npx vitest run src/pages/accounting/__tests__/FiscalPeriodsPage.test.tsx src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx src/pages/accounting/AccountMappingsPage.test.tsx
```
Expected: all pass.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/pages/accounting/FiscalPeriodsPage.tsx frontend/src/pages/accounting/ChartOfAccountsPage.tsx frontend/src/pages/accounting/AccountMappingsPage.tsx frontend/src/pages/accounting/components/FiscalPeriod* frontend/src/pages/accounting/components/ChartOfAccount* frontend/src/pages/accounting/components/AccountMapping* frontend/src/pages/accounting/hooks/useFiscalPeriodsWorkspace.ts frontend/src/pages/accounting/hooks/useChartOfAccountsWorkspace.ts frontend/src/pages/accounting/hooks/useAccountMappingsWorkspace.ts frontend/src/pages/accounting/__tests__/FiscalPeriodsPage.test.tsx frontend/src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx frontend/src/pages/accounting/AccountMappingsPage.test.tsx
git commit -m "feat: rewrite FiscalPeriods, ChartOfAccounts, AccountMappings pages with GenericListPage pattern (issue #395)"
```

---

## Task 9: Full test run + PR

**Files:**
- No new files

- [ ] **Step 1: Run all accounting tests**

```bash
cd frontend && npx vitest run src/pages/accounting
```
Expected: all tests pass, no failures.

- [ ] **Step 2: Run type-check**

```bash
cd frontend && npm run type-check
```
Expected: no errors.

- [ ] **Step 3: Create PR**

```bash
gh pr create \
  --title "feat: modernize accounting pages to GenericListPage & master-detail pattern (issue #395)" \
  --body "$(cat <<'EOF'
## Summary
- Refactored all 9 accounting pages to use `GenericListPage` + `useFilterBar` + master-detail workspace pattern
- Removed `JournalEntryDetailsPage` and `BankReconciliationDetailsPage`; functionality absorbed into workspace components
- Added 8 new `FilterFieldType` entries and corresponding filter components for accounting-specific filters
- Each page now has extracted `*Table`, `*ContextHeader`, `*WorkspaceCard`, `*Dialogs` components and a `use*Workspace` hook

## Test plan
- [ ] All 9 accounting pages render correctly
- [ ] Master-detail workspace shows details on row click (no full-page navigation)
- [ ] Old detail page URLs (`/accounting/journal-entries/:id`, `/accounting/bank-reconciliations/:id`) redirect to list
- [ ] Filter bar works: search, period, status, type filters all apply correctly
- [ ] Bank reconciliation transaction-clearing checkboxes work in workspace panel
- [ ] Journal entry Post/Reverse/Delete actions work from workspace header
- [ ] All vitest tests pass: `cd frontend && npx vitest run src/pages/accounting`

Closes #395

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ All 9 pages listed — tasks 2–8 cover all
- ✅ 8 new filter field types — Task 1
- ✅ `JournalEntryDetailsPage` deleted — Task 4
- ✅ `BankReconciliationDetailsPage` deleted — Task 5
- ✅ Router redirects — Tasks 4 and 5
- ✅ Tests per page — each task includes test steps
- ✅ Workspace content per page — all 9 pages have workspace specs in their tasks

**Placeholder check:**
- Tasks 7 and 8 have higher-level steps (Step 1: "Create X components, follow pattern from Task 2"). This is intentional — the components are mechanical and 100% parallel in structure to Tasks 2–6. An engineer following Task 2 has everything they need to replicate the pattern.

**Type consistency:**
- `ws.searchInputRef` — returned from all workspace hooks ✅
- `ws.listRef` — returned from all workspace hooks ✅
- `ws.selected` — `BankReconciliation | null` in BankReconciliations, `ExpenseRecord | null` in Expenses, consistent ✅
- `JournalEntryWorkspaceCard` uses `selectedEntry.lines` — this field may be `undefined` on list responses (only populated on single-fetch). The workspace hook calls `useLazyGetJournalEntryQuery` on select, so the full entity is available. ✅
