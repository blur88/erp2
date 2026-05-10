# Expenses Page UI/UX Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Expenses page to match the Gold Standard master-detail layout used by Sales Orders, Purchase Orders, and Journal Entries — narrow entity list on the left, rich detail panel on the right, extracted form dialog, keyboard navigation, and polished context header with journal entry ref.

**Architecture:** Replace the wide table with a narrow `EntityTable` (reference + status chip only), wire `useExpensesWorkspace` into `useEntityWorkspace` for keyboard navigation + `focusedIndex`, extract the inline form into `ExpenseFormDialog`, and upgrade `ExpenseContextHeader` to a two-column Grid layout with a Journal Entry ref link for posted expenses.

**Tech Stack:** React 19, TypeScript, MUI v7, RTK Query (`useGetExpensesQuery`, `useCreateExpenseMutation`, `useUpdateExpenseMutation`), `useEntityWorkspace`, `EntityTable`, `EntityContextHeaderBar`, Vitest + Testing Library.

---

## File Map

| Action | File |
|--------|------|
| Modify | `frontend/src/pages/accounting/hooks/useExpensesWorkspace.ts` |
| Modify | `frontend/src/pages/accounting/components/ExpensesTable.tsx` |
| Create | `frontend/src/pages/accounting/components/ExpenseFormDialog.tsx` |
| Modify | `frontend/src/pages/accounting/components/ExpenseContextHeader.tsx` |
| Modify | `frontend/src/pages/accounting/components/ExpenseWorkspaceCard.tsx` *(minor)* |
| Modify | `frontend/src/pages/accounting/ExpensesPage.tsx` |
| Modify | `frontend/src/pages/accounting/__tests__/ExpensesPage.test.tsx` |
| Create | `frontend/src/pages/accounting/components/__tests__/ExpenseFormDialog.test.tsx` |
| Create | `frontend/src/pages/accounting/components/__tests__/ExpenseContextHeader.test.tsx` |

---

## Task 1: Upgrade `useExpensesWorkspace` to use `useEntityWorkspace`

Wire `useEntityWorkspace` into the hook for keyboard navigation, `focusedIndex`, auto-selection, and standard selection logic. Keep the bulk-action state (`selectedIds`, `bulkPostOpen`, `bulkDeleteOpen`) and the Post/Delete action handlers from the current implementation.

**Files:**
- Modify: `frontend/src/pages/accounting/hooks/useExpensesWorkspace.ts`

- [ ] **Step 1: Replace the hook body**

Replace the entire file content with:

```typescript
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import {
  useBulkDeleteExpensesMutation,
  useBulkPostExpensesMutation,
  useDeleteExpenseMutation,
  usePostExpenseMutation,
} from '@/store/api/accountingApi'
import type { ExpenseRecord } from '@/types'
import { getErrorMessage } from '@/utils/errorMessage'

export function useExpensesWorkspace(refetch: () => void) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const [selected, setSelected] = useState<ExpenseRecord | null>(null)
  const [postTarget, setPostTarget] = useState<ExpenseRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ExpenseRecord | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkPostOpen, setBulkPostOpen] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ExpenseRecord | null>(null)

  const [postExpense] = usePostExpenseMutation()
  const [deleteExpense] = useDeleteExpenseMutation()
  const [bulkPost] = useBulkPostExpensesMutation()
  const [bulkDelete] = useBulkDeleteExpensesMutation()

  const workspace = useEntityWorkspace<ExpenseRecord>({
    entities: [],
    selectedEntity: selected,
    selectEntity: setSelected,
    refetch,
    navigate,
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
      setSelected(null)
      setPostTarget(null)
      setDeleteTarget(null)
    },
  })

  const handleSelect = useCallback((item: ExpenseRecord) => {
    workspace.handleSelect(item)
    setSelected(item)
  }, [workspace])

  const handleToggleCheck = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleSelectAll = useCallback((expenses: ExpenseRecord[]) => {
    const drafts = expenses.filter((e) => e.status === 'draft').map((e) => e.id)
    setSelectedIds((prev) => (prev.size === drafts.length ? new Set() : new Set(drafts)))
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
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to post expense'))
    } finally {
      setActionLoading(false)
    }
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
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to delete expense'))
    } finally {
      setActionLoading(false)
    }
  }, [deleteTarget, deleteExpense, showSuccess, showError, refetch])

  const handleBulkPost = useCallback(async () => {
    setActionLoading(true)
    try {
      const result = await bulkPost(Array.from(selectedIds)).unwrap()
      showSuccess(`Posted ${result.posted} expenses`)
      if (result.failed > 0) showError(`${result.failed} failed`)
      setSelectedIds(new Set())
      setBulkPostOpen(false)
      refetch()
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'Bulk post failed'))
    } finally {
      setActionLoading(false)
    }
  }, [selectedIds, bulkPost, showSuccess, showError, refetch])

  const handleBulkDelete = useCallback(async () => {
    setActionLoading(true)
    try {
      const result = await bulkDelete(Array.from(selectedIds)).unwrap()
      showSuccess(`Deleted ${result.deleted} expenses`)
      if (result.failed > 0) showError(`${result.failed} failed`)
      setSelectedIds(new Set())
      setBulkDeleteOpen(false)
      refetch()
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'Bulk delete failed'))
    } finally {
      setActionLoading(false)
    }
  }, [selectedIds, bulkDelete, showSuccess, showError, refetch])

  return {
    selected,
    setSelected,
    focusedIndex: workspace.focusedIndex,
    setFocusedIndex: workspace.setFocusedIndex,
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
    selectedIds,
    bulkPostOpen,
    setBulkPostOpen,
    bulkDeleteOpen,
    setBulkDeleteOpen,
    actionLoading,
    handleSelect,
    handleToggleCheck,
    handleSelectAll,
    handleConfirmPost,
    handleConfirmDelete,
    handleBulkPost,
    handleBulkDelete,
  }
}
```

