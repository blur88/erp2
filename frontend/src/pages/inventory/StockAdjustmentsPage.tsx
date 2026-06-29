import { useCallback, useMemo, useRef, useState } from 'react'
import { Box } from '@mui/material'
import { useNavigate } from 'react-router-dom'

import PagePagination from '@/components/common/PagePagination'
import SimpleListPage from '@/components/common/SimpleListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useCompleteStockAdjustmentMutation, useGetStockAdjustmentsQuery } from '@/store/api/inventoryApi'
import { PAGINATION } from '@/constants/tableStyles'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'

import StockAdjustmentList from './components/StockAdjustmentList'
import StockAdjustmentsDialogs from './components/StockAdjustmentsDialogs'

interface StockAdjustmentFilters {
  search: string
  period: PeriodValue
  status: 'draft' | 'completed' | null
  categoryId: string | null
}

const filterConfig: FilterBarConfig<StockAdjustmentFilters> = {
  search: { placeholder: 'Search by adjustment number, notes, or product name...' },
  fields: [
    { field: 'period', label: 'Period', type: 'period' },
    { field: 'status', label: 'Status', type: 'stock-adjustment-status' },
    { field: 'categoryId', label: 'Category', type: 'category' },
  ],
  defaults: { search: '', period: { key: null, from: null, to: null }, status: null, categoryId: null },
}

export default function StockAdjustmentsPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState<number>(PAGINATION.defaultPageSize)
  const [sortBy, setSortBy] = useState('adjustmentNumber')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [completeTarget, setCompleteTarget] = useState<string | null>(null)
  const [revertTarget, setRevertTarget] = useState<string | null>(null)

  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)
  const [completeAdjustment] = useCompleteStockAdjustmentMutation()

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

  const queryParams = useMemo(() => ({
    search: appliedFilters.search || undefined,
    status: appliedFilters.status ?? undefined,
    categoryId: appliedFilters.categoryId ?? undefined,
    fromDate: dateRange.fromDate,
    toDate: dateRange.toDate,
    sortBy,
    sortOrder: sortOrder.toUpperCase(),
  }), [appliedFilters, dateRange, sortBy, sortOrder])

  const { data: response, isFetching, error } = useGetStockAdjustmentsQuery(queryParams as Record<string, unknown>)
  const allRows = response?.data ?? []
  const total = allRows.length
  const pageRows = allRows.slice((page - 1) * limit, page * limit)

  const handleSort = useCallback((field: string) => {
    setSortOrder((prev) => (sortBy === field && prev === 'desc' ? 'asc' : 'desc'))
    setSortBy(field)
    setPage(1)
  }, [sortBy])

  const handleLimitChange = useCallback((newLimit: number) => {
    setLimit(newLimit)
    setPage(1)
  }, [])

  const completeTargetRow = allRows.find((r) => r.id === completeTarget) ?? null
  const revertTargetRow = allRows.find((r) => r.id === revertTarget) ?? null

  const handleConfirmComplete = useCallback(async () => {
    if (!completeTarget) return
    try {
      await completeAdjustment(completeTarget).unwrap()
    } catch {
      // error handled by api layer
    } finally {
      setCompleteTarget(null)
    }
  }, [completeTarget, completeAdjustment])

  const handleConfirmRevert = useCallback(() => {
    if (!revertTarget) return
    navigate(`/inventory/stock-adjustments/create?revertFrom=${revertTarget}`)
    setRevertTarget(null)
  }, [revertTarget, navigate])

  return (
    <SimpleListPage
      title="Stock Adjustments"
      subtitle="View and manage stock adjustment history"
      primaryAction={{ label: '+ New Adjustment', onClick: () => navigate('/inventory/stock-adjustments/create') }}
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={handlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={searchInputRef}
      sort={{ field: 'adjustmentNumber', sortBy, sortOrder, onSort: handleSort }}
      isFetching={isFetching}
      error={error ? 'Failed to load stock adjustments.' : null}
      tableSlot={(
        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <StockAdjustmentList
            rows={pageRows}
            total={total}
            loading={isFetching}
            paginationSlot={(
              <PagePagination
                total={total}
                page={page}
                limit={limit}
                onPageChange={setPage}
                onLimitChange={handleLimitChange}
                pageSizeOptions={PAGINATION.options}
              />
            )}
            onComplete={(a) => setCompleteTarget(a.id)}
            onRevert={(a) => setRevertTarget(a.id)}
          />
        </Box>
      )}
      dialogs={(
        <StockAdjustmentsDialogs
          completeConfirmOpen={!!completeTarget}
          adjustmentToCompleteName={completeTargetRow?.adjustmentNumber ?? ''}
          onConfirmComplete={handleConfirmComplete}
          onCancelComplete={() => setCompleteTarget(null)}
          revertConfirmOpen={!!revertTarget}
          adjustmentToRevertName={revertTargetRow?.adjustmentNumber ?? ''}
          onConfirmRevert={handleConfirmRevert}
          onCancelRevert={() => setRevertTarget(null)}
        />
      )}
    />
  )
}
