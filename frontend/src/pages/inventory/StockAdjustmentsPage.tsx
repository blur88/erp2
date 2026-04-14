import React, { useCallback, useMemo } from 'react'
import { Alert, Box, useMediaQuery, useTheme } from '@mui/material'
import { useNavigate, useSearchParams } from 'react-router-dom'

import MasterDetailWorkspace from '@/components/common/MasterDetailWorkspace'
import PageHeader from '@/components/common/PageHeader'
import { FilterBar } from '@/components/filters'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useNotification } from '@/hooks/useNotification'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  useCompleteStockAdjustmentMutation,
  useDeleteStockAdjustmentMutation,
  useGetStockAdjustmentsQuery,
  useLazyGetStockAdjustmentQuery,
  useUncompleteStockAdjustmentMutation,
} from '@/store/api/inventoryApi'
import { selectSelectedStockAdjustment } from '@/store/slices/inventorySlice'
import type { FilterBarConfig } from '@/types/filterBar.types'

import StockAdjustmentContextHeader from './components/StockAdjustmentContextHeader'
import StockAdjustmentList from './components/StockAdjustmentList'
import StockAdjustmentWorkspaceCard from './components/StockAdjustmentWorkspaceCard'
import StockAdjustmentsDialogs from './components/StockAdjustmentsDialogs'
import { useStockAdjustmentsActions } from './hooks/useStockAdjustmentsActions'
import { useStockAdjustmentsPageState } from './hooks/useStockAdjustmentsPageState'
import { useStockAdjustmentsSelection } from './hooks/useStockAdjustmentsSelection'

interface StockAdjustmentFilters {
  search: string
  status: 'draft' | 'completed' | 'cancelled' | null
}

