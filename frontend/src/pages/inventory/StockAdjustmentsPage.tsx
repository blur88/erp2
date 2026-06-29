import React, { useCallback, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  useGetStockAdjustmentsQuery,
} from '@/store/api/inventoryApi'
import type { StockAdjustment } from '@/types'
import { selectSelectedStockAdjustment, setSelectedStockAdjustment } from '@/store/slices/inventorySlice'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'

import StockAdjustmentList from './components/StockAdjustmentList'

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

  const handleSort = useCallback((field: string) => {
    setSorting((prev) => ({
      sortBy: field,
      sortOrder: prev.sortBy === field && prev.sortOrder === 'desc' ? 'asc' : 'desc',
    }))
  }, [])

  const handleSelect = useCallback(
    (adjustment: StockAdjustment) => {
      dispatch(setSelectedStockAdjustment(adjustment))
    },
    [dispatch],
  )

  const adjustmentListRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  return (
    <GenericListPage
      title="Stock Adjustments"
      subtitle="View and manage stock adjustment history"
      primaryAction={{ label: 'New Adjustment', onClick: () => navigate('/inventory/stock-adjustments/create') }}
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={handlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={searchInputRef}
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
          focusedAdjustmentIndex={0}
          onSelect={handleSelect}
          adjustmentListRef={adjustmentListRef}
        />
      )}
      headerSlot={null}
      workspaceSlot={null}
    />
  )
}

export default StockAdjustmentsPage