> **Note:** `useEntityWorkspace` is instantiated with an empty `entities` array because the Expenses workspace uses local React state for selection rather than Redux — the keyboard navigation handlers (`handleNavigateUp`, `handleNavigateDown` etc.) come from the workspace but we override `handleSelect`. We only use `useEntityWorkspace` for its keyboard shortcut wiring, `focusedIndex`, `listRef`, and `searchInputRef`.

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "useExpensesWorkspace|ExpensesPage" | head -20
```

Expected: no errors related to `useExpensesWorkspace`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/hooks/useExpensesWorkspace.ts
git commit -m "refactor(expenses): wire useEntityWorkspace into useExpensesWorkspace for keyboard nav"
```

---

## Task 2: Refactor `ExpensesTable` to use `EntityTable`

Replace the wide 8-column table with a narrow `EntityTable` showing only Reference Number and a status chip. This is the master list view — detail goes in the header/workspace panel.

**Files:**
- Modify: `frontend/src/pages/accounting/components/ExpensesTable.tsx`

- [ ] **Step 1: Replace the file content**

```typescript
import { Chip } from '@mui/material'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import type { ExpenseRecord } from '@/types'

interface Props {
  expenses: ExpenseRecord[]
  loading: boolean
  selectedId: string | null
  focusedIndex: number
  onSelect: (item: ExpenseRecord) => void
  listRef: React.RefObject<HTMLDivElement | null>
}

function statusColor(status: string) {
  return status === 'posted' ? 'success' as const : 'default' as const
}

const columns: ColumnConfig<ExpenseRecord>[] = [
  {
    key: 'reference',
    render: (row) => row.referenceNumber,
    width: '60%',
  },
  {
    key: 'status',
    raw: true,
    render: (row) => (
      <Chip label={row.status} color={statusColor(row.status)} size="small" />
    ),
    width: '40%',
  },
]

export function ExpensesTable({ expenses, loading, selectedId, focusedIndex, onSelect, listRef }: Props) {
  return (
    <EntityTable
      rows={expenses}
      columns={columns}
      loading={loading}
      total={expenses.length}
      label="Expenses"
      selectedId={selectedId ?? undefined}
      focusedIndex={focusedIndex}
      onSelect={onSelect}
      listRef={listRef}
    />
  )
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "ExpensesTable" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/components/ExpensesTable.tsx
git commit -m "refactor(expenses): replace wide table with narrow EntityTable master view"
```

---

## Task 3: Create `ExpenseFormDialog`

Extract the inline form (currently in `ExpensesPage.tsx`) into its own component. It handles both New and Edit modes.

**Files:**
- Create: `frontend/src/pages/accounting/components/ExpenseFormDialog.tsx`

- [ ] **Step 1: Create the file**

