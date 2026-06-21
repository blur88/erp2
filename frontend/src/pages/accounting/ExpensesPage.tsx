import React, { useCallback, useMemo, useState } from 'react'

import DeletedExpensesDialog from '@/components/accounting/DeletedExpensesDialog'
import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { useGetExpensesQuery } from '@/store/api/accountingApi'
import { selectCurrentUser } from '@/store/slices/authSlice'
import { selectSelectedExpense } from '@/store/slices/accountingSlice'
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
  expenseAccountId: string | null
  paymentMethodId: string | null
}

const filterConfig: FilterBarConfig<ExpenseFilters> = {
  search: { placeholder: 'Search expenses...' },
  fields: [
    { field: 'period', label: 'Period', type: 'period' },
    { field: 'status', label: 'Status', type: 'expense-status' },
    { field: 'expenseAccountId', label: 'Expense Account', type: 'expense-account' },
    { field: 'paymentMethodId', label: 'Payment Method', type: 'payment-method' },
  ],
  defaults: {
    search: '',
    status: null,
    period: { key: null, from: null, to: null },
    expenseAccountId: null,
    paymentMethodId: null,
  },
}

const ExpensesPage: React.FC = () => {
  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)
  const weekStartsOn = getStartOfWeek()
  const [deletedOpen, setDeletedOpen] = useState(false)
  const [sortBy, setSortBy] = useState('referenceNumber')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const dateRange = useMemo(() => {
    const period = appliedFilters.period
    if (!period || period.key === null) return { fromDate: undefined, toDate: undefined }
    if (period.key === 'custom') return { fromDate: period.from ?? undefined, toDate: period.to ?? undefined }
    const resolved = getPeriodDateRange(period.key, weekStartsOn)
    return { fromDate: resolved.from, toDate: resolved.to }
  }, [appliedFilters.period, weekStartsOn])

  const handleSort = useCallback((field: string) => {
    setSortOrder((prev) => (sortBy === field && prev === 'desc' ? 'asc' : 'desc'))
    setSortBy(field)
  }, [sortBy])

  const filters = useMemo(
    () => ({
      status: appliedFilters.status || undefined,
      startDate: dateRange.fromDate,
      endDate: dateRange.toDate,
      search: appliedFilters.search || undefined,
      expenseAccountId: appliedFilters.expenseAccountId || undefined,
      paymentMethodId: appliedFilters.paymentMethodId || undefined,
      sortBy,
      sortOrder: sortOrder.toUpperCase() as 'ASC' | 'DESC',
    }),
    [appliedFilters, dateRange, sortBy, sortOrder],
  )

  const { data: expensesResponse, isLoading, refetch } = useGetExpensesQuery(filters)
  const rows = expensesResponse?.data ?? []

  const dispatch = useAppDispatch()
  const currentUser = useAppSelector(selectCurrentUser)
  const isAdmin = currentUser?.role === 'admin'
  const selected = useAppSelector(selectSelectedExpense)
  const workspace = useExpensesWorkspace(() => { void refetch() }, rows, dispatch, selected)

  const filterHandlers = useMemo(() => ({
    ...handlers,
    onSearchChange: (value: string) => {
      handlers.onSearchChange(value)
      workspace.setShouldPreserveSearchFocus(true)
    },
  }), [handlers, workspace])

  const openCreate = () => {
    workspace.setEditTarget(null)
    workspace.setFormOpen(true)
  }

  const openEdit = () => {
    if (!selected) return
    workspace.setEditTarget(selected)
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
      secondaryAction={{ label: 'View Deleted', onClick: () => setDeletedOpen(true) }}
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={filterHandlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={workspace.searchInputRef}
      sort={{ field: 'referenceNumber', sortBy, sortOrder, onSort: handleSort }}
      listSlot={(
        <ExpensesTable
          expenses={rows}
          loading={isLoading}
          selectedId={selected?.id ?? null}
          focusedIndex={workspace.focusedIndex}
          onSelect={workspace.handleSelect}
          listRef={workspace.listRef}
        />
      )}
      headerSlot={(
        <ExpenseContextHeader
          selected={selected}
          isAdmin={isAdmin}
          onEdit={openEdit}
          onPost={() => selected && workspace.setPostTarget(selected)}
          onDelete={() => selected && workspace.setDeleteTarget(selected)}
          onUnpost={() => selected && workspace.setUnpostTarget(selected)}
          onRestore={() => selected && workspace.setRestoreTarget(selected)}
        />
      )}
      workspaceSlot={<ExpenseWorkspaceCard selected={selected} />}
      dialogs={(
        <>
          <ExpensesDialogs
            postTarget={workspace.postTarget}
            deleteTarget={workspace.deleteTarget}
            unpostTarget={workspace.unpostTarget}
            restoreTarget={workspace.restoreTarget}
            actionLoading={workspace.actionLoading}
            onConfirmPost={workspace.handleConfirmPost}
            onConfirmDelete={workspace.handleConfirmDelete}
            onConfirmUnpost={workspace.handleConfirmUnpost}
            onConfirmRestore={workspace.handleConfirmRestore}
            onCancelPost={() => workspace.setPostTarget(null)}
            onCancelDelete={() => workspace.setDeleteTarget(null)}
            onCancelUnpost={() => workspace.setUnpostTarget(null)}
            onCancelRestore={() => workspace.setRestoreTarget(null)}
          />
          <ExpenseFormDialog
            open={workspace.formOpen}
            editTarget={workspace.editTarget}
            onClose={closeForm}
            onSaved={() => { void refetch() }}
          />
          <DeletedExpensesDialog
            open={deletedOpen}
            onClose={() => setDeletedOpen(false)}
            onChanged={() => { void refetch() }}
          />
        </>
      )}
    />
  )
}

export default ExpensesPage
