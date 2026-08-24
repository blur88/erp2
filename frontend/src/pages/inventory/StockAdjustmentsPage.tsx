import { useCallback, useMemo, useRef, useState } from 'react'
import { Box } from '@mui/material'
import { useLocation, useNavigate } from 'react-router-dom'

import PagePagination from '@/components/common/PagePagination'
import SimpleListPage from '@/components/common/SimpleListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useListUrlState } from '@/hooks/useListUrlState'
import { withCurrentListQuery } from '@/utils/listQuery'
import { useCompleteStockAdjustmentMutation, useGetStockAdjustmentsQuery } from '@/store/api/inventoryApi'
import { PAGINATION } from '@/constants/tableStyles'
import { STOCK_ADJUSTMENT_STATUS_OPTIONS } from '@/constants/filterOptions'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'
import { useNotification } from '@/hooks/useNotification'
import { rtkErrorMessage } from '@/utils/errorMessage'

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
    { field: 'status', label: 'Status', type: 'select', options: STOCK_ADJUSTMENT_STATUS_OPTIONS },
    { field: 'categoryId', label: 'Category', type: 'category' },
  ],
  defaults: { search: '', period: { key: null, from: null, to: null }, status: null, categoryId: null },
}

// Backend stock errors embed quantities like "1.0000" / "1.5000". Trim
// trailing-zero decimals for readability in the toast: 1.0000 → 1, 1.5000 → 1.5.
const tidyDecimals = (message: string): string =>
  message.replace(/(\d+)\.(\d*?)0+(?=\D|$)/g, (_, intPart, frac) => (frac ? `${intPart}.${frac}` : intPart))

export default function StockAdjustmentsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { sortBy, sortOrder, page, limit, setPage, setLimit, setSort, resetPage } =
    useListUrlState({
      sort: { fields: ['adjustmentDate'], defaultField: 'adjustmentDate', defaultOrder: 'desc' },
    })
  const [completeTarget, setCompleteTarget] = useState<string | null>(null)
  const [revertTarget, setRevertTarget] = useState<string | null>(null)

  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig, {
    onApply: resetPage,
  })
  const [completeAdjustment] = useCompleteStockAdjustmentMutation()
  const { showSuccess, showError } = useNotification()

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

  const completeTargetRow = allRows.find((r) => r.id === completeTarget) ?? null
  const revertTargetRow = allRows.find((r) => r.id === revertTarget) ?? null

  const handleConfirmComplete = useCallback(async () => {
    if (!completeTarget) return
    const name = completeTargetRow?.adjustmentNumber ?? ''
    try {
      await completeAdjustment(completeTarget).unwrap()
      showSuccess(`Stock adjustment ${name} completed`)
      setCompleteTarget(null)
    } catch (error) {
      showError(tidyDecimals(rtkErrorMessage(error, 'Failed to complete stock adjustment')))
    }
  }, [completeTarget, completeTargetRow, completeAdjustment, showSuccess, showError])

  const handleConfirmRevert = useCallback(() => {
    if (!revertTarget) return
    navigate(withCurrentListQuery(`/inventory/stock-adjustments/create?revertFrom=${revertTarget}`))
    setRevertTarget(null)
  }, [revertTarget, navigate])

  return (
    <SimpleListPage
      title="Stock Adjustments"
      subtitle="View and manage stock adjustment history"
      primaryAction={{ label: '+ New Adjustment', onClick: () => navigate(withCurrentListQuery('/inventory/stock-adjustments/create')) }}
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={handlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={searchInputRef}
      sort={{ field: 'adjustmentDate', sortBy, sortOrder, onSort: setSort }}
      isFetching={isFetching}
      error={error ? 'Failed to load stock adjustments.' : null}
      tableSlot={(
        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <StockAdjustmentList
            rows={pageRows}
            total={total}
            loading={isFetching}
            hasActiveFilters={hasActiveFilters}
            paginationSlot={(
              <PagePagination
                total={total}
                page={page}
                limit={limit}
                onPageChange={setPage}
                onLimitChange={setLimit}
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