```typescript
import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from '@mui/material'

import { AppButton } from '@/components/common/AppButton'
import {
  useCreateExpenseMutation,
  useGetChartOfAccountsQuery,
  useGetPaymentMethodsQuery,
  useUpdateExpenseMutation,
} from '@/store/api/accountingApi'
import type { ChartOfAccount, ExpenseRecord } from '@/types'

interface Props {
  open: boolean
  editTarget: ExpenseRecord | null
  onClose: () => void
  onSaved: () => void
}

type FormState = {
  expenseDate: string
  expenseAccountId: string
  amount: string
  paymentMethodId: string
  vendor: string
  description: string
}

function defaultForm(): FormState {
  return {
    expenseDate: new Date().toISOString().slice(0, 10),
    expenseAccountId: '',
    amount: '',
    paymentMethodId: '',
    vendor: '',
    description: '',
  }
}

export function ExpenseFormDialog({ open, editTarget, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(defaultForm())

  const { data: paymentMethodsResponse } = useGetPaymentMethodsQuery({ page: 1, isActive: true })
  const paymentMethods = paymentMethodsResponse?.data ?? []
  const { data: expenseAccountsResponse } = useGetChartOfAccountsQuery({ page: 1, type: 'EXPENSE', isActive: true })
  const expenseAccounts = (expenseAccountsResponse?.data ?? []) as ChartOfAccount[]

  const [createExpense] = useCreateExpenseMutation()
  const [updateExpense] = useUpdateExpenseMutation()

  useEffect(() => {
    if (!open) return
    if (editTarget) {
      setForm({
        expenseDate: String(editTarget.expenseDate).slice(0, 10),
        expenseAccountId: editTarget.expenseAccountId,
        amount: String(editTarget.amount),
        paymentMethodId: editTarget.paymentMethodId,
        vendor: editTarget.vendor ?? '',
        description: editTarget.description ?? '',
      })
    } else {
      setForm({
        ...defaultForm(),
        expenseAccountId: expenseAccounts[0]?.id ?? '',
        paymentMethodId: paymentMethods[0]?.id ?? '',
      })
    }
  }, [open, editTarget]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!form.expenseAccountId || !form.paymentMethodId || !form.amount || Number(form.amount) <= 0) {
      return
    }
    const payload = {
      expenseDate: form.expenseDate,
      expenseAccountId: form.expenseAccountId,
      amount: Number(form.amount),
      paymentMethodId: form.paymentMethodId,
      vendor: form.vendor || undefined,
      description: form.description || undefined,
    }
    if (editTarget) {
      await updateExpense({ id: editTarget.id, data: payload }).unwrap()
    } else {
      await createExpense(payload).unwrap()
    }
    onSaved()
    onClose()
  }

  const set = (field: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement | { value: unknown }>) =>
    setForm((current) => ({ ...current, [field]: event.target.value as string }))

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{editTarget ? 'Edit Expense' : 'New Expense'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Date"
            type="date"
            size="small"
            value={form.expenseDate}
            onChange={set('expenseDate')}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <FormControl fullWidth size="small">
            <InputLabel>Expense Account</InputLabel>
            <Select value={form.expenseAccountId} label="Expense Account" onChange={(e) => setForm((c) => ({ ...c, expenseAccountId: e.target.value }))}>
              {expenseAccounts.map((account) => (
                <MenuItem key={account.id} value={account.id}>{account.code} - {account.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField label="Amount" size="small" type="number" value={form.amount} onChange={set('amount')} />
          <FormControl fullWidth size="small">
            <InputLabel>Payment Method</InputLabel>
            <Select value={form.paymentMethodId} label="Payment Method" onChange={(e) => setForm((c) => ({ ...c, paymentMethodId: e.target.value }))}>
              {paymentMethods.map((pm) => (
                <MenuItem key={pm.id} value={pm.id}>{pm.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField label="Vendor" value={form.vendor} onChange={set('vendor')} />
          <TextField label="Description" multiline minRows={2} value={form.description} onChange={set('description')} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <AppButton variant="outlined" onClick={onClose}>Cancel</AppButton>
        <AppButton variant="primary" onClick={() => void handleSave()}>Save</AppButton>
      </DialogActions>
    </Dialog>
  )
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "ExpenseFormDialog" | head -20
```

Expected: no errors.

- [ ] **Step 3: Write the test file**

Create `frontend/src/pages/accounting/components/__tests__/ExpenseFormDialog.test.tsx`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { ExpenseFormDialog } from '../ExpenseFormDialog'

const mockCreate = vi.fn()
const mockUpdate = vi.fn()

vi.mock('@/store/api/accountingApi', () => ({
  useGetPaymentMethodsQuery: () => ({
    data: { data: [{ id: 'pm-1', name: 'Cash', code: 'CASH', isActive: true }] },
  }),
  useGetChartOfAccountsQuery: () => ({
    data: { data: [{ id: 'coa-1', code: '6000', name: 'Office Supplies', type: 'EXPENSE', isActive: true }] },
  }),
  useCreateExpenseMutation: () => [mockCreate],
  useUpdateExpenseMutation: () => [mockUpdate],
}))

const baseExpense = {
  id: 'ex-1',
  referenceNumber: 'EXP-001',
  expenseDate: '2026-02-15',
  expenseAccountId: 'coa-1',
  expenseAccount: { id: 'coa-1', code: '6000', name: 'Office Supplies' },
  amount: 100,
  paymentMethodId: 'pm-1',
  paymentMethod: { id: 'pm-1', code: 'CASH', name: 'Cash' },
  vendor: 'ACME Corp',
  description: 'Printer paper',
  status: 'draft' as const,
  createdAt: '2026-02-15',
  updatedAt: '2026-02-15',
}

const renderDialog = (editTarget = null as typeof baseExpense | null, open = true) =>
  render(
    <BrowserRouter>
      <ExpenseFormDialog open={open} editTarget={editTarget} onClose={vi.fn()} onSaved={vi.fn()} />
    </BrowserRouter>,
  )

