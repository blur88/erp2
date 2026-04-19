import React, { useCallback, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Button, Stack } from '@mui/material'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as PostIcon } from '@mui/icons-material/PostAdd'

import AccountMappingWarning from '@/components/accounting/AccountMappingWarning'
import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useGetJournalEntriesQuery } from '@/store/api/accountingApi'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'

import { JournalEntryContextHeader } from './components/JournalEntryContextHeader'
import { JournalEntriesDialogs } from './components/JournalEntriesDialogs'
import { JournalEntriesTable } from './components/JournalEntriesTable'
import { JournalEntryWorkspaceCard } from './components/JournalEntryWorkspaceCard'
import { useJournalEntriesWorkspace } from './hooks/useJournalEntriesWorkspace'

interface JEFilters {
  search: string
  status: string | null
  entryType: string | null
  period: PeriodValue
}

const filterConfig: FilterBarConfig<JEFilters> = {
  search: { placeholder: 'Search by reference or description...' },
  fields: [
    { field: 'period', label: 'Period', type: 'period' },
    { field: 'status', label: 'Status', type: 'journal-entry-status' },
    { field: 'entryType', label: 'Entry Type', type: 'journal-entry-type' },
  ],
  defaults: {
    search: '',
    status: null,
    entryType: null,
    period: { key: null, from: null, to: null },
  },
}

const JournalEntriesPage: React.FC = () => {
  const location = useLocation()
  const [sortBy, setSortBy] = useState('createdAt')
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

  const urlParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const sourceTypeParam = urlParams.get('sourceType')
  const sourceIdParam = urlParams.get('sourceId')

  const queryArgs = useMemo(() => ({
    search: appliedFilters.search || undefined,
    status: appliedFilters.status ? appliedFilters.status.toUpperCase() : undefined,
    sourceType: sourceIdParam ? sourceTypeParam ?? undefined : appliedFilters.entryType || undefined,
    sourceId: sourceIdParam ?? undefined,
    startDate: dateRange.fromDate,
    endDate: dateRange.toDate,
    sortBy,
    sortOrder: sortOrder.toUpperCase() as 'ASC' | 'DESC',
  }), [appliedFilters, dateRange, sortBy, sortOrder, sourceTypeParam, sourceIdParam])

  const { data, isLoading, refetch } = useGetJournalEntriesQuery(queryArgs)
  const entries = data?.data ?? []
  const pagination = data?.meta
  const workspace = useJournalEntriesWorkspace(() => {
    void refetch()
  })

  const handleSort = useCallback((field: string) => {
    setSortOrder((prev) => (sortBy === field && prev === 'desc' ? 'asc' : 'desc'))
    setSortBy(field)
  }, [sortBy])

  return (
    <>
      <AccountMappingWarning context="system" />
      <GenericListPage
        title="Journal Entries"
        subtitle={`Manage and post accounting journal entries (${pagination?.total ?? 0} total)`}
        primaryAction={{ label: 'New Journal Entry', onClick: workspace.navigateToCreate }}
        filterConfig={filterConfig}
        draftFilters={draftFilters}
        handlers={handlers}
        hasActiveFilters={hasActiveFilters}
        searchInputRef={workspace.searchInputRef}
        sort={{ field: 'createdAt', sortBy, sortOrder, onSort: handleSort }}
        contentSlot={workspace.selectedIds.size > 0 ? (
          <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
            <Button size="small" variant="contained" startIcon={<PostIcon />} onClick={() => workspace.setBulkPostOpen(true)}>
              Post Selected ({workspace.selectedIds.size})
            </Button>
            <Button size="small" variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={() => workspace.setBulkDeleteOpen(true)}>
              Delete Selected ({workspace.selectedIds.size})
            </Button>
          </Stack>
        ) : null}
        listSlot={(
          <JournalEntriesTable
            entries={entries}
            loading={isLoading}
            total={pagination?.total ?? 0}
            selectedEntryId={workspace.selectedEntry?.id ?? null}
            selectedIds={workspace.selectedIds}
            onSelect={workspace.handleSelect}
            onToggleCheck={workspace.handleToggleCheck}
            onSelectAll={() => workspace.handleSelectAll(entries)}
            onPost={(entry) => workspace.setPostTarget(entry)}
            onDelete={(entry) => workspace.setDeleteTarget(entry)}
            listRef={workspace.listRef}
          />
        )}
        headerSlot={(
          <JournalEntryContextHeader
            selectedEntry={workspace.selectedEntry}
            isLoading={false}
            onEdit={() => workspace.selectedEntry && workspace.navigateToEdit(workspace.selectedEntry)}
            onPost={() => workspace.selectedEntry && workspace.setPostTarget(workspace.selectedEntry)}
            onReverse={() => workspace.selectedEntry && workspace.setReverseTarget(workspace.selectedEntry)}
            onDelete={() => workspace.selectedEntry && workspace.setDeleteTarget(workspace.selectedEntry)}
          />
        )}
        workspaceSlot={<JournalEntryWorkspaceCard selectedEntry={workspace.selectedEntry} />}
        dialogs={(
          <JournalEntriesDialogs
            postTarget={workspace.postTarget}
            deleteTarget={workspace.deleteTarget}
            reverseTarget={workspace.reverseTarget}
            bulkPostIds={workspace.bulkPostOpen ? workspace.selectedIds : new Set<string>()}
            bulkDeleteIds={workspace.bulkDeleteOpen ? workspace.selectedIds : new Set<string>()}
            actionLoading={workspace.actionLoading}
            onConfirmPost={workspace.handleConfirmPost}
            onConfirmDelete={workspace.handleConfirmDelete}
            onConfirmReverse={workspace.handleConfirmReverse}
            onConfirmBulkPost={workspace.handleBulkPost}
            onConfirmBulkDelete={workspace.handleBulkDelete}
            onCancelPost={() => workspace.setPostTarget(null)}
            onCancelDelete={() => workspace.setDeleteTarget(null)}
            onCancelReverse={() => workspace.setReverseTarget(null)}
            onCancelBulkPost={() => workspace.setBulkPostOpen(false)}
            onCancelBulkDelete={() => workspace.setBulkDeleteOpen(false)}
          />
        )}
      />
    </>
  )
}

export default JournalEntriesPage
