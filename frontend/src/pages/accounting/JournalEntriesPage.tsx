import React, { useCallback, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import AccountMappingWarning from '@/components/accounting/AccountMappingWarning'
import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useGetJournalEntriesQuery } from '@/store/api/accountingApi'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'

import { JournalEntryContextHeader } from './components/JournalEntryContextHeader'
import { JournalEntriesTable } from './components/JournalEntriesTable'
import { JournalEntryWorkspaceCard } from './components/JournalEntryWorkspaceCard'
import { useJournalEntriesWorkspace } from './hooks/useJournalEntriesWorkspace'

interface JEFilters {
  search: string
  status: string | null
  entryType: string | null
  period: PeriodValue
}

export const JournalEntriesPage: React.FC = () => {
  const [sortBy, setSortBy] = useState('createdAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const location = useLocation()
  const navigate = useNavigate()

  const filterConfig = useMemo<FilterBarConfig<JEFilters>>(
    () => ({
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
    }),
    [],
  )

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
  const idsParam = urlParams.get('ids')
  const hasUrlFilters = Boolean(sourceIdParam || idsParam)

  const queryArgs = useMemo(() => ({
    search: appliedFilters.search || undefined,
    status: appliedFilters.status ? appliedFilters.status.toUpperCase() : undefined,
    sourceType: sourceIdParam ? sourceTypeParam ?? undefined : appliedFilters.entryType || undefined,
    sourceId: sourceIdParam ?? undefined,
    ids: idsParam ?? undefined,
    startDate: dateRange.fromDate,
    endDate: dateRange.toDate,
    sortBy,
    sortOrder: sortOrder.toUpperCase() as 'ASC' | 'DESC',
  }), [appliedFilters, dateRange, sortBy, sortOrder, sourceTypeParam, sourceIdParam, idsParam])

  const { data, isLoading, refetch } = useGetJournalEntriesQuery(queryArgs)
  const entries = data?.data ?? []
  const pagination = data?.meta

  const workspace = useJournalEntriesWorkspace({ entries, refetch })

  const handleClearAll = useCallback(() => {
    handlers.onClearAll()
    if (hasUrlFilters) {
      navigate('/accounting/journal-entries', { replace: true })
    }
  }, [handlers, hasUrlFilters, navigate])

  const filterHandlers = useMemo(() => ({
    ...handlers,
    onClearAll: handleClearAll,
    onSearchChange: (value: string) => {
      handlers.onSearchChange(value)
      window.setTimeout(() => {
        workspace.searchInputRef.current?.focus()
      }, 0)
    },
  }), [handlers, handleClearAll, workspace])

  const handleSort = useCallback((field: string) => {
    setSortOrder((prev) => (sortBy === field && prev === 'desc' ? 'asc' : 'desc'))
    setSortBy(field)
  }, [sortBy])

  return (
    <>
      <AccountMappingWarning context="system" />
      <GenericListPage
        title="Journal Entries"
        subtitle="View accounting journal entries"
        filterConfig={filterConfig}
        draftFilters={draftFilters}
        handlers={filterHandlers}
        hasActiveFilters={hasActiveFilters || hasUrlFilters}
        searchInputRef={workspace.searchInputRef}
        sort={{ field: 'createdAt', sortBy, sortOrder, onSort: handleSort }}
        listSlot={(
          <JournalEntriesTable
            entries={entries}
            loading={isLoading}
            total={pagination?.total ?? 0}
            selectedEntryId={workspace.selectedEntry?.id ?? null}
            focusedIndex={workspace.focusedIndex}
            onSelect={workspace.handleSelect}
            listRef={workspace.listRef}
          />
        )}
        headerSlot={(
          <JournalEntryContextHeader
            selectedEntry={workspace.selectedEntry}
          />
        )}
        workspaceSlot={<JournalEntryWorkspaceCard selectedEntry={workspace.selectedEntry} />}
      />
    </>
  )
}

export default JournalEntriesPage
