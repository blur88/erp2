import React, { useCallback, useMemo, useState } from 'react'

import BankReconciliationFormDialog from '@/components/accounting/BankReconciliationFormDialog'
import DeletedBankReconciliationsDialog from '@/components/accounting/DeletedBankReconciliationsDialog'
import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { useGetBankReconciliationsQuery } from '@/store/api/accountingApi'
import { selectSelectedBankReconciliation } from '@/store/slices/accountingSlice'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'

import { BankReconciliationContextHeader } from './components/BankReconciliationContextHeader'
import { BankReconciliationsDialogs } from './components/BankReconciliationsDialogs'
import { BankReconciliationsTable } from './components/BankReconciliationsTable'
import { BankReconciliationWorkspaceCard } from './components/BankReconciliationWorkspaceCard'
import { useBankReconciliationsWorkspace } from './hooks/useBankReconciliationsWorkspace'

interface BRFilters {
  search: string
  status: string | null
  period: PeriodValue
  accountId: string | null
  isBalanced: string | null
}

const filterConfig: FilterBarConfig<BRFilters> = {
  search: { placeholder: 'Search reconciliations...' },
  fields: [
    { field: 'period', label: 'Period', type: 'period' },
    { field: 'status', label: 'Status', type: 'bank-reconciliation-status' },
    { field: 'accountId', label: 'Bank Account', type: 'bank-reconciliation-account' },
    { field: 'isBalanced', label: 'Balance Status', type: 'bank-reconciliation-balanced' },
  ],
  defaults: {
    search: '',
    status: null,
    period: { key: null, from: null, to: null },
    accountId: null,
    isBalanced: null,
  },
}

const BankReconciliationsPage: React.FC = () => {
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deletedOpen, setDeletedOpen] = useState(false)
  const [sortBy, setSortBy] = useState('reconciliationDate')
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

  const { data, isLoading, refetch } = useGetBankReconciliationsQuery({
    search: appliedFilters.search || undefined,
    status: appliedFilters.status ? appliedFilters.status.toUpperCase() : undefined,
    startDate: dateRange.fromDate,
    endDate: dateRange.toDate,
    accountId: appliedFilters.accountId ?? undefined,
    isBalanced:
      appliedFilters.isBalanced === 'balanced' ? true
      : appliedFilters.isBalanced === 'unbalanced' ? false
      : undefined,
    sortBy,
    sortOrder: sortOrder.toUpperCase() as 'ASC' | 'DESC',
  })
  const reconciliations = data?.data ?? []
  const total = data?.meta?.total ?? 0

  const dispatch = useAppDispatch()
  const selected = useAppSelector(selectSelectedBankReconciliation)
  const workspace = useBankReconciliationsWorkspace({
    reconciliations,
    refetch: () => { void refetch() },
    dispatch,
    selected,
  })

  const handleSort = useCallback((field: string) => {
    setSortOrder((prev) => (sortBy === field && prev === 'desc' ? 'asc' : 'desc'))
    setSortBy(field)
  }, [sortBy])

  const { searchInputRef } = workspace
  const filterHandlers = useMemo(() => ({
    ...handlers,
    onSearchChange: (value: string) => {
      handlers.onSearchChange(value)
      window.setTimeout(() => {
        searchInputRef.current?.focus()
      }, 0)
    },
  }), [handlers, searchInputRef])

  return (
    <GenericListPage
      title="Bank Reconciliations"
      subtitle="Reconcile bank accounts with your ledger"
      primaryAction={{ label: 'New Reconciliation', onClick: () => setCreateOpen(true) }}
      secondaryAction={{ label: 'View Deleted', onClick: () => setDeletedOpen(true) }}
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={filterHandlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={workspace.searchInputRef}
      sort={{ field: 'reconciliationDate', sortBy, sortOrder, onSort: handleSort }}
      listSlot={(
        <BankReconciliationsTable
          reconciliations={reconciliations}
          loading={isLoading}
          total={total}
          selectedId={selected?.id ?? null}
          focusedIndex={workspace.focusedIndex}
          onSelect={workspace.handleSelect}
          listRef={workspace.listRef}
        />
      )}
      headerSlot={(
        <BankReconciliationContextHeader
          selected={selected}
          onEdit={() => setEditOpen(true)}
          onComplete={() => selected && workspace.setCompleteTarget(selected)}
          onReopen={() => selected && workspace.setReopenTarget(selected)}
          onDelete={() => selected && workspace.setDeleteTarget(selected)}
        />
      )}
      workspaceSlot={(
        <BankReconciliationWorkspaceCard
          selected={selected}
          onToggleCleared={workspace.handleToggleCleared}
        />
      )}
      dialogs={(
        <>
          <BankReconciliationsDialogs
            completeTarget={workspace.completeTarget}
            reopenTarget={workspace.reopenTarget}
            deleteTarget={workspace.deleteTarget}
            blockedDeleteTarget={workspace.blockedDeleteTarget}
            actionLoading={workspace.actionLoading}
            onConfirmComplete={workspace.handleConfirmComplete}
            onConfirmReopen={workspace.handleConfirmReopen}
            onConfirmDelete={workspace.handleConfirmDelete}
            onCancelComplete={() => workspace.setCompleteTarget(null)}
            onCancelReopen={() => workspace.setReopenTarget(null)}
            onCancelDelete={() => workspace.setDeleteTarget(null)}
            onCancelBlockedDelete={() => workspace.setBlockedDeleteTarget(null)}
            onReopenOnly={workspace.handleReopenOnly}
            onReopenAndDelete={workspace.handleReopenAndDelete}
          />
          {createOpen && (
            <BankReconciliationFormDialog
              open={createOpen}
              reconciliation={null}
              onClose={() => setCreateOpen(false)}
              onSuccess={() => {
                setCreateOpen(false)
                void refetch()
              }}
            />
          )}
          {editOpen && selected && (
            <BankReconciliationFormDialog
              open={editOpen}
              reconciliation={selected}
              onClose={() => setEditOpen(false)}
              onSuccess={() => {
                setEditOpen(false)
                void refetch()
              }}
            />
          )}
          <DeletedBankReconciliationsDialog
            open={deletedOpen}
            onClose={() => setDeletedOpen(false)}
            onChanged={() => { void refetch() }}
          />
        </>
      )}
    />
  )
}

export default BankReconciliationsPage