const StockAdjustmentsPage: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { showSuccess, showError } = useNotification()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedAdjustment = useAppSelector(selectSelectedStockAdjustment)
  const pageState = useStockAdjustmentsPageState()

  const filterConfig = useMemo<FilterBarConfig<StockAdjustmentFilters>>(
    () => ({
      search: { placeholder: 'Search by adjustment number or notes...' },
      fields: [
        { field: 'status', label: 'Status', type: 'stock-adjustment-status' },
      ],
      defaults: { search: '', status: null },
    }),
    [],
  )

  const filterBar = useFilterBar(filterConfig)

  const queryParams = useMemo(
    () => ({
      search: filterBar.appliedFilters.search || undefined,
      status: filterBar.appliedFilters.status ?? undefined,
      sortBy: pageState.sorting.sortBy,
      sortOrder: pageState.sorting.sortOrder.toUpperCase(),
    }),
    [filterBar.appliedFilters, pageState.sorting],
  )

  const {
    data: adjustmentsResponse,
    isFetching: loading,
    error: adjustmentsError,
    refetch: refetchAdjustments,
  } = useGetStockAdjustmentsQuery(queryParams)
  const [fetchStockAdjustmentById] = useLazyGetStockAdjustmentQuery()
  const [deleteStockAdjustment] = useDeleteStockAdjustmentMutation()
  const [completeStockAdjustment] = useCompleteStockAdjustmentMutation()
  const [uncompleteStockAdjustment] = useUncompleteStockAdjustmentMutation()

  const adjustments = adjustmentsResponse?.data || []
  const total = adjustmentsResponse?.meta?.total || 0
  const error = adjustmentsError && typeof adjustmentsError === 'object'
    ? ((adjustmentsError as any).data?.message || (adjustmentsError as any).data || 'Failed to fetch stock adjustments')
    : null

  const selection = useStockAdjustmentsSelection({
    dispatch,
    adjustments,
    selectedAdjustment,
    focusedAdjustmentIndex: pageState.focusedAdjustmentIndex,
    setFocusedAdjustmentIndex: pageState.setFocusedAdjustmentIndex,
    searchParams,
    setSearchParams,
    adjustmentListRef: pageState.adjustmentListRef,
    searchInputRef: pageState.searchInputRef,
    userHasNavigatedRef: pageState.userHasNavigatedRef,
    setJournalEntryRef: pageState.setJournalEntryRef,
    setJournalEntryRefLoading: pageState.setJournalEntryRefLoading,
  })

  const actions = useStockAdjustmentsActions({
    dispatch,
    navigate,
    selectedAdjustment,
    deleteStockAdjustment,
    completeStockAdjustment,
    uncompleteStockAdjustment,
    fetchStockAdjustmentById,
    refetchAdjustments,
    showSuccess,
    showError,
    setDeleteConfirmOpen: pageState.setDeleteConfirmOpen,
    setAdjustmentToDelete: pageState.setAdjustmentToDelete,
    setAdjustmentToDeleteName: pageState.setAdjustmentToDeleteName,
    setCompleteConfirmOpen: pageState.setCompleteConfirmOpen,
    setAdjustmentToComplete: pageState.setAdjustmentToComplete,
    setAdjustmentToCompleteName: pageState.setAdjustmentToCompleteName,
    setRevertConfirmOpen: pageState.setRevertConfirmOpen,
    setAdjustmentToRevert: pageState.setAdjustmentToRevert,
    setAdjustmentToRevertName: pageState.setAdjustmentToRevertName,
    setFocusedAdjustmentIndex: pageState.setFocusedAdjustmentIndex,
  })

  const handleSort = useCallback((field: string) => {
    pageState.setSorting((prev) => ({
      sortBy: field,
      sortOrder: prev.sortBy === field && prev.sortOrder === 'desc' ? 'asc' : 'desc',
    }))
  }, [pageState])

  const navigateToJournalEntry = useCallback(() => {
    if (!pageState.journalEntryRef) return
    navigate(
      `/accounting/journal-entries?sourceType=${pageState.journalEntryRef.sourceType}&sourceId=${pageState.journalEntryRef.sourceId}`,
    )
  }, [navigate, pageState.journalEntryRef])

  useKeyboardShortcuts({
    onSearch: selection.focusSearchInput,
    onArrowUp: selection.handleNavigateUp,
    onArrowDown: selection.handleNavigateDown,
  })

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PageHeader
        title="Stock Adjustments"
        subtitle="View and manage stock adjustment history"
        variant="workflow"
        secondaryAction={{ label: 'View Deleted', onClick: () => pageState.setShowDeletedDialog(true) }}
        primaryAction={{ label: 'New Adjustment', onClick: () => navigate('/inventory/stock-adjustments/create') }}
        toolbar={(
          <FilterBar
            config={filterConfig}
            draftFilters={filterBar.draftFilters}
            handlers={filterBar.handlers}
            hasActiveFilters={filterBar.hasActiveFilters}
            searchInputRef={pageState.searchInputRef}
            sort={{
              field: 'adjustmentNumber',
              sortBy: pageState.sorting.sortBy,
              sortOrder: pageState.sorting.sortOrder,
              onSort: handleSort,
            }}
          />
        )}
      />

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <MasterDetailWorkspace
        isMobile={isMobile}
        listSlot={(
          <StockAdjustmentList
            adjustments={adjustments}
            loading={loading}
            total={total}
            selectedAdjustmentId={selectedAdjustment?.id}
            focusedAdjustmentIndex={pageState.focusedAdjustmentIndex}
            onSelect={selection.handleAdjustmentSelect}
            adjustmentListRef={pageState.adjustmentListRef}
          />
        )}
        headerSlot={(
          <StockAdjustmentContextHeader
            selectedAdjustment={selectedAdjustment}
            journalEntryRef={pageState.journalEntryRef}
            journalEntryRefLoading={pageState.journalEntryRefLoading}
            onEdit={actions.handleEdit}
            onDelete={() => selectedAdjustment && actions.handleDelete(selectedAdjustment.id, selectedAdjustment.adjustmentNumber)}
            onComplete={() => selectedAdjustment && actions.handleComplete(selectedAdjustment.id, selectedAdjustment.adjustmentNumber)}
            onRevert={() => selectedAdjustment && actions.handleRevert(selectedAdjustment.id, selectedAdjustment.adjustmentNumber)}
            onNavigateToJournalEntry={navigateToJournalEntry}
          />
        )}
        workspaceSlot={<StockAdjustmentWorkspaceCard selectedAdjustment={selectedAdjustment} />}
      />

      <StockAdjustmentsDialogs
        showDeletedDialog={pageState.showDeletedDialog}
        onCloseDeletedDialog={() => pageState.setShowDeletedDialog(false)}
        deleteConfirmOpen={pageState.deleteConfirmOpen}
        adjustmentToDeleteName={pageState.adjustmentToDeleteName}
        onConfirmDelete={() => void actions.handleConfirmDelete(pageState.adjustmentToDelete)}
        onCancelDelete={actions.handleCancelDelete}
        completeConfirmOpen={pageState.completeConfirmOpen}
        adjustmentToCompleteName={pageState.adjustmentToCompleteName}
        onConfirmComplete={() => void actions.handleConfirmComplete(pageState.adjustmentToComplete)}
        onCancelComplete={actions.handleCancelComplete}
        revertConfirmOpen={pageState.revertConfirmOpen}
        adjustmentToRevertName={pageState.adjustmentToRevertName}
        onConfirmRevert={() => void actions.handleConfirmRevert(pageState.adjustmentToRevert)}
        onCancelRevert={actions.handleCancelRevert}
      />
    </Box>
  )
}

export default StockAdjustmentsPage
