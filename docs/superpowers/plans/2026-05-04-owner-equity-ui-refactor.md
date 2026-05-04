# Owner Equity UI/UX Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Owner Equity page to match the gold-standard List-Detail (Workspace) pattern used by Settlements and Journal Entries, adding keyboard navigation, a two-column context header, and a `useJournalEntryRefs`-powered JE link.

**Architecture:** `OwnerEquityTable` becomes a thin `EntityTable` wrapper (ref number column only); `useOwnerEquityWorkspace` delegates to `useEntityWorkspace` for all generic selection/keyboard concerns, adding custom post/delete/reverse/dialog state on top; `OwnerEquityContextHeader` adopts the two-column MUI Grid layout matching `SettlementContextHeader`; `OwnerEquityWorkspaceCard` is trimmed to audit/supplementary metadata only (payment method already in header); `useJournalEntryRefs` replaces the raw `journalEntryId` link with a navigable reference number. No new files are created — all six existing files are updated in place.

**Tech Stack:** React 19, TypeScript, MUI v7, RTK Query, Vitest + React Testing Library

---

## File Map

| File | Change |
|---|---|
| `frontend/src/pages/accounting/components/OwnerEquityTable.tsx` | Replace manual 6-column table with `EntityTable` wrapper (ref number only) |
| `frontend/src/pages/accounting/hooks/useOwnerEquityWorkspace.ts` | Delegate to `useEntityWorkspace`; keep post/delete/reverse/dialog state on top |
| `frontend/src/pages/accounting/OwnerEquityPage.tsx` | Plumb `focusedIndex`/`handleSelect` from new hook; add `filterHandlers` with search focus preservation |
| `frontend/src/pages/accounting/components/OwnerEquityContextHeader.tsx` | Two-column Grid layout; add JE ref link via `useJournalEntryRefs`; move action buttons to header bar |
| `frontend/src/pages/accounting/components/OwnerEquityWorkspaceCard.tsx` | Trim to audit metadata (description, createdAt, updatedAt); payment method moves to header |
| `frontend/src/pages/accounting/__tests__/OwnerEquityPage.test.tsx` | Add `useNavigate`/`useLocation` mocks; add keyboard navigation test; add `useLazyGetJournalEntriesQuery` mock |

---

## Task 1: Rewrite `OwnerEquityTable.tsx` as an `EntityTable` wrapper

**Files:**
- Modify: `frontend/src/pages/accounting/components/OwnerEquityTable.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import type React from 'react'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import type { OwnerEquityTransaction } from '@/types'

const COLUMNS: ColumnConfig<OwnerEquityTransaction>[] = [
  { key: 'referenceNumber', render: (t) => t.referenceNumber },
]

interface Props {
  transactions: OwnerEquityTransaction[]
  loading: boolean
  total: number
  selectedId: string | null
  focusedIndex: number
  onSelect: (item: OwnerEquityTransaction) => void
  listRef: React.RefObject<HTMLDivElement | null>
}

export function OwnerEquityTable({ transactions, loading, total, selectedId, focusedIndex, onSelect, listRef }: Props) {
  return (
    <EntityTable
      rows={transactions}
      columns={COLUMNS}
      loading={loading}
      total={total}
      label="Owner Equity"
      selectedId={selectedId ?? undefined}
      focusedIndex={focusedIndex}
      onSelect={onSelect}
      listRef={listRef}
      dataAttr="owner-equity"
    />
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "owner"
```

Expected: no errors mentioning `OwnerEquityTable`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/components/OwnerEquityTable.tsx
git commit -m "refactor(owner-equity): migrate OwnerEquityTable to EntityTable wrapper"
```

---

## Task 2: Rewrite `useOwnerEquityWorkspace.ts` to use `useEntityWorkspace`

**Files:**
- Modify: `frontend/src/pages/accounting/hooks/useOwnerEquityWorkspace.ts`

The old hook owned selection via `useState<OwnerEquityTransaction | null>`. The new hook delegates selection, focus tracking, and keyboard shortcuts to `useEntityWorkspace`, then layers post/delete/reverse/dialog state on top — the same pattern used by `useExpensesWorkspace` and `useSettlementsWorkspace`.

Note: `useEntityWorkspace` requires `routes.create` and `routes.edit` even though Owner Equity doesn't navigate to dedicated create/edit pages (it uses dialogs). Pass no-op routes identical to the Settlements pattern.

- [ ] **Step 1: Replace the file contents**

```ts
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import {
  useDeleteOwnerEquityTransactionMutation,
  usePostOwnerEquityTransactionMutation,
  useReverseOwnerEquityTransactionMutation,
} from '@/store/api/accountingApi'
import type { OwnerEquityTransaction } from '@/types'

