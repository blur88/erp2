import React, { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  useGetStockAdjustmentsQuery,
} from '@/store/api/inventoryApi'
import { selectSelectedStockAdjustment } from '@/store/slices/inventorySlice'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'

import StockAdjustmentContextHeader from './components/StockAdjustmentContextHeader'
import StockAdjustmentList from './components/StockAdjustmentList'
import StockAdjustmentWorkspaceCard from './components/StockAdjustmentWorkspaceCard'
import StockAdjustmentsDialogs from './components/StockAdjustmentsDialogs'
import { useStockAdjustmentsWorkspace } from './hooks/useStockAdjustmentsWorkspace'

interface StockAdjustmentFilters {
  search: string
  period: PeriodValue
  status: 'draft' | 'completed' | 'cancelled' | null
}

interface StockAdjustmentsSortingState {
  sortBy: string
  sortOrder: 'asc' | 'desc'
}

const StockAdjustmentsPage: React.FC = () => {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const selectedAdjustment = useAppSelector(selectSelectedStockAdjustment)
  const [sorting, setSorting] = useState<StockAdjustmentsSortingState>({
    sortBy: 'adjustmentNumber',
    sortOrder: 'asc',
  })

  const filterConfig = useMemo<FilterBarConfig<StockAdjustmentFilters>>(
    () => ({
      search: { placeholder: 'Search by adjustment number or notes...' },
      fields: [
        { field: 'period', label: 'Period', type: 'period' },
        { field: 'status', label: 'Status', type: 'stock-adjustment-status' },
      ],
      defaults: { search: '', period: { key: null, from: null, to: null }, status: null },
    }),
    [],
  )

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)
  const weekStartsOn = getStartOfWeek()
  const dateRange = useMemo(() => {
    const period = appliedFilters.period

    if (!period || period.key === null) {
      return { fromDate: undefined, toDate: undefined }
    }

    if (period.key === 'custom') {
      return { fromDate: period.from ?? undefined, toDate: period.to ?? undefined }
    }

    const range = getPeriodDateRange(period.key, weekStartsOn)
    return { fromDate: range.from, toDate: range.to }
  }, [appliedFilters.period, weekStartsOn])

  const queryParams = useMemo(
    () => ({
      search: appliedFilters.search || undefined,
      status: appliedFilters.status ?? undefined,
      fromDate: dateRange.fromDate,
      toDate: dateRange.toDate,
      sortBy: sorting.sortBy,
      sortOrder: sorting.sortOrder.toUpperCase(),
    }),
    [appliedFilters, dateRange, sorting],
  )

  const {
    data: adjustmentsResponse,
    isFetching: loading,
    error: adjustmentsError,
    refetch: refetchAdjustments,
  } = useGetStockAdjustmentsQuery(queryParams)

  const adjustments = adjustmentsResponse?.data || []
  const total = adjustmentsResponse?.meta?.total || 0
  const error = adjustmentsError && typeof adjustmentsError === 'object'
    ? ((adjustmentsError as any).data?.message || (adjustmentsError as any).data || 'Failed to fetch stock adjustments')
    : null

  const workspace = useStockAdjustmentsWorkspace({
    dispatch,
    adjustments,
    selectedAdjustment,
    refetchAdjustments: () => void refetchAdjustments(),
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
      title="Stock Adjustments"
      subtitle="View and manage stock adjustment history"
      secondaryAction={{ label: 'View Deleted', onClick: () => workspace.setShowDeletedDialog(true) }}
      primaryAction={{ label: 'New Adjustment', onClick: () => navigate('/inventory/stock-adjustments/create') }}
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={handlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={workspace.searchInputRef}
      sort={{
        field: 'adjustmentNumber',
        sortBy: sorting.sortBy,
        sortOrder: sorting.sortOrder,
        onSort: handleSort,
      }}
      error={error}
      listSlot={(
        <StockAdjustmentList
          adjustments={adjustments}
          loading={loading}
          total={total}
          selectedAdjustmentId={selectedAdjustment?.id}
          focusedAdjustmentIndex={workspace.focusedIndex}
          onSelect={workspace.handleSelect}
          adjustmentListRef={workspace.listRef}
        />
      )}
      headerSlot={(
        <StockAdjustmentContextHeader
          selectedAdjustment={selectedAdjustment}
          journalEntryRef={workspace.journalEntryRef}
          journalEntryRefLoading={workspace.journalEntryRefLoading}
          onEdit={workspace.handleEdit}
          onDelete={() => selectedAdjustment && workspace.handleDelete(selectedAdjustment.id, selectedAdjustment.adjustmentNumber)}
          onComplete={() => selectedAdjustment && workspace.handleComplete(selectedAdjustment.id, selectedAdjustment.adjustmentNumber)}
          onRevert={() => selectedAdjustment && workspace.handleRevert(selectedAdjustment.id, selectedAdjustment.adjustmentNumber)}
          onNavigateToJournalEntry={navigateToJournalEntry}
        />
      )}
      workspaceSlot={<StockAdjustmentWorkspaceCard selectedAdjustment={selectedAdjustment} />}
      dialogs={(
        <StockAdjustmentsDialogs
          showDeletedDialog={workspace.showDeletedDialog}
          onCloseDeletedDialog={() => workspace.setShowDeletedDialog(false)}
          deleteConfirmOpen={workspace.deleteConfirmOpen}
          adjustmentToDeleteName={workspace.adjustmentToDeleteName}
          onConfirmDelete={() => void workspace.handleConfirmDelete(workspace.adjustmentToDelete)}
          onCancelDelete={workspace.handleCancelDelete}
          completeConfirmOpen={workspace.completeConfirmOpen}
          adjustmentToCompleteName={workspace.adjustmentToCompleteName}
          onConfirmComplete={() => void workspace.handleConfirmComplete(workspace.adjustmentToComplete)}
          onCancelComplete={workspace.handleCancelComplete}
          revertConfirmOpen={workspace.revertConfirmOpen}
          adjustmentToRevertName={workspace.adjustmentToRevertName}
          onConfirmRevert={() => void workspace.handleConfirmRevert(workspace.adjustmentToRevert)}
          onCancelRevert={workspace.handleCancelRevert}
        />
      )}
    />
  )
}

export default StockAdjustmentsPage
