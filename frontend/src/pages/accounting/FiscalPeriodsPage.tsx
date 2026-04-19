import React, { useMemo } from 'react'

import AccountMappingWarning from '@/components/accounting/AccountMappingWarning'
import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useGetFiscalPeriodsQuery } from '@/store/api/accountingApi'
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
  const { data: periodsResponse, isLoading, refetch } = useGetFiscalPeriodsQuery({ page: 1, sortBy: 'startDate', sortOrder: 'DESC', status: appliedFilters.status ? appliedFilters.status.toUpperCase() as FiscalPeriodStatus : undefined, search: appliedFilters.search || undefined })
  const periods = periodsResponse?.data ?? []
  const workspace = useFiscalPeriodsWorkspace(() => { void refetch() })

  return (
    <>
      <AccountMappingWarning context="system" />
      <GenericListPage
        title="Fiscal Periods"
        subtitle="Manage accounting periods and year boundaries"
        primaryAction={{ label: 'Add Period', onClick: () => { workspace.setSelected(null); workspace.setFormDialogOpen(true) } }}
        secondaryAction={{ label: 'Generate Periods', onClick: () => workspace.setGenerateDialogOpen(true) }}
        filterConfig={filterConfig}
        draftFilters={draftFilters}
        handlers={handlers}
        hasActiveFilters={hasActiveFilters}
        searchInputRef={workspace.searchInputRef}
        sort={{ field: 'startDate', sortBy: 'startDate', sortOrder: 'desc', onSort: () => {} }}
        listSlot={<FiscalPeriodsTable periods={periods} loading={isLoading} selectedId={workspace.selected?.id ?? null} onSelect={workspace.setSelected} listRef={workspace.listRef} />}
        headerSlot={<FiscalPeriodContextHeader selected={workspace.selected} onClose={() => workspace.selected && workspace.setCloseTarget(workspace.selected)} onReopen={() => workspace.selected && workspace.setReopenTarget(workspace.selected)} onEdit={() => workspace.setFormDialogOpen(true)} onDelete={() => workspace.selected && workspace.setDeleteTarget(workspace.selected)} />}
        workspaceSlot={<FiscalPeriodWorkspaceCard selected={workspace.selected} />}
        dialogs={<FiscalPeriodsDialogs formDialogOpen={workspace.formDialogOpen} selected={workspace.selected} onCloseForm={() => workspace.setFormDialogOpen(false)} onFormSuccess={() => { workspace.setFormDialogOpen(false); void refetch() }} generateDialogOpen={workspace.generateDialogOpen} onCloseGenerate={() => workspace.setGenerateDialogOpen(false)} onGenerate={workspace.handleGenerate} deleteTarget={workspace.deleteTarget} closeTarget={workspace.closeTarget} reopenTarget={workspace.reopenTarget} onConfirmDelete={() => void workspace.handleDelete()} onConfirmClose={() => void workspace.handleClose()} onConfirmReopen={() => void workspace.handleReopen()} onCancelDelete={() => workspace.setDeleteTarget(null)} onCancelClose={() => workspace.setCloseTarget(null)} onCancelReopen={() => workspace.setReopenTarget(null)} />}
      />
    </>
  )
}

export default FiscalPeriodsPage