describe('ExpenseFormDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows "New Expense" title when no editTarget', () => {
    renderDialog()
    expect(screen.getByText('New Expense')).toBeInTheDocument()
  })

  it('shows "Edit Expense" title when editTarget provided', () => {
    renderDialog(baseExpense)
    expect(screen.getByText('Edit Expense')).toBeInTheDocument()
  })

  it('pre-fills form fields from editTarget', () => {
    renderDialog(baseExpense)
    expect(screen.getByDisplayValue('2026-02-15')).toBeInTheDocument()
    expect(screen.getByDisplayValue('100')).toBeInTheDocument()
    expect(screen.getByDisplayValue('ACME Corp')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Printer paper')).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    renderDialog(null, false)
    expect(screen.queryByText('New Expense')).not.toBeInTheDocument()
  })

  it('calls create mutation on save with valid new form data', async () => {
    mockCreate.mockReturnValue({ unwrap: () => Promise.resolve({}) })
    renderDialog()

    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '50' } })
    fireEvent.change(screen.getByLabelText(/Vendor/i), { target: { value: 'Test Vendor' } })
    fireEvent.click(screen.getByText('Save'))

    await vi.waitFor(() => expect(mockCreate).toHaveBeenCalled())
  })

  it('calls update mutation on save in edit mode', async () => {
    mockUpdate.mockReturnValue({ unwrap: () => Promise.resolve({}) })
    renderDialog(baseExpense)

    fireEvent.change(screen.getByLabelText(/Vendor/i), { target: { value: 'New Vendor' } })
    fireEvent.click(screen.getByText('Save'))

    await vi.waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({ id: 'ex-1', data: expect.objectContaining({ vendor: 'New Vendor' }) }))
  })

  it('does not submit when amount is missing', async () => {
    mockCreate.mockReturnValue({ unwrap: () => Promise.resolve({}) })
    renderDialog()
    fireEvent.click(screen.getByText('Save'))
    await vi.waitFor(() => expect(mockCreate).not.toHaveBeenCalled())
  })
})
```

- [ ] **Step 4: Run the new tests**

```bash
cd frontend && npx vitest run src/pages/accounting/components/__tests__/ExpenseFormDialog.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/accounting/components/ExpenseFormDialog.tsx \
        frontend/src/pages/accounting/components/__tests__/ExpenseFormDialog.test.tsx
git commit -m "feat(expenses): extract ExpenseFormDialog from ExpensesPage"
```

---

## Task 4: Upgrade `ExpenseContextHeader` to two-column Grid + Journal Entry ref

Polish the header to match `JournalEntryContextHeader`: two-column Grid layout with section headers, label/value table styling, and a clickable Journal Entry reference link for posted expenses.

**Files:**
- Modify: `frontend/src/pages/accounting/components/ExpenseContextHeader.tsx`

- [ ] **Step 1: Replace the file content**

```typescript
import { Paper, Stack, Table, TableBody, TableCell, TableContainer, TableRow, Typography } from '@mui/material'
import Grid from '@mui/material/Grid'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'
import { default as PostIcon } from '@mui/icons-material/PostAdd'

