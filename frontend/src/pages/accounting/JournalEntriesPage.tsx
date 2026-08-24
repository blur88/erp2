import { useMemo, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Box, Button } from '@mui/material'

import SimpleListPage from '@/components/common/SimpleListPage'
import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import PagePagination from '@/components/common/PagePagination'
import { StatusChip } from '@/components/common/StatusChip'
import { JOURNAL_SOURCE_TYPE_OPTIONS, JOURNAL_STATUS_OPTIONS } from '@/constants/filterOptions'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useListUrlState } from '@/hooks/useListUrlState'
import { useGetJournalEntriesQuery, type JournalEntryListParams } from '@/store/api/accountingApi'
import { withCurrentListQuery } from '@/utils/listQuery'
import { formatCurrency } from '@/utils/currency'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'
import { PAGINATION } from '@/constants/tableStyles'
import type { AccountingSourceType, JournalEntry, JournalEntryStatus } from '@/types'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'

interface JEFilters {
  search: string
  period: PeriodValue
  sourceType: AccountingSourceType | null
  status: JournalEntryStatus | null
}

const filterConfig: FilterBarConfig<JEFilters> = {
  search: { placeholder: 'Search by journal no., reference, or description...' },
  fields: [
    { field: 'period', label: 'Period', type: 'period' },
    { field: 'sourceType', label: 'Source Type', type: 'select',
      options: JOURNAL_SOURCE_TYPE_OPTIONS },
    { field: 'status', label: 'Status', type: 'select',
      options: JOURNAL_STATUS_OPTIONS },
  ],
  defaults: {
    search: '',
    period: { key: null, from: null, to: null },
    sourceType: null,
    status: null,
  },
}

export default function JournalEntriesPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { page, limit, sortBy, sortOrder, setPage, setLimit, setSort, resetPage } =
    useListUrlState({
      sort: { fields: ['journalNo'], defaultField: 'journalNo', defaultOrder: 'desc' },
    })

  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const { appliedFilters, draftFilters, handlers, hasActiveFilters } =
    useFilterBar(filterConfig, { onApply: resetPage })

  const weekStartsOn = getStartOfWeek()

  const dateRange = useMemo(() => {
    const period = appliedFilters.period
    if (!period || period.key === null) return { fromDate: undefined, toDate: undefined }
    if (period.key === 'custom') {
      return { fromDate: period.from ?? undefined, toDate: period.to ?? undefined }
    }
    const range = getPeriodDateRange(period.key, weekStartsOn)
    return { fromDate: range.from, toDate: range.to }
  }, [appliedFilters.period, weekStartsOn])

  const queryParams = useMemo(() => {
    const params: JournalEntryListParams = { page, limit }
    const search = appliedFilters.search.trim()
    if (search) params.search = search
    if (appliedFilters.sourceType) params.sourceType = appliedFilters.sourceType
    if (appliedFilters.status) params.status = appliedFilters.status
    if (dateRange.fromDate) params.fromDate = dateRange.fromDate
    if (dateRange.toDate) params.toDate = dateRange.toDate
    params.sortBy = sortBy
    params.sortOrder = sortOrder.toUpperCase() as 'ASC' | 'DESC'
    return params
  }, [page, limit, appliedFilters, dateRange, sortBy, sortOrder])

  const { data: response, isFetching, error } = useGetJournalEntriesQuery(queryParams)
  const rows = response?.data ?? []
  const total = response?.meta?.total ?? 0

  const handleView = (row: JournalEntry) => {
    navigate(withCurrentListQuery(`/accounting/journal-entries/${row.id}`))
  }

  const columns: ColumnConfig<JournalEntry>[] = [
    { key: 'journalNo', render: (row) => row.journalNo },
    { key: 'date', render: (row) => row.date },
    { key: 'sourceRef', render: (row) => row.sourceRef ?? '-' },
    { key: 'description', render: (row) => row.description ?? '-' },
    { key: 'debit', render: (row) => (row.debit !== '0.0000' ? formatCurrency(row.debit) : '—') },
    { key: 'credit', render: (row) => (row.credit !== '0.0000' ? formatCurrency(row.credit) : '—') },
    {
      key: 'status',
      raw: true,
      render: (row) => (
        <StatusChip
          status={row.status === 'Posted' ? 'active' : 'inactive'}
          label={row.status}
        />
      ),
    },
    {
      key: 'actions',
      raw: true,
      render: (row) => (
        <Button
          size="small"
          variant="text"
          onClick={(e) => {
            e.stopPropagation()
            handleView(row)
          }}
        >
          View
        </Button>
      ),
    },
  ]

  return (
    <SimpleListPage
      title="Journal Entries"
      subtitle="View posted journal entries."
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={handlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={searchInputRef}
      sort={{ field: 'journalNo', sortBy, sortOrder, onSort: setSort }}
      isFetching={isFetching}
      error={error ? 'Failed to load journal entries.' : null}
      tableSlot={(
        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <EntityTable
            rows={rows}
            columns={columns}
            loading={isFetching}
            total={total}
            label="Journal Entries"
            emptyLabel="journal entries"
            showHeader={false}
            focusedIndex={-1}
            onSelect={handleView}
            listRef={searchInputRef}
            headers={['Journal No.', 'Date', 'Source', 'Description', 'Debit', 'Credit', 'Status', 'Actions']}
            paginationSlot={
              total > 0 ? (
                <PagePagination
                  total={total}
                  page={page}
                  limit={limit}
                  onPageChange={setPage}
                  onLimitChange={setLimit}
                  pageSizeOptions={PAGINATION.options}
                />
              ) : undefined
            }
          />
        </Box>
      )}
    />
  )
}
