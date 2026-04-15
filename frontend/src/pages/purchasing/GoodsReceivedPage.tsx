import React, { useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { useGetGoodsReceivedNotesQuery } from '@/store/api/purchasingApi'
import { selectSelectedGRN } from '@/store/slices/purchasingSlice'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'

import GRNContextHeader from './components/GRNContextHeader'
import GRNDialogs from './components/GRNDialogs'
import GRNTable from './components/GRNTable'
import GRNWorkspaceCard from './components/GRNWorkspaceCard'
import { useGRNPageState } from './hooks/grnPageState'
import { useGRNSelection } from './hooks/grnSelection'

interface GRNFilters {
  search: string
  supplierId: string | null
  period: PeriodValue
  status: 'draft' | 'received' | null
}

export const GoodsReceivedPage: React.FC = () => {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const [searchParams, setSearchParams] = useSearchParams()
  const pageState = useGRNPageState()
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
    sortBy: pageState.sorting.sortBy,
    sortOrder: pageState.sorting.sortOrder.toUpperCase(),
    search: filterBar.appliedFilters.search || undefined,
    supplierId: filterBar.appliedFilters.supplierId || undefined,
    status: filterBar.appliedFilters.status || undefined,
    receivedDateFrom: dateRange.fromDate,
    receivedDateTo: dateRange.toDate,
  }), [dateRange, filterBar.appliedFilters, pageState.sorting])

  const {
    data: grnsResponse,
    isFetching: loading,
    error: grnsError,
  } = useGetGoodsReceivedNotesQuery(queryParams)

  const grns = grnsResponse?.data || []
  const total = grnsResponse?.meta?.total || 0
  const error = grnsError && typeof grnsError === 'object'
    ? ((grnsError as any).data?.message || (grnsError as any).data || 'Failed to fetch goods received notes')
    : null

  const selection = useGRNSelection({
    dispatch,
    grns,
    selectedGRN,
    focusedGRNIndex: pageState.focusedGRNIndex,
    setFocusedGRNIndex: pageState.setFocusedGRNIndex,
    searchParams,
    setSearchParams,
    grnListRef: pageState.grnListRef,
    searchInputRef: pageState.searchInputRef,
    userHasNavigatedRef: pageState.userHasNavigatedRef,
    setJournalEntryRef: pageState.setJournalEntryRef,
    setJournalEntryRefLoading: pageState.setJournalEntryRefLoading,
  })

  const handleSort = useCallback((field: string) => {
    pageState.setSorting((prev) => ({
      ...prev,
      sortBy: field,
      sortOrder: prev.sortBy === field && prev.sortOrder === 'desc' ? 'asc' : 'desc',
    }))
  }, [pageState])

  useKeyboardShortcuts({
    onSearch: selection.focusSearchInput,
    onArrowUp: selection.handleNavigateUp,
    onArrowDown: selection.handleNavigateDown,
  })

  const navigateToJournalEntry = useCallback(() => {
    if (!pageState.journalEntryRef) return
    navigate(
      `/accounting/journal-entries?sourceType=${pageState.journalEntryRef.sourceType}&sourceId=${pageState.journalEntryRef.sourceId}`,
    )
  }, [navigate, pageState.journalEntryRef])

  return (
    <GenericListPage
      title="Goods Received Notes"
      subtitle="Track and manage goods received from suppliers"
      secondaryAction={{ label: 'View Deleted', onClick: () => pageState.setDeletedGRNsOpen(true) }}
      filterConfig={filterConfig}
      draftFilters={filterBar.draftFilters}
      handlers={filterBar.handlers}
      hasActiveFilters={filterBar.hasActiveFilters}
      searchInputRef={pageState.searchInputRef}
      sort={{
        field: 'grnNumber',
        sortBy: pageState.sorting.sortBy,
        sortOrder: pageState.sorting.sortOrder,
        onSort: handleSort,
      }}
      error={error}
      listSlot={(
        <GRNTable
          grns={grns}
          loading={loading}
          total={total}
          selectedGRNId={selectedGRN?.id}
          focusedGRNIndex={pageState.focusedGRNIndex}
          onGRNSelect={selection.handleGRNSelect}
          grnListRef={pageState.grnListRef}
        />
      )}
      headerSlot={(
        <GRNContextHeader
          selectedGRN={selectedGRN}
          journalEntryRef={pageState.journalEntryRef}
          journalEntryRefLoading={pageState.journalEntryRefLoading}
          onPrint={() => pageState.setPrintDialogOpen(true)}
          onNavigateToJournalEntry={navigateToJournalEntry}
        />
      )}
      workspaceSlot={<GRNWorkspaceCard selectedGRN={selectedGRN} />}
      dialogs={(
        <GRNDialogs
          selectedGRN={selectedGRN}
          deletedGRNsOpen={pageState.deletedGRNsOpen}
          onCloseDeletedGRNs={() => pageState.setDeletedGRNsOpen(false)}
          printDialogOpen={pageState.printDialogOpen}
          onClosePrintDialog={() => pageState.setPrintDialogOpen(false)}
        />
      )}
    />
  )
}

export default GoodsReceivedPage
