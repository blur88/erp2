import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Button } from '@mui/material'

import SimpleListPage from '@/components/common/SimpleListPage'
import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import PagePagination from '@/components/common/PagePagination'
import { StatusChip } from '@/components/common/StatusChip'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useGetJournalEntriesQuery } from '@/store/api/accountingApi'
import { PAGINATION } from '@/constants/tableStyles'
import type { JournalEntry } from '@/types'

interface JEFilters {
  search: string
}

const filterConfig = {
  fields: [],
  defaults: { search: '' },
}

export default function JournalEntriesPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState<number>(PAGINATION.defaultPageSize)

  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)

  const { data: response, isFetching, error } = useGetJournalEntriesQuery({ page, limit })
  const rows = response?.data ?? []
  const total = response?.meta?.total ?? 0

  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit)
    setPage(1)
  }

  const handleView = (row: JournalEntry) => {
    navigate(`/accounting/journal-entries/${row.id}`)
  }

  const columns: ColumnConfig<JournalEntry>[] = [
    { key: 'journalNo', render: (row) => row.journalNo },
    { key: 'date', render: (row) => row.date },
    { key: 'sourceRef', render: (row) => row.sourceRef ?? '-' },
    { key: 'description', render: (row) => row.description ?? '-' },
    { key: 'debit', render: (row) => row.debit },
    { key: 'credit', render: (row) => row.credit },
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
      filterConfig={filterConfig as any}
      draftFilters={draftFilters}
      handlers={handlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={searchInputRef}
      sort={{ field: '', sortBy: '', sortOrder: 'asc', onSort: () => {} }}
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
                  onLimitChange={handleLimitChange}
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
