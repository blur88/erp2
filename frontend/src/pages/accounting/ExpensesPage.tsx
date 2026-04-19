import React, { useMemo, useState } from 'react'
import {
  Button,
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
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as PostIcon } from '@mui/icons-material/PostAdd'

import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import {
  useCreateExpenseMutation,
  useGetChartOfAccountsQuery,
  useGetExpensesQuery,
  useGetPaymentMethodsQuery,
  useUpdateExpenseMutation,
} from '@/store/api/accountingApi'
import type { ChartOfAccount, ExpenseRecord } from '@/types'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'

import { ExpenseContextHeader } from './components/ExpenseContextHeader'
import { ExpensesDialogs } from './components/ExpensesDialogs'
import { ExpensesTable } from './components/ExpensesTable'
import { ExpenseWorkspaceCard } from './components/ExpenseWorkspaceCard'
import { useExpensesWorkspace } from './hooks/useExpensesWorkspace'

type FormState = {
  id?: string
  expenseDate: string
  expenseAccountId: string
  amount: string
  paymentMethodId: string
  vendor: string
  description: string
}

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

const defaultFormState = (): FormState => ({
  expenseDate: new Date().toISOString().slice(0, 10),
  expenseAccountId: '',
  amount: '',
  paymentMethodId: '',
  vendor: '',
  description: '',
})

const ExpensesPage: React.FC = () => {
  const [form, setForm] = useState<FormState>(defaultFormState())

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
  const { data: paymentMethodsResponse } = useGetPaymentMethodsQuery({ page: 1, isActive: true })
  const paymentMethods = paymentMethodsResponse?.data ?? []
  const { data: expenseAccountsResponse } = useGetChartOfAccountsQuery({ page: 1, type: 'EXPENSE', isActive: true })
  const expenseAccounts = (expenseAccountsResponse?.data ?? []) as ChartOfAccount[]
  const [createExpense] = useCreateExpenseMutation()
  const [updateExpense] = useUpdateExpenseMutation()

  const workspace = useExpensesWorkspace(() => {
    void refetch()
  })

  const openCreate = () => {
    setForm({
      ...defaultFormState(),
      expenseAccountId: expenseAccounts[0]?.id ?? '',
      paymentMethodId: paymentMethods[0]?.id ?? '',
    })
    workspace.setEditTarget(null)
    workspace.setCreateOpen(true)
  }

  const openEdit = (row: ExpenseRecord) => {
    setForm({
      id: row.id,
      expenseDate: String(row.expenseDate).slice(0, 10),
      expenseAccountId: row.expenseAccountId,
      amount: String(row.amount),
      paymentMethodId: row.paymentMethodId,
      vendor: row.vendor || '',
      description: row.description || '',
    })
    workspace.setEditTarget(row)
  }

  const closeForm = () => {
    workspace.setCreateOpen(false)
    workspace.setEditTarget(null)
    setForm(defaultFormState())
  }

  const save = async () => {
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

    if (form.id) {
      await updateExpense({ id: form.id, data: payload }).unwrap()
    } else {
      await createExpense(payload).unwrap()
    }

    closeForm()
    void refetch()
  }

  const formOpen = workspace.createOpen || workspace.editTarget !== null

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
          <Button size="small" variant="contained" startIcon={<PostIcon />} onClick={() => workspace.setBulkPostOpen(true)}>
            Bulk Post ({workspace.selectedIds.size})
          </Button>
          <Button size="small" variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={() => workspace.setBulkDeleteOpen(true)}>
            Bulk Delete ({workspace.selectedIds.size})
          </Button>
        </Stack>
      ) : null}
      listSlot={(
        <ExpensesTable
          expenses={rows}
          loading={isLoading}
          selectedId={workspace.selected?.id ?? null}
          selectedIds={workspace.selectedIds}
          onSelect={workspace.setSelected}
          onToggleCheck={workspace.handleToggleCheck}
          onSelectAll={() => workspace.handleSelectAll(rows)}
          onPost={(item) => workspace.setPostTarget(item)}
          onEdit={openEdit}
          onDelete={(item) => workspace.setDeleteTarget(item)}
          listRef={workspace.listRef}
        />
      )}
      headerSlot={(
        <ExpenseContextHeader
          selected={workspace.selected}
          onEdit={() => workspace.selected && openEdit(workspace.selected)}
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
          <Dialog open={formOpen} onClose={closeForm} maxWidth="sm" fullWidth>
            <DialogTitle>{workspace.editTarget ? 'Edit Expense' : 'New Expense'}</DialogTitle>
            <DialogContent>
              <Stack spacing={2} sx={{ mt: 1 }}>
                <TextField label="Date" type="date" size="small" value={form.expenseDate} onChange={(event) => setForm((current) => ({ ...current, expenseDate: event.target.value }))} slotProps={{ inputLabel: { shrink: true } }} />
                <FormControl fullWidth size="small">
                  <InputLabel>Expense Account</InputLabel>
                  <Select value={form.expenseAccountId} label="Expense Account" onChange={(event) => setForm((current) => ({ ...current, expenseAccountId: event.target.value }))}>
                    {expenseAccounts.map((account) => (
                      <MenuItem key={account.id} value={account.id}>{account.code} - {account.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField label="Amount" size="small" type="number" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} />
                <FormControl fullWidth size="small">
                  <InputLabel>Payment Method</InputLabel>
                  <Select value={form.paymentMethodId} label="Payment Method" onChange={(event) => setForm((current) => ({ ...current, paymentMethodId: event.target.value }))}>
                    {paymentMethods.map((paymentMethod) => (
                      <MenuItem key={paymentMethod.id} value={paymentMethod.id}>{paymentMethod.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField label="Vendor" value={form.vendor} onChange={(event) => setForm((current) => ({ ...current, vendor: event.target.value }))} />
                <TextField label="Description" multiline minRows={2} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={closeForm}>Cancel</Button>
              <Button variant="contained" onClick={() => void save()}>Save</Button>
            </DialogActions>
          </Dialog>
        </>
      )}
    />
  )
}

export default ExpensesPage