import { AppButton } from '@/components/common/AppButton'
import { EntityContextHeaderBar } from '@/components/common/EntityContextHeaderBar'
import { EntityStatusChip } from '@/components/common/EntityStatusChip'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { useJournalEntryRef } from '@/hooks/useJournalEntryRef'
import type { ExpenseRecord } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface Props {
  selected: ExpenseRecord | null
  onEdit: () => void
  onPost: () => void
  onDelete: () => void
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

export function ExpenseContextHeader({ selected, onEdit, onPost, onDelete }: Props) {
  const { journalEntryRef, navigateToJournalEntry } = useJournalEntryRef(
    selected?.journalEntryId
      ? [{ sourceType: 'expense', sourceId: selected.id }]
      : [],
  )

  if (!selected) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
          Select an expense to view details
        </Typography>
      </Paper>
    )
  }

  const isDraft = selected.status === 'draft'

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <EntityContextHeaderBar
        title={selected.referenceNumber}
        statusChip={<EntityStatusChip status={selected.status} />}
        actions={
          isDraft ? (
            <Stack direction="row" spacing={0.5}>
              <AppButton size="small" variant="outlined" startIcon={<EditIcon />} onClick={onEdit}>
                Edit
              </AppButton>
              <AppButton size="small" variant="success" startIcon={<PostIcon />} onClick={onPost}>
                Post
              </AppButton>
              <AppButton size="small" variant="danger" startIcon={<DeleteIcon />} onClick={onDelete}>
                Delete
              </AppButton>
            </Stack>
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
                      Expense Info
                    </Typography>
                  </TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Date</TableCell>
                  <TableCell sx={valueCellSx}>{formatDate(selected.expenseDate)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={labelCellSx}>Vendor</TableCell>
                  <TableCell sx={valueCellSx}>{selected.vendor ?? '—'}</TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Account</TableCell>
                  <TableCell sx={valueCellSx}>{selected.expenseAccount?.name ?? '—'}</TableCell>
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
                      Payment & Total
                    </Typography>
                  </TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Amount</TableCell>
                  <TableCell sx={{ ...valueCellSx, fontWeight: 600 }}>{formatCurrency(selected.amount)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={labelCellSx}>Payment Method</TableCell>
                  <TableCell sx={valueCellSx}>{selected.paymentMethod?.name ?? '—'}</TableCell>
                </TableRow>
                {journalEntryRef && (
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Journal Entry</TableCell>
                    <TableCell sx={valueCellSx}>
                      <Typography
                        component="button"
                        onClick={navigateToJournalEntry}
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
                        {journalEntryRef.referenceNumber}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Grid>
      </Grid>
    </Paper>
  )
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "ExpenseContextHeader" | head -20
```

Expected: no errors.

- [ ] **Step 3: Write the context header tests**

Create `frontend/src/pages/accounting/components/__tests__/ExpenseContextHeader.test.tsx`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { ExpenseContextHeader } from '../ExpenseContextHeader'

vi.mock('@/utils/formatters', async () => {
  const actual = await vi.importActual<typeof import('@/utils/formatters')>('@/utils/formatters')
  return { ...actual, formatDate: (v: string) => v, formatCurrency: (v: number) => `$${v}` }
})

vi.mock('@/hooks/useJournalEntryRef', () => ({
  useJournalEntryRef: () => ({
    journalEntryRef: null,
    journalEntryRefLoading: false,
    navigateToJournalEntry: vi.fn(),
  }),
}))

const draftExpense = {
  id: 'ex-1',
  referenceNumber: 'EXP-001',
  expenseDate: '2026-02-15',
  expenseAccountId: 'coa-1',
  expenseAccount: { id: 'coa-1', code: '6000', name: 'Office Supplies' },
  amount: 225.5,
  paymentMethodId: 'pm-1',
  paymentMethod: { id: 'pm-1', code: 'CASH', name: 'Cash' },
  vendor: 'Stationery Hub',
  description: 'Printer paper',
  status: 'draft' as const,
  createdAt: '2026-02-15',
  updatedAt: '2026-02-15',
}

const renderHeader = (props: Partial<React.ComponentProps<typeof ExpenseContextHeader>> = {}) =>
  render(
    <BrowserRouter>
      <ExpenseContextHeader
        selected={null}
        onEdit={vi.fn()}
        onPost={vi.fn()}
        onDelete={vi.fn()}
        {...props}
      />
    </BrowserRouter>,
  )

describe('ExpenseContextHeader', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows placeholder when no expense selected', () => {
    renderHeader()
    expect(screen.getByText('Select an expense to view details')).toBeInTheDocument()
  })

  it('shows reference number and status chip', () => {
    renderHeader({ selected: draftExpense })
    expect(screen.getByText('EXP-001')).toBeInTheDocument()
    expect(screen.getByText('draft')).toBeInTheDocument()
  })

  it('shows Edit, Post, Delete buttons for draft expenses', () => {
    renderHeader({ selected: draftExpense })
    expect(screen.getByText('Edit')).toBeInTheDocument()
    expect(screen.getByText('Post')).toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('does not show action buttons for posted expenses', () => {
    renderHeader({ selected: { ...draftExpense, status: 'posted' as const } })
    expect(screen.queryByText('Edit')).not.toBeInTheDocument()
    expect(screen.queryByText('Post')).not.toBeInTheDocument()
    expect(screen.queryByText('Delete')).not.toBeInTheDocument()
  })

  it('calls onEdit when Edit button clicked', () => {
    const onEdit = vi.fn()
    renderHeader({ selected: draftExpense, onEdit })
    fireEvent.click(screen.getByText('Edit'))
    expect(onEdit).toHaveBeenCalledOnce()
  })

  it('calls onPost when Post button clicked', () => {
    const onPost = vi.fn()
    renderHeader({ selected: draftExpense, onPost })
    fireEvent.click(screen.getByText('Post'))
    expect(onPost).toHaveBeenCalledOnce()
  })

  it('calls onDelete when Delete button clicked', () => {
    const onDelete = vi.fn()
    renderHeader({ selected: draftExpense, onDelete })
    fireEvent.click(screen.getByText('Delete'))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('displays vendor, account, amount and payment method', () => {
    renderHeader({ selected: draftExpense })
    expect(screen.getByText('Stationery Hub')).toBeInTheDocument()
    expect(screen.getByText('Office Supplies')).toBeInTheDocument()
    expect(screen.getByText('$225.5')).toBeInTheDocument()
    expect(screen.getByText('Cash')).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run the context header tests**

```bash
cd frontend && npx vitest run src/pages/accounting/components/__tests__/ExpenseContextHeader.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/accounting/components/ExpenseContextHeader.tsx \
        frontend/src/pages/accounting/components/__tests__/ExpenseContextHeader.test.tsx
git commit -m "feat(expenses): upgrade ExpenseContextHeader to two-column Grid with JE ref link"
```

---

## Task 5: Update `ExpensesPage` — remove inline form, wire new props

Remove the inline form and all its state from `ExpensesPage`, use `ExpenseFormDialog`, and pass `focusedIndex` to `ExpensesTable`. Also remove the `onToggleCheck`, `onSelectAll`, `onPost`, `onEdit`, `onDelete` props from `ExpensesTable` call since the narrow table no longer has inline action buttons.

**Files:**
- Modify: `frontend/src/pages/accounting/ExpensesPage.tsx`

- [ ] **Step 1: Replace the file content**

```typescript
import React, { useMemo } from 'react'
import { Stack } from '@mui/material'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as PostIcon } from '@mui/icons-material/PostAdd'

import { AppButton } from '@/components/common/AppButton'
import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useGetExpensesQuery } from '@/store/api/accountingApi'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'

import { ExpenseContextHeader } from './components/ExpenseContextHeader'
import { ExpenseFormDialog } from './components/ExpenseFormDialog'
import { ExpensesDialogs } from './components/ExpensesDialogs'
import { ExpensesTable } from './components/ExpensesTable'
import { ExpenseWorkspaceCard } from './components/ExpenseWorkspaceCard'
import { useExpensesWorkspace } from './hooks/useExpensesWorkspace'

interface ExpenseFilters {
  search: string
  status: string | null
  period: PeriodValue
}

const filterConfig: FilterBarConfig<ExpenseFilters> = {
  search: { placeholder: 'Search expenses...' },
  fields: [
    { field: 'period', label: 'Period', type: 'period' },
    { field: 'status', label: 'Status', type: 'expense-status' },
  ],
  defaults: {
    search: '',
    status: null,
    period: { key: null, from: null, to: null },
  },
}

const ExpensesPage: React.FC = () => {
  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)
  const weekStartsOn = getStartOfWeek()
  const dateRange = useMemo(() => {
    const period = appliedFilters.period
    if (!period || period.key === null) return { fromDate: undefined, toDate: undefined }
    if (period.key === 'custom') return { fromDate: period.from ?? undefined, toDate: period.to ?? undefined }
    const resolved = getPeriodDateRange(period.key, weekStartsOn)
    return { fromDate: resolved.from, toDate: resolved.to }
  }, [appliedFilters.period, weekStartsOn])

  const filters = useMemo(
    () => ({
      page: 1,
      status: appliedFilters.status || undefined,
      startDate: dateRange.fromDate,
      endDate: dateRange.toDate,
      search: appliedFilters.search || undefined,
    }),
    [appliedFilters.status, appliedFilters.search, dateRange],
  )

  const { data: expensesResponse, isLoading, refetch } = useGetExpensesQuery(filters)
  const rows = expensesResponse?.data ?? []

  const workspace = useExpensesWorkspace(() => { void refetch() })

  const openCreate = () => {
    workspace.setEditTarget(null)
    workspace.setFormOpen(true)
  }

  const openEdit = () => {
    if (!workspace.selected) return
    workspace.setEditTarget(workspace.selected)
    workspace.setFormOpen(true)
  }

  const closeForm = () => {
    workspace.setFormOpen(false)
    workspace.setEditTarget(null)
  }

  return (
    <GenericListPage
      title="Expenses"
      subtitle="Record and manage business expense transactions"
      primaryAction={{ label: 'New Expense', onClick: openCreate }}
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={handlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={workspace.searchInputRef}
      sort={{ field: 'expenseDate', sortBy: 'expenseDate', sortOrder: 'desc', onSort: () => {} }}
      contentSlot={workspace.selectedIds.size > 0 ? (
        <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
          <AppButton size="small" variant="primary" startIcon={<PostIcon />} onClick={() => workspace.setBulkPostOpen(true)}>
            Bulk Post ({workspace.selectedIds.size})
          </AppButton>
          <AppButton size="small" variant="danger" startIcon={<DeleteIcon />} onClick={() => workspace.setBulkDeleteOpen(true)}>
            Bulk Delete ({workspace.selectedIds.size})
          </AppButton>
        </Stack>
      ) : null}
      listSlot={(
        <ExpensesTable
          expenses={rows}
          loading={isLoading}
          selectedId={workspace.selected?.id ?? null}
          focusedIndex={workspace.focusedIndex}
          onSelect={(item) => {
            workspace.handleSelect(item)
            workspace.setFocusedIndex(rows.findIndex((r) => r.id === item.id))
          }}
          listRef={workspace.listRef}
        />
      )}
      headerSlot={(
        <ExpenseContextHeader
          selected={workspace.selected}
          onEdit={openEdit}
          onPost={() => workspace.selected && workspace.setPostTarget(workspace.selected)}
          onDelete={() => workspace.selected && workspace.setDeleteTarget(workspace.selected)}
        />
      )}
      workspaceSlot={<ExpenseWorkspaceCard selected={workspace.selected} />}
      dialogs={(
        <>
          <ExpensesDialogs
            postTarget={workspace.postTarget}
            deleteTarget={workspace.deleteTarget}
            bulkPostIds={workspace.bulkPostOpen ? workspace.selectedIds : new Set<string>()}
            bulkDeleteIds={workspace.bulkDeleteOpen ? workspace.selectedIds : new Set<string>()}
            actionLoading={workspace.actionLoading}
            onConfirmPost={workspace.handleConfirmPost}
            onConfirmDelete={workspace.handleConfirmDelete}
            onConfirmBulkPost={workspace.handleBulkPost}
            onConfirmBulkDelete={workspace.handleBulkDelete}
            onCancelPost={() => workspace.setPostTarget(null)}
            onCancelDelete={() => workspace.setDeleteTarget(null)}
            onCancelBulkPost={() => workspace.setBulkPostOpen(false)}
            onCancelBulkDelete={() => workspace.setBulkDeleteOpen(false)}
          />
          <ExpenseFormDialog
            open={workspace.formOpen}
            editTarget={workspace.editTarget}
            onClose={closeForm}
            onSaved={() => { void refetch() }}
          />
        </>
      )}
    />
  )
}

export default ExpensesPage
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "ExpensesPage|ExpensesTable|ExpenseForm" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/ExpensesPage.tsx
git commit -m "refactor(expenses): remove inline form, use ExpenseFormDialog, pass focusedIndex"
```

---

## Task 6: Update `ExpensesPage.test.tsx`

The existing test uses `useCreateExpenseMutation` / `useUpdateExpenseMutation` directly from `ExpensesPage` — those are now in `ExpenseFormDialog`. Update mocks and tests to reflect the new structure. The test for "displays expense data in table" must work with the narrow EntityTable which no longer shows Vendor/Account columns inline — those appear in the detail panel after clicking a row.

**Files:**
- Modify: `frontend/src/pages/accounting/__tests__/ExpensesPage.test.tsx`

- [ ] **Step 1: Replace the file content**

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'

import ExpensesPage from '../ExpensesPage'

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}))

vi.mock('@/hooks/useJournalEntryRef', () => ({
  useJournalEntryRef: () => ({
    journalEntryRef: null,
    journalEntryRefLoading: false,
    navigateToJournalEntry: vi.fn(),
  }),
}))

const mockedApi = vi.hoisted(() => ({
  useGetExpensesQuery: vi.fn(),
  useGetPaymentMethodsQuery: vi.fn(),
  useGetChartOfAccountsQuery: vi.fn(),
  useCreateExpenseMutation: vi.fn(),
  useUpdateExpenseMutation: vi.fn(),
  useDeleteExpenseMutation: vi.fn(),
  usePostExpenseMutation: vi.fn(),
  useBulkPostExpensesMutation: vi.fn(),
  useBulkDeleteExpensesMutation: vi.fn(),
}))

vi.mock('@/utils/dateRange', () => ({
  getPeriodDateRange: () => ({ from: undefined, to: undefined }),
  getStartOfWeek: () => 0,
}))
vi.mock('@/utils/formatters', async () => {
  const actual = await vi.importActual<typeof import('@/utils/formatters')>('@/utils/formatters')
  return { ...actual, formatDate: (value: string) => value, formatCurrency: (value: number) => `$${value}` }
})

vi.mock('@/store/api/accountingApi', () => mockedApi)

const expense1 = {
  id: 'ex-1',
  referenceNumber: 'EXP-001',
  expenseDate: '2026-02-15',
  expenseAccountId: 'coa-1',
  expenseAccount: { id: 'coa-1', code: '6000', name: 'Office Supplies' },
  amount: 225.5,
  paymentMethodId: 'pm-1',
  paymentMethod: { id: 'pm-1', code: 'CASH', name: 'Cash' },
  vendor: 'Stationery Hub',
  description: 'Printer paper and ink',
  status: 'draft' as const,
  createdAt: '2026-02-15',
  updatedAt: '2026-02-15',
}

const renderPage = () =>
  render(
    <BrowserRouter>
      <ExpensesPage />
    </BrowserRouter>,
  )

describe('ExpensesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.useGetExpensesQuery.mockReturnValue({
      data: { data: [expense1] },
      isLoading: false,
      refetch: vi.fn(),
    })
    mockedApi.useGetPaymentMethodsQuery.mockReturnValue({
      data: { data: [{ id: 'pm-1', code: 'CASH', name: 'Cash', isActive: true }] },
    })
    mockedApi.useGetChartOfAccountsQuery.mockReturnValue({
      data: { data: [{ id: 'coa-1', code: '6000', name: 'Office Supplies', type: 'EXPENSE', isActive: true }] },
    })
    mockedApi.useCreateExpenseMutation.mockReturnValue([vi.fn()])
    mockedApi.useUpdateExpenseMutation.mockReturnValue([vi.fn()])
    mockedApi.useDeleteExpenseMutation.mockReturnValue([vi.fn()])
    mockedApi.usePostExpenseMutation.mockReturnValue([vi.fn()])
    mockedApi.useBulkPostExpensesMutation.mockReturnValue([vi.fn()])
    mockedApi.useBulkDeleteExpensesMutation.mockReturnValue([vi.fn()])
  })

  it('renders the page title', () => {
    renderPage()
    expect(screen.getByText('Expenses')).toBeInTheDocument()
  })

  it('shows expense reference number in the narrow list', () => {
    renderPage()
    expect(screen.getByText('EXP-001')).toBeInTheDocument()
  })

  it('bulk action buttons are hidden when no rows are selected', () => {
    renderPage()
    expect(screen.queryByText(/Bulk Post/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Bulk Delete/i)).not.toBeInTheDocument()
  })

  it('shows skeleton loading state', () => {
    mockedApi.useGetExpensesQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      refetch: vi.fn(),
    })
    renderPage()
    // EntityTable renders skeletons when loading and rows are empty
    expect(document.querySelector('.MuiSkeleton-root')).toBeInTheDocument()
  })

  it('selecting a row shows detail in the context header', () => {
    renderPage()
    fireEvent.click(screen.getByText('EXP-001'))
    expect(screen.getByText('Stationery Hub')).toBeInTheDocument()
    expect(screen.getByText('Office Supplies')).toBeInTheDocument()
    expect(screen.getByText('$225.5')).toBeInTheDocument()
  })

  it('clicking New Expense opens form dialog', () => {
    renderPage()
    fireEvent.click(screen.getByText('New Expense'))
    expect(screen.getByText('New Expense', { selector: '*' })).toBeInTheDocument()
  })

  it('shows filter controls', () => {
    renderPage()
    expect(screen.getByPlaceholderText('Search expenses...')).toBeInTheDocument()
    expect(screen.getAllByText('Status').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Period').length).toBeGreaterThan(0)
  })

  it('shows description in workspace card after selecting a row', () => {
    renderPage()
    fireEvent.click(screen.getByText('EXP-001'))
    expect(screen.getByText('Printer paper and ink')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the updated page tests**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/ExpensesPage.test.tsx
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/__tests__/ExpensesPage.test.tsx
git commit -m "test(expenses): update ExpensesPage tests for master-detail layout"
```

---

## Task 7: Final TypeScript + lint check and PR

Run all checks, fix any remaining issues, and open a PR closing issue #509.

**Files:** No new files.

- [ ] **Step 1: Full TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | tail -5
```

Expected: `Found 0 errors.`

- [ ] **Step 2: Lint**

```bash
cd frontend && npm run lint 2>&1 | tail -10
```

Expected: no errors (warnings OK).

- [ ] **Step 3: Run all new tests together**

```bash
cd frontend && npx vitest run \
  src/pages/accounting/__tests__/ExpensesPage.test.tsx \
  src/pages/accounting/components/__tests__/ExpenseFormDialog.test.tsx \
  src/pages/accounting/components/__tests__/ExpenseContextHeader.test.tsx
```

Expected: all tests pass.

- [ ] **Step 4: Open PR**

```bash
gh pr create \
  --title "feat(expenses): master-detail layout refactor (closes #509)" \
  --body "$(cat <<'EOF'
## Summary
- Refactors `ExpensesTable` to use `EntityTable` (narrow master list: reference + status chip)
- Extracts `ExpenseFormDialog` from `ExpensesPage` (handles New and Edit modes)
- Upgrades `ExpenseContextHeader` to two-column Grid layout with Journal Entry ref link for posted expenses
- Wires `useEntityWorkspace` into `useExpensesWorkspace` for keyboard navigation and `focusedIndex`
- Removes inline form state from `ExpensesPage`

## Test plan
- [ ] `ExpensesPage.test.tsx` — page integration, selection, filtering
- [ ] `ExpenseFormDialog.test.tsx` — form validation, new/edit modes, mutation calls
- [ ] `ExpenseContextHeader.test.tsx` — action buttons, data display, status-based visibility
- [ ] Manual: navigate to Expenses, verify narrow list + detail panel, keyboard arrow navigation, New Expense dialog, Edit from header, Post/Delete from header

Closes #509

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Master-Detail layout (narrow list left, rich detail right) — Tasks 2, 5
- ✅ `ExpenseFormDialog` extraction — Task 3
- ✅ `ExpenseContextHeader` two-column Grid + JE ref — Task 4
- ✅ `ExpensesTable` → `EntityTable` — Task 2
- ✅ `useExpensesWorkspace` keyboard nav + `focusedIndex` — Task 1
- ✅ `ExpenseWorkspaceCard` — unchanged (already correct per spec)
- ✅ Unit tests for `ExpenseFormDialog` and `ExpenseContextHeader` — Tasks 3, 4
- ✅ Integration tests for `ExpensesPage` updated — Task 6

**No placeholders:** All steps contain complete code.

**Type consistency:**
- `focusedIndex` / `setFocusedIndex` exposed from `useExpensesWorkspace` (Task 1) and consumed in `ExpensesPage` (Task 5) and `ExpensesTable` (Task 2) — consistent.
- `formOpen` / `setFormOpen` / `editTarget` / `setEditTarget` defined in Task 1, used in Tasks 5.
- `ExpenseFormDialog` `Props`: `open`, `editTarget`, `onClose`, `onSaved` — matches usage in Task 5.
- `ExpensesTable` `Props`: `expenses`, `loading`, `selectedId`, `focusedIndex`, `onSelect`, `listRef` — matches call site in Task 5.
