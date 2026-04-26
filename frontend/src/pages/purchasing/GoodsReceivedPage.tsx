import React, { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { useGetGoodsReceivedNotesQuery } from '@/store/api/purchasingApi'
import { selectSelectedGRN } from '@/store/slices/purchasingSlice'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'

import GRNContextHeader from './components/GRNContextHeader'
import GRNDialogs from './components/GRNDialogs'
import GRNTable from './components/GRNTable'
import GRNWorkspaceCard from './components/GRNWorkspaceCard'
import { useGRNWorkspace } from './hooks/useGRNWorkspace'

interface GRNFilters {
  search: string
  supplierId: string | null
  period: PeriodValue
  status: 'draft' | 'received' | null
}

interface GRNSortingState {
  sortBy: string
  sortOrder: 'asc' | 'desc'
}

export const GoodsReceivedPage: React.FC = () => {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const [sorting, setSorting] = useState<GRNSortingState>({
    sortBy: 'grnNumber',
    sortOrder: 'asc',
  })
  const selectedGRN = useAppSelector(selectSelectedGRN)

  const filterConfig = useMemo<FilterBarConfig<GRNFilters>>(
    () => ({
      search: { placeholder: 'Search goods received notes...' },
      fields: [
        { field: 'period', label: 'Period', type: 'period' },
        { field: 'supplierId', label: 'Supplier', type: 'supplier' },
        { field: 'status', label: 'Status', type: 'purchasing-status' },
      ],
      defaults: {
        search: '',
        supplierId: null,
        period: { key: null, from: null, to: null },
        status: null,
      },
    }),
    [],
  )

  const filterBar = useFilterBar(filterConfig)
  const weekStartsOn = getStartOfWeek()

  const dateRange = useMemo(() => {
    const period = filterBar.appliedFilters.period
    if (!period || period.key === null) return { fromDate: undefined, toDate: undefined }
    if (period.key === 'custom') return { fromDate: period.from ?? undefined, toDate: period.to ?? undefined }
    const range = getPeriodDateRange(period.key, weekStartsOn)
    return { fromDate: range.from, toDate: range.to }
  }, [filterBar.appliedFilters.period, weekStartsOn])

  const queryParams = useMemo(() => ({
    sortBy: sorting.sortBy,
    sortOrder: sorting.sortOrder.toUpperCase(),
    search: filterBar.appliedFilters.search || undefined,
    supplierId: filterBar.appliedFilters.supplierId || undefined,
    status: filterBar.appliedFilters.status || undefined,
    receivedDateFrom: dateRange.fromDate,
    receivedDateTo: dateRange.toDate,
  }), [dateRange, filterBar.appliedFilters, sorting])

  const {
    data: grnsResponse,
    isFetching: loading,
    error: grnsError,
    refetch,
  } = useGetGoodsReceivedNotesQuery(queryParams)

  const grns = grnsResponse?.data || []
  const total = grnsResponse?.meta?.total || 0
  const error = grnsError && typeof grnsError === 'object'
    ? ((grnsError as any).data?.message || (grnsError as any).data || 'Failed to fetch goods received notes')
    : null

  const workspace = useGRNWorkspace({
    dispatch,
    grns,
    selectedGRN,
    refetch: () => void refetch(),
    sorting,
    setSorting,
  })

  const handleSort = useCallback((field: string) => {
    setSorting((prev) => ({
      sortBy: field,
      sortOrder: prev.sortBy === field && prev.sortOrder === 'desc' ? 'asc' : 'desc',
    }))
  }, [])

  const navigateToJournalEntry = useCallback(() => {
    if (!workspace.journalEntryRef) return
    navigate(
      `/accounting/journal-entries?sourceType=${workspace.journalEntryRef.sourceType}&sourceId=${workspace.journalEntryRef.sourceId}`,
    )
  }, [navigate, workspace.journalEntryRef])

  return (
    <GenericListPage
      title="Goods Received Notes"
      subtitle="Track and manage goods received from suppliers"
      secondaryAction={{ label: 'View Deleted', onClick: () => workspace.setDeletedGRNsOpen(true) }}
      filterConfig={filterConfig}
      draftFilters={filterBar.draftFilters}
      handlers={filterBar.handlers}
      hasActiveFilters={filterBar.hasActiveFilters}
      searchInputRef={workspace.searchInputRef}
      sort={{
        field: 'grnNumber',
        sortBy: sorting.sortBy,
        sortOrder: sorting.sortOrder,
        onSort: handleSort,
      }}
      error={error}
      listSlot={(
        <GRNTable
          grns={grns}
          loading={loading}
          total={total}
          selectedGRNId={selectedGRN?.id}
          focusedGRNIndex={workspace.focusedIndex}
          onGRNSelect={workspace.handleSelect}
          grnListRef={workspace.listRef}
        />
      )}
      headerSlot={(
        <GRNContextHeader
          selectedGRN={selectedGRN}
          journalEntryRef={workspace.journalEntryRef}
          journalEntryRefLoading={workspace.journalEntryRefLoading}
          onPrint={() => workspace.setPrintDialogOpen(true)}
          onNavigateToJournalEntry={navigateToJournalEntry}
        />
      )}
      workspaceSlot={<GRNWorkspaceCard selectedGRN={selectedGRN} />}
      dialogs={(
        <GRNDialogs
          selectedGRN={selectedGRN}
          deletedGRNsOpen={workspace.deletedGRNsOpen}
          onCloseDeletedGRNs={() => workspace.setDeletedGRNsOpen(false)}
          printDialogOpen={workspace.printDialogOpen}
          onClosePrintDialog={() => workspace.setPrintDialogOpen(false)}
        />
      )}
    />
  )
}

export default GoodsReceivedPage
