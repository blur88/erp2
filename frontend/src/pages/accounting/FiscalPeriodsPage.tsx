import React, { useMemo } from 'react'

import AccountMappingWarning from '@/components/accounting/AccountMappingWarning'
import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { useGetFiscalPeriodsQuery } from '@/store/api/accountingApi'
import { selectSelectedFiscalPeriod, setSelectedFiscalPeriod } from '@/store/slices/accountingSlice'
import { FiscalPeriodStatus } from '@/types'
import type { FilterBarConfig } from '@/types/filterBar.types'

import { FiscalPeriodContextHeader } from './components/FiscalPeriodContextHeader'
import { FiscalPeriodsDialogs } from './components/FiscalPeriodsDialogs'
import { FiscalPeriodsTable } from './components/FiscalPeriodsTable'
import { FiscalPeriodWorkspaceCard } from './components/FiscalPeriodWorkspaceCard'
import { useFiscalPeriodsWorkspace } from './hooks/useFiscalPeriodsWorkspace'

interface FiscalPeriodFilters {
  search: string
  status: string | null
}

const filterConfig: FilterBarConfig<FiscalPeriodFilters> = {
  search: { placeholder: 'Search by code or name...' },
  fields: [{ field: 'status', label: 'Status', type: 'fiscal-period-status' }],
  defaults: { search: '', status: null },
}

const FiscalPeriodsPage: React.FC = () => {
  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)

  const queryParams = useMemo(() => ({
    sortBy: 'startDate',
    sortOrder: 'DESC' as const,
    status: appliedFilters.status ? appliedFilters.status.toUpperCase() as FiscalPeriodStatus : undefined,
    search: appliedFilters.search || undefined,
  }), [appliedFilters.search, appliedFilters.status])

  const { data: periodsResponse, isLoading, refetch } = useGetFiscalPeriodsQuery(queryParams)
  const periods = periodsResponse?.data ?? []

  const dispatch = useAppDispatch()
  const selected = useAppSelector(selectSelectedFiscalPeriod)
  const workspace = useFiscalPeriodsWorkspace(() => { void refetch() }, periods, dispatch, selected)

  return (
    <>
      <AccountMappingWarning context="system" />
      <GenericListPage
        title="Fiscal Periods"
        subtitle="Manage accounting periods and year boundaries"
        primaryAction={{ label: 'Add Period', onClick: () => { dispatch(setSelectedFiscalPeriod(null)); workspace.setFormDialogOpen(true) } }}
        secondaryAction={{ label: 'Generate Periods', onClick: () => workspace.setGenerateDialogOpen(true) }}
        filterConfig={filterConfig}
        draftFilters={draftFilters}
        handlers={handlers}
        hasActiveFilters={hasActiveFilters}
        searchInputRef={workspace.searchInputRef}
        sort={{ field: 'startDate', sortBy: 'startDate', sortOrder: 'desc', onSort: () => {} }}
        listSlot={(
          <FiscalPeriodsTable
            periods={periods}
            loading={isLoading}
            total={periodsResponse?.meta?.total ?? periods.length}
            selectedId={selected?.id ?? null}
            focusedIndex={workspace.focusedIndex}
            onSelect={workspace.handleSelect}
            listRef={workspace.listRef}
          />
        )}
        headerSlot={(
          <FiscalPeriodContextHeader
            selected={selected}
            onClose={() => selected && workspace.setCloseTarget(selected)}
            onReopen={() => selected && workspace.setReopenTarget(selected)}
            onEdit={() => workspace.setFormDialogOpen(true)}
            onDelete={() => selected && workspace.setDeleteTarget(selected)}
          />
        )}
        workspaceSlot={<FiscalPeriodWorkspaceCard selected={selected} />}
        dialogs={(
          <FiscalPeriodsDialogs
            formDialogOpen={workspace.formDialogOpen}
            selected={selected}
            onCloseForm={() => workspace.setFormDialogOpen(false)}
            onFormSuccess={() => { workspace.setFormDialogOpen(false); void refetch() }}
            generateDialogOpen={workspace.generateDialogOpen}
            onCloseGenerate={() => workspace.setGenerateDialogOpen(false)}
            onGenerate={workspace.handleGenerate}
            deleteTarget={workspace.deleteTarget}
            closeTarget={workspace.closeTarget}
            reopenTarget={workspace.reopenTarget}
            onConfirmDelete={() => void workspace.handleDelete()}
            onConfirmClose={() => void workspace.handleClose()}
            onConfirmReopen={() => void workspace.handleReopen()}
            onCancelDelete={() => workspace.setDeleteTarget(null)}
            onCancelClose={() => workspace.setCloseTarget(null)}
            onCancelReopen={() => workspace.setReopenTarget(null)}
          />
        )}
      />
    </>
  )
}

export default FiscalPeriodsPage
