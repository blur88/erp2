import React, { useCallback, useMemo, useState } from 'react'

import BankReconciliationFormDialog from '@/components/accounting/BankReconciliationFormDialog'
import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useGetBankReconciliationsQuery } from '@/store/api/accountingApi'
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
}

const filterConfig: FilterBarConfig<BRFilters> = {
  search: { placeholder: 'Search reconciliations...' },
  fields: [
    { field: 'period', label: 'Period', type: 'period' },
    { field: 'status', label: 'Status', type: 'bank-reconciliation-status' },
  ],
  defaults: {
    search: '',
    status: null,
    period: { key: null, from: null, to: null },
  },
}

const BankReconciliationsPage: React.FC = () => {
  const [createOpen, setCreateOpen] = useState(false)
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
    sortBy,
    sortOrder: sortOrder.toUpperCase() as 'ASC' | 'DESC',
  })
  const reconciliations = data?.data ?? []
  const total = data?.meta?.total ?? 0

  const workspace = useBankReconciliationsWorkspace({
    reconciliations,
    refetch: () => {
      void refetch()
    },
  })

  const handleSort = useCallback((field: string) => {
    setSortOrder((prev) => (sortBy === field && prev === 'desc' ? 'asc' : 'desc'))
    setSortBy(field)
  }, [sortBy])

  const filterHandlers = useMemo(() => ({
    ...handlers,
    onSearchChange: (value: string) => {
      handlers.onSearchChange(value)
      window.setTimeout(() => {
        workspace.searchInputRef.current?.focus()
      }, 0)
    },
  }), [handlers, workspace])

  return (
    <GenericListPage
      title="Bank Reconciliations"
      subtitle="Reconcile bank accounts with your ledger"
      primaryAction={{ label: 'New Reconciliation', onClick: () => setCreateOpen(true) }}
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
          selectedId={workspace.selected?.id ?? null}
          focusedIndex={workspace.focusedIndex}
          onSelect={workspace.handleSelect}
          listRef={workspace.listRef}
        />
      )}
      headerSlot={(
        <BankReconciliationContextHeader
          selected={workspace.selected}
          onComplete={() => workspace.selected && workspace.setCompleteTarget(workspace.selected)}
          onReopen={() => workspace.selected && workspace.setReopenTarget(workspace.selected)}
          onDelete={() => workspace.selected && workspace.setDeleteTarget(workspace.selected)}
        />
      )}
      workspaceSlot={(
        <BankReconciliationWorkspaceCard
          selected={workspace.selected}
          onToggleCleared={workspace.handleToggleCleared}
        />
      )}
      dialogs={(
        <>
          <BankReconciliationsDialogs
            completeTarget={workspace.completeTarget}
            reopenTarget={workspace.reopenTarget}
            deleteTarget={workspace.deleteTarget}
            actionLoading={workspace.actionLoading}
            onConfirmComplete={workspace.handleConfirmComplete}
            onConfirmReopen={workspace.handleConfirmReopen}
            onConfirmDelete={workspace.handleConfirmDelete}
            onCancelComplete={() => workspace.setCompleteTarget(null)}
            onCancelReopen={() => workspace.setReopenTarget(null)}
            onCancelDelete={() => workspace.setDeleteTarget(null)}
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
        </>
      )}
    />
  )
}

export default BankReconciliationsPage
