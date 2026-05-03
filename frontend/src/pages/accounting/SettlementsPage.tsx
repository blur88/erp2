import React, { useCallback, useMemo, useState } from 'react'

import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useCreateSettlementMutation, useGetPendingSettlementSummaryQuery, useGetSettlementsQuery } from '@/store/api/accountingApi'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'

import { SettlementContextHeader } from './components/SettlementContextHeader'
import { SettlementsDialogs } from './components/SettlementsDialogs'
import { SettlementsTable } from './components/SettlementsTable'
import { SettlementWorkspaceCard } from './components/SettlementWorkspaceCard'
import { useSettlementsWorkspace } from './hooks/useSettlementsWorkspace'

interface SettlementFilters {
  search: string
  status: string | null
  period: PeriodValue
}

const filterConfig: FilterBarConfig<SettlementFilters> = {
  search: { placeholder: 'Search settlements...' },
  fields: [
    { field: 'period', label: 'Period', type: 'period' },
    { field: 'status', label: 'Status', type: 'settlement-status' },
  ],
  defaults: { search: '', status: null, period: { key: null, from: null, to: null } },
}

const SettlementsPage: React.FC = () => {
  const [sortBy, setSortBy] = useState('settlementDate')
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

  const { data: settlementsResponse, isLoading, refetch } = useGetSettlementsQuery({ page: 1, status: appliedFilters.status || undefined, startDate: dateRange.fromDate, endDate: dateRange.toDate })
  useGetPendingSettlementSummaryQuery()
  const [createSettlement] = useCreateSettlementMutation()

  const settlements = useMemo(() => {
    const rows = settlementsResponse?.data ?? []
    const term = appliedFilters.search.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) => [row.settlementNumber, row.reference, row.notes, row.paymentMethod?.name].filter(Boolean).join(' ').toLowerCase().includes(term))
  }, [appliedFilters.search, settlementsResponse?.data])

  const workspace = useSettlementsWorkspace(settlements, () => { void refetch() })

  const filterHandlers = useMemo(() => ({
    ...handlers,
    onSearchChange: (value: string) => {
      handlers.onSearchChange(value)
      workspace.setShouldPreserveSearchFocus(true)
    },
  }), [handlers, workspace])

  const handleSort = useCallback((field: string) => {
    setSortOrder((prev) => (sortBy === field && prev === 'desc' ? 'asc' : 'desc'))
    setSortBy(field)
  }, [sortBy])

  const onCreate = async (data: { paymentMethodId: string; settlementDate: string; paymentIds: string[]; reference?: string; notes?: string }) => {
    await createSettlement(data).unwrap()
    workspace.setDialogOpen(false)
    void refetch()
  }

  return (
    <GenericListPage
      title="Settlements"
      subtitle="Settle pending payments by payment method"
      primaryAction={{ label: 'Create Settlement', onClick: () => workspace.setDialogOpen(true) }}
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={filterHandlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={workspace.searchInputRef}
      sort={{ field: 'settlementDate', sortBy, sortOrder, onSort: handleSort }}
      listSlot={(
        <SettlementsTable
          settlements={settlements}
          loading={isLoading}
          total={settlements.length}
          selectedId={workspace.selected?.id ?? null}
          focusedIndex={workspace.focusedIndex}
          onSelect={workspace.handleSelect}
          listRef={workspace.listRef}
        />
      )}
      headerSlot={(
        <SettlementContextHeader
          selected={workspace.selected}
          onCancel={() => workspace.selected && workspace.setCancelTarget(workspace.selected)}
        />
      )}
      workspaceSlot={<SettlementWorkspaceCard selected={workspace.selected} />}
      dialogs={(
        <SettlementsDialogs
          dialogOpen={workspace.dialogOpen}
          onCloseDialog={() => workspace.setDialogOpen(false)}
          onCreate={onCreate}
          cancelTarget={workspace.cancelTarget}
          onConfirmCancel={() => void workspace.handleConfirmCancel()}
          onCancelCancel={() => workspace.setCancelTarget(null)}
        />
      )}
    />
  )
}

export default SettlementsPage