export function useOwnerEquityWorkspace(entities: OwnerEquityTransaction[], refetch: () => void) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()

  const [selected, setSelected] = useState<OwnerEquityTransaction | null>(null)
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
    selectEntity: setSelected,
    refetch,
    navigate,
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
      setSelected(null)
      setPostTarget(null)
      setDeleteTarget(null)
      setReverseTarget(null)
    },
  })

  const handlePost = useCallback(async () => {
    if (!postTarget) return
    try {
      const next = await postOwnerEquityTransaction(postTarget.id).unwrap()
      setSelected(next)
      setPostTarget(null)
      showSuccess('Transaction posted')
      refetch()
    } catch (error: any) {
      showError(error?.data?.message || String(error))
    }
  }, [postOwnerEquityTransaction, postTarget, refetch, showError, showSuccess])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await deleteOwnerEquityTransaction(deleteTarget.id).unwrap()
      showSuccess('Transaction deleted')
      if (selected?.id === deleteTarget.id) setSelected(null)
      setDeleteTarget(null)
      refetch()
    } catch (error: any) {
      showError(error?.data?.message || String(error))
    }
  }, [deleteOwnerEquityTransaction, deleteTarget, refetch, selected?.id, showError, showSuccess])

  const handleReverse = useCallback(async () => {
    if (!reverseTarget) return
    try {
      const next = await reverseOwnerEquityTransaction(reverseTarget.id).unwrap()
      setSelected(next)
      setReverseTarget(null)
      showSuccess('Transaction reversed')
      refetch()
    } catch (error: any) {
      showError(error?.data?.message || String(error))
    }
  }, [refetch, reverseOwnerEquityTransaction, reverseTarget, showError, showSuccess])

  return {
    ...workspace,
    selected,
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

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "owner"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/hooks/useOwnerEquityWorkspace.ts
git commit -m "refactor(owner-equity): delegate useOwnerEquityWorkspace to useEntityWorkspace"
```

---

## Task 3: Update `OwnerEquityPage.tsx` — new hook signature, filterHandlers, focusedIndex

**Files:**
- Modify: `frontend/src/pages/accounting/OwnerEquityPage.tsx`

The hook signature changed: `useOwnerEquityWorkspace` now takes `(entities, refetch)` instead of `(refetch)`. The `OwnerEquityTable` props changed: remove `onEdit`/`onPost`/`onDelete`/`onReverse` (those move to the context header); add `focusedIndex` and rename `onSelect` to use `workspace.handleSelect`. Add `filterHandlers` for search focus preservation.

- [ ] **Step 1: Replace the file contents**

```tsx
import React, { useMemo, useState } from 'react'

import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import {
  useCreateOwnerEquityTransactionMutation,
  useGetOwnerEquityTransactionsQuery,
  useGetPaymentMethodsQuery,
  useUpdateOwnerEquityTransactionMutation,
} from '@/store/api/accountingApi'
import type { OwnerEquityTransaction, PaymentMethodConfig } from '@/types'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'

import { OwnerEquityContextHeader } from './components/OwnerEquityContextHeader'
import { OwnerEquityDialogs } from './components/OwnerEquityDialogs'
import { OwnerEquityTable } from './components/OwnerEquityTable'
import { OwnerEquityWorkspaceCard } from './components/OwnerEquityWorkspaceCard'
import { useOwnerEquityWorkspace } from './hooks/useOwnerEquityWorkspace'

type FormState = {
  id?: string
  transactionDate: string
  type: 'capital_injection' | 'owner_drawing'
  amount: string
  paymentMethodId: string
  description: string
}

interface OwnerEquityFilters {
  search: string
  type: string | null
  status: string | null
  period: PeriodValue
}

const filterConfig: FilterBarConfig<OwnerEquityFilters> = {
  search: { placeholder: 'Search owner equity...' },
  fields: [
    { field: 'period', label: 'Period', type: 'period' },
    { field: 'type', label: 'Type', type: 'owner-equity-type' },
    { field: 'status', label: 'Status', type: 'expense-status' },
  ],
  defaults: { search: '', type: null, status: null, period: { key: null, from: null, to: null } },
}

const defaultForm = (): FormState => ({
  transactionDate: new Date().toISOString().slice(0, 10),
  type: 'capital_injection',
  amount: '',
  paymentMethodId: '',
  description: '',
})

const OwnerEquityPage: React.FC = () => {
  const [form, setForm] = useState<FormState>(defaultForm())
  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)
  const weekStartsOn = getStartOfWeek()
  const dateRange = useMemo(() => {
    const period = appliedFilters.period
    if (!period || period.key === null) return { fromDate: undefined, toDate: undefined }
    if (period.key === 'custom') return { fromDate: period.from ?? undefined, toDate: period.to ?? undefined }
    const resolved = getPeriodDateRange(period.key, weekStartsOn)
    return { fromDate: resolved.from, toDate: resolved.to }
  }, [appliedFilters.period, weekStartsOn])

  const { data: ownerEquityResponse, isLoading, refetch } = useGetOwnerEquityTransactionsQuery({
    page: 1,
    sortBy: 'referenceNumber',
    sortOrder: 'DESC',
    type: appliedFilters.type || undefined,
    status: appliedFilters.status || undefined,
    startDate: dateRange.fromDate,
    endDate: dateRange.toDate,
  })
  const { data: paymentMethodsResponse } = useGetPaymentMethodsQuery({ page: 1, isActive: true })
  const paymentMethods = (paymentMethodsResponse?.data ?? []) as PaymentMethodConfig[]

  const [createOwnerEquityTransaction] = useCreateOwnerEquityTransactionMutation()
  const [updateOwnerEquityTransaction] = useUpdateOwnerEquityTransactionMutation()

  const rows = useMemo(() => {
    const items = ownerEquityResponse?.data ?? []
    const term = appliedFilters.search.trim().toLowerCase()
    if (!term) return items
    return items.filter((item) =>
      [item.referenceNumber, item.description, item.paymentMethod?.name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term),
    )
  }, [appliedFilters.search, ownerEquityResponse?.data])

  const workspace = useOwnerEquityWorkspace(rows, () => { void refetch() })

  const filterHandlers = useMemo(() => ({
    ...handlers,
    onSearchChange: (value: string) => {
      handlers.onSearchChange(value)
      workspace.setShouldPreserveSearchFocus(true)
    },
  }), [handlers, workspace])

  const openCreate = () => {
    setForm({ ...defaultForm(), paymentMethodId: paymentMethods[0]?.id || '' })
    workspace.setDialogOpen(true)
  }

  const openEdit = (row: OwnerEquityTransaction) => {
    setForm({
      id: row.id,
      transactionDate: row.transactionDate.slice(0, 10),
      type: row.type,
      amount: String(row.amount),
      paymentMethodId: row.paymentMethodId,
      description: row.description || '',
    })
    workspace.setDialogOpen(true)
  }

  const closeDialog = () => {
    workspace.setDialogOpen(false)
    setForm(defaultForm())
  }

  const save = async () => {
    if (!form.paymentMethodId || !form.amount || Number(form.amount) <= 0) return
    const payload = {
      transactionDate: form.transactionDate,
      type: form.type,
      amount: Number(form.amount),
      paymentMethodId: form.paymentMethodId,
      description: form.description || undefined,
    }
    if (form.id) await updateOwnerEquityTransaction({ id: form.id, data: payload }).unwrap()
    else await createOwnerEquityTransaction(payload).unwrap()
    closeDialog()
    void refetch()
  }

  return (
    <GenericListPage
      title="Owner Equity"
      subtitle="Track owner contributions and equity transactions"
      primaryAction={{ label: 'New Transaction', onClick: openCreate }}
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={filterHandlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={workspace.searchInputRef}
      sort={{ field: 'referenceNumber', sortBy: 'referenceNumber', sortOrder: 'desc', onSort: () => {} }}
      listSlot={(
        <OwnerEquityTable
          transactions={rows}
          loading={isLoading}
          total={rows.length}
          selectedId={workspace.selected?.id ?? null}
          focusedIndex={workspace.focusedIndex}
          onSelect={workspace.handleSelect}
          listRef={workspace.listRef}
        />
      )}
      headerSlot={(
        <OwnerEquityContextHeader
          selected={workspace.selected}
          onEdit={() => workspace.selected && openEdit(workspace.selected)}
          onPost={() => workspace.selected && workspace.setPostTarget(workspace.selected)}
          onDelete={() => workspace.selected && workspace.setDeleteTarget(workspace.selected)}
          onReverse={() => workspace.selected && workspace.setReverseTarget(workspace.selected)}
        />
      )}
      workspaceSlot={<OwnerEquityWorkspaceCard selected={workspace.selected} />}
      dialogs={(
        <OwnerEquityDialogs
          dialogOpen={workspace.dialogOpen}
          form={form}
          paymentMethods={paymentMethods}
          onCloseDialog={closeDialog}
          onFormChange={(field, value) => setForm((current) => ({ ...current, [field]: value }))}
          onSave={() => void save()}
          reverseTarget={workspace.reverseTarget}
          deleteTarget={workspace.deleteTarget}
          postTarget={workspace.postTarget}
          onCancelReverse={() => workspace.setReverseTarget(null)}
          onCancelDelete={() => workspace.setDeleteTarget(null)}
          onCancelPost={() => workspace.setPostTarget(null)}
          onConfirmReverse={() => void workspace.handleReverse()}
          onConfirmDelete={() => void workspace.handleDelete()}
          onConfirmPost={() => void workspace.handlePost()}
        />
      )}
    />
  )
}

export default OwnerEquityPage
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "owner"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/OwnerEquityPage.tsx
git commit -m "refactor(owner-equity): wire focusedIndex, handleSelect, and filterHandlers in OwnerEquityPage"
```

---

## Task 4: Rewrite `OwnerEquityContextHeader.tsx` with two-column Grid layout and JE ref link

**Files:**
- Modify: `frontend/src/pages/accounting/components/OwnerEquityContextHeader.tsx`

This is the most significant change. The existing component has a flat `EntityContextHeaderBar` + single-row table. Replace with the two-column Grid pattern from `SettlementContextHeader`. Add `useJournalEntryRefs` to fetch the linked journal entry's reference number and navigate to it.

`useJournalEntryRefs` takes an array of `{ sourceType, sourceId }` objects. For Owner Equity the source type string is `'owner_equity_transaction'` (confirmed from `JournalEntryContextHeader.tsx`'s `ENTRY_TYPE_LABELS` and `SOURCE_ROUTES` maps). Pass `selected?.id` as `sourceId` — it resolves to `undefined` when nothing is selected, and `useJournalEntryRefs` skips the fetch for undefined sources.

- [ ] **Step 1: Replace the file contents**

```tsx
import { Chip, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableRow, Typography } from '@mui/material'
import Grid from '@mui/material/Grid'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'
import { default as PostIcon } from '@mui/icons-material/PostAdd'
import { default as UndoIcon } from '@mui/icons-material/Undo'

import { AppButton } from '@/components/common/AppButton'
import { EntityContextHeaderBar } from '@/components/common/EntityContextHeaderBar'
import { EntityStatusChip } from '@/components/common/EntityStatusChip'
import { useJournalEntryRefs } from '@/hooks/useJournalEntryRefs'
import { TABLE_STYLES } from '@/constants/tableStyles'
import type { OwnerEquityTransaction } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface Props {
  selected: OwnerEquityTransaction | null
  onEdit: () => void
  onPost: () => void
  onDelete: () => void
  onReverse: () => void
}

const typeLabel: Record<OwnerEquityTransaction['type'], string> = {
  capital_injection: 'Capital Injection',
  owner_drawing: 'Owner Drawing',
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

export function OwnerEquityContextHeader({ selected, onEdit, onPost, onDelete, onReverse }: Props) {
  const { journalEntryRefs, navigateToJournalEntries } = useJournalEntryRefs([
    { sourceType: 'owner_equity_transaction', sourceId: selected?.id },
  ])

  if (!selected) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
          Select a transaction to view details
        </Typography>
      </Paper>
    )
  }

  const jeRef = journalEntryRefs[0]

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <EntityContextHeaderBar
        title={selected.referenceNumber}
        statusChip={(
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Chip
              size="small"
              label={typeLabel[selected.type]}
              color={selected.type === 'capital_injection' ? 'primary' : 'warning'}
            />
            <EntityStatusChip status={selected.status} />
          </Stack>
        )}
        actions={(
          <Stack direction="row" spacing={0.5}>
            {selected.status === 'draft' && (
              <>
                <AppButton size="small" variant="outlined" startIcon={<EditIcon />} onClick={onEdit}>
                  Edit
                </AppButton>
                <AppButton size="small" variant="success" startIcon={<PostIcon />} onClick={onPost}>
                  Post
                </AppButton>
                <AppButton size="small" variant="danger" startIcon={<DeleteIcon />} onClick={onDelete}>
                  Delete
                </AppButton>
              </>
            )}
            {selected.status === 'posted' && (
              <AppButton size="small" variant="warning" startIcon={<UndoIcon />} onClick={onReverse}>
                Reverse
              </AppButton>
            )}
          </Stack>
        )}
      />
      <Grid container spacing={3} sx={{ p: TABLE_STYLES.cell.padding.px }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <TableContainer>
            <Table size={TABLE_STYLES.size} sx={detailTableSx}>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={2} sx={sectionHeaderCellSx}>
                    <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                      Transaction Information
                    </Typography>
                  </TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Date</TableCell>
                  <TableCell sx={valueCellSx}>{formatDate(selected.transactionDate)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={labelCellSx}>Type</TableCell>
                  <TableCell sx={valueCellSx}>{typeLabel[selected.type]}</TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Description</TableCell>
                  <TableCell sx={valueCellSx}>{selected.description || '—'}</TableCell>
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
                      Financials & Links
                    </Typography>
                  </TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Amount</TableCell>
                  <TableCell sx={valueCellSx}>{formatCurrency(Number(selected.amount || 0))}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={labelCellSx}>Payment Method</TableCell>
                  <TableCell sx={valueCellSx}>{selected.paymentMethod?.name || '—'}</TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Journal Entry</TableCell>
                  <TableCell sx={valueCellSx}>
                    {jeRef ? (
                      <Typography
                        component="button"
                        onClick={navigateToJournalEntries}
                        sx={{
                          fontSize: '0.8rem',
                          color: 'primary.main',
                          cursor: 'pointer',
                          textDecoration: 'none',
                          border: 'none',
                          background: 'none',
                          padding: 0,
                        }}
                      >
                        {jeRef.referenceNumber}
                      </Typography>
                    ) : '—'}
                  </TableCell>
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
cd frontend && npm run type-check 2>&1 | grep -i "owner"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/components/OwnerEquityContextHeader.tsx
git commit -m "refactor(owner-equity): two-column Grid layout and useJournalEntryRefs in OwnerEquityContextHeader"
```

---

## Task 5: Trim `OwnerEquityWorkspaceCard.tsx` to audit metadata only

**Files:**
- Modify: `frontend/src/pages/accounting/components/OwnerEquityWorkspaceCard.tsx`

Payment method and description now appear in the context header. The workspace card becomes the audit/supplementary panel. Show Description (full text for overflow), Created, and Updated — consistent with how `JournalEntryWorkspaceCard` uses its space for supplementary data.

- [ ] **Step 1: Replace the file contents**

```tsx
import { Box, Paper, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { OwnerEquityTransaction } from '@/types'
import { formatDate } from '@/utils/formatters'

interface Props { selected: OwnerEquityTransaction | null }

const cellSx = { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px }
const labelCellSx = { ...cellSx, color: 'text.secondary', width: '35%', fontSize: '0.8rem' }
const valueCellSx = { ...cellSx, fontSize: '0.8rem' }
const sectionHeaderCellSx = {
  pb: TABLE_STYLES.cell.padding.py * 0.67,
  py: TABLE_STYLES.cell.padding.py * 0.67,
  borderTop: TABLE_STYLES.cell.border,
}

export function OwnerEquityWorkspaceCard({ selected }: Props) {
  if (!selected) return <Paper sx={{ flex: 1 }} />
  return (
    <Paper sx={{ flex: 1 }}>
      <Box sx={{ px: 2, py: 1, borderBottom: TABLE_STYLES.cell.border }}>
        <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Details
        </Typography>
      </Box>
      <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': cellSx }}>
        <TableBody>
          <TableRow>
            <TableCell colSpan={2} sx={sectionHeaderCellSx}>
              <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                Audit Info
              </Typography>
            </TableCell>
          </TableRow>
          <TableRow sx={{ backgroundColor: 'grey.50' }}>
            <TableCell sx={labelCellSx}>Created</TableCell>
            <TableCell sx={valueCellSx}>{formatDate(selected.createdAt)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell sx={labelCellSx}>Updated</TableCell>
            <TableCell sx={valueCellSx}>{formatDate(selected.updatedAt)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Paper>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "owner"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/components/OwnerEquityWorkspaceCard.tsx
git commit -m "refactor(owner-equity): trim OwnerEquityWorkspaceCard to audit metadata"
```

---

## Task 6: Update `OwnerEquityPage.test.tsx` — mocks, keyboard navigation test

**Files:**
- Modify: `frontend/src/pages/accounting/__tests__/OwnerEquityPage.test.tsx`

`useEntityWorkspace` (called inside `useOwnerEquityWorkspace`) needs `useNavigate` and `useLocation`. Also `useJournalEntryRefs` (called inside `OwnerEquityContextHeader`) calls `useLazyGetJournalEntriesQuery` from `accountingApi` — that must be mocked.

The keyboard navigation test fires `keydown` events on the document and verifies the focused item changes. `useEntityWorkspace` uses `useKeyboardShortcuts` which binds to `document` — so `fireEvent.keyDown(document, { key: 'ArrowDown' })` triggers it.

- [ ] **Step 1: Replace the file contents**

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'

import OwnerEquityPage from '../OwnerEquityPage'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ search: '', pathname: '/accounting/owner-equity', state: null }),
  }
})

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))
vi.mock('@/utils/dateRange', () => ({
  getPeriodDateRange: () => ({ from: undefined, to: undefined }),
  getStartOfWeek: () => 0,
}))
vi.mock('@/utils/formatters', async () => {
  const actual = await vi.importActual<typeof import('@/utils/formatters')>('@/utils/formatters')
  return { ...actual, formatDate: (value: string) => value, formatCurrency: (value: number) => `$${value}` }
})

const mockedApi = vi.hoisted(() => ({
  useGetOwnerEquityTransactionsQuery: vi.fn(),
  useGetPaymentMethodsQuery: vi.fn(),
  useCreateOwnerEquityTransactionMutation: vi.fn(),
  useUpdateOwnerEquityTransactionMutation: vi.fn(),
  useDeleteOwnerEquityTransactionMutation: vi.fn(),
  usePostOwnerEquityTransactionMutation: vi.fn(),
  useReverseOwnerEquityTransactionMutation: vi.fn(),
  useLazyGetJournalEntriesQuery: vi.fn(),
}))

vi.mock('@/store/api/accountingApi', () => mockedApi)

const TX_1 = {
  id: 'tx-1',
  referenceNumber: 'EQ-001',
  transactionDate: '2026-02-15',
  type: 'capital_injection' as const,
  amount: 500,
  paymentMethodId: 'pm-1',
  paymentMethod: { id: 'pm-1', code: 'CASH', name: 'Cash' },
  description: 'Initial owner capital',
  status: 'draft' as const,
  createdAt: '2026-02-15',
  updatedAt: '2026-02-15',
}

const TX_2 = {
  id: 'tx-2',
  referenceNumber: 'EQ-002',
  transactionDate: '2026-03-01',
  type: 'owner_drawing' as const,
  amount: 200,
  paymentMethodId: 'pm-1',
  paymentMethod: { id: 'pm-1', code: 'CASH', name: 'Cash' },
  description: 'Owner withdrawal',
  status: 'draft' as const,
  createdAt: '2026-03-01',
  updatedAt: '2026-03-01',
}

describe('OwnerEquityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.useGetOwnerEquityTransactionsQuery.mockReturnValue({
      data: { data: [TX_1, TX_2] },
      isLoading: false,
      refetch: vi.fn(),
    })
    mockedApi.useGetPaymentMethodsQuery.mockReturnValue({
      data: { data: [{ id: 'pm-1', code: 'CASH', name: 'Cash', isActive: true }] },
    })
    mockedApi.useCreateOwnerEquityTransactionMutation.mockReturnValue([vi.fn()])
    mockedApi.useUpdateOwnerEquityTransactionMutation.mockReturnValue([vi.fn()])
    mockedApi.useDeleteOwnerEquityTransactionMutation.mockReturnValue([vi.fn()])
    mockedApi.usePostOwnerEquityTransactionMutation.mockReturnValue([vi.fn()])
    mockedApi.useReverseOwnerEquityTransactionMutation.mockReturnValue([vi.fn()])
    mockedApi.useLazyGetJournalEntriesQuery.mockReturnValue([
      vi.fn().mockReturnValue({ unwrap: () => Promise.resolve({ data: [] }) }),
    ])
  })

  it('renders title and transaction rows', () => {
    render(<BrowserRouter><OwnerEquityPage /></BrowserRouter>)
    expect(screen.getByText('Owner Equity')).toBeInTheDocument()
    expect(screen.getByText('EQ-001')).toBeInTheDocument()
    expect(screen.getByText('EQ-002')).toBeInTheDocument()
  })

  it('shows detail content after clicking a row', () => {
    render(<BrowserRouter><OwnerEquityPage /></BrowserRouter>)
    fireEvent.click(screen.getByText('EQ-001'))
    expect(screen.getByText('Initial owner capital')).toBeInTheDocument()
  })

  it('navigates the list with keyboard arrow keys', () => {
    render(<BrowserRouter><OwnerEquityPage /></BrowserRouter>)
    // First item is auto-selected on load
    expect(screen.getByText('EQ-001')).toBeInTheDocument()
    // ArrowDown moves focus to second item
    fireEvent.keyDown(document, { key: 'ArrowDown' })
    expect(screen.getByText('Owner withdrawal')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/OwnerEquityPage.test.tsx
```

Expected: 3 tests pass, 0 fail.

- [ ] **Step 3: If the keyboard test fails — common causes**

- `useLazyGetJournalEntriesQuery` mock not returning the right shape: the mock must return `[fetchFn]` where `fetchFn` returns a promise that resolves to `{ data: [] }`. The mock above uses `vi.fn().mockResolvedValue({ data: [] })` — if `useJournalEntryRefs` calls `.unwrap()` on the result, change to `vi.fn().mockReturnValue({ unwrap: () => Promise.resolve({ data: [] }) })`.
- The keyboard test asserts `'Owner withdrawal'` is visible — this text appears in the context header's Description field when TX_2 is selected. If the test can't find it, check that `OwnerEquityContextHeader` renders description in the left-column table.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/accounting/__tests__/OwnerEquityPage.test.tsx
git commit -m "test(owner-equity): add useNavigate mock, useLazyGetJournalEntriesQuery mock, and keyboard nav test"
```

---

## Task 7: Full type-check, final test run, and PR

**Files:** None modified.

- [ ] **Step 1: Full frontend type-check**

```bash
cd frontend && npm run type-check
```

Expected: exit 0, no errors.

- [ ] **Step 2: Run only the owner equity test to confirm clean**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/OwnerEquityPage.test.tsx
```

Expected: 3 passed, 0 failed.

- [ ] **Step 3: Create PR**

```bash
gh pr create \
  --title "refactor(owner-equity): gold standard UI/UX refactor (#519)" \
  --body "$(cat <<'EOF'
## Summary
- Replaces manual 6-column `OwnerEquityTable` with `EntityTable` wrapper (single reference number column)
- Rewrites `useOwnerEquityWorkspace` to delegate to `useEntityWorkspace` — adds keyboard navigation (Up/Down/PgUp/PgDn/Home/End/Escape/Enter), auto-select, and search focus preservation
- Updates `OwnerEquityPage` with new hook signature, `filterHandlers` for search focus preservation, and `focusedIndex` plumbing
- Refactors `OwnerEquityContextHeader` to two-column MUI Grid layout (Transaction Information / Financials & Links) with `useJournalEntryRefs` for a navigable journal entry reference number link
- Trims `OwnerEquityWorkspaceCard` to audit metadata (Created/Updated); payment method and description move to the context header

Closes #519

## Test plan
- [ ] `npx vitest run src/pages/accounting/__tests__/OwnerEquityPage.test.tsx` — 3 tests pass
- [ ] `npm run type-check` — exit 0
- [ ] Manual: keyboard Up/Down navigates the list; clicking a posted transaction shows JE ref link; clicking JE link navigates to Journal Entries page

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
