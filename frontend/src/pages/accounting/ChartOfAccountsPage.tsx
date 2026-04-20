import React, { useMemo } from 'react'

import AccountMappingWarning from '@/components/accounting/AccountMappingWarning'
import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useGetChartOfAccountsHierarchyQuery } from '@/store/api/accountingApi'
import type { ChartOfAccount } from '@/types'
import type { FilterBarConfig } from '@/types/filterBar.types'

import { ChartOfAccountContextHeader } from './components/ChartOfAccountContextHeader'
import { ChartOfAccountsDialogs } from './components/ChartOfAccountsDialogs'
import { ChartOfAccountsTable } from './components/ChartOfAccountsTable'
import { ChartOfAccountWorkspaceCard } from './components/ChartOfAccountWorkspaceCard'
import { useChartOfAccountsWorkspace } from './hooks/useChartOfAccountsWorkspace'

interface CoaFilters {
  search: string
}

const filterConfig: FilterBarConfig<CoaFilters> = {
  search: { placeholder: 'Search by code or name...' },
  fields: [],
  defaults: { search: '' },
}

const ChartOfAccountsPage: React.FC = () => {
  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)
  const { data: hierarchyData, isLoading, error, refetch } = useGetChartOfAccountsHierarchyQuery()
  const workspace = useChartOfAccountsWorkspace(() => {
    void refetch()
  })

  const accounts = useMemo(() => {
    const result: ChartOfAccount[] = []

    const walk = (nodes: ChartOfAccount[]) => {
      for (const node of nodes) {
        result.push(node)

        if (node.children?.length) {
          walk(node.children)
        }
      }
    }

    walk(hierarchyData ?? [])
    return result
  }, [hierarchyData])

  const filteredAccounts = useMemo(
    () =>
      appliedFilters.search
        ? accounts.filter((account) => {
            const searchTerm = appliedFilters.search.toLowerCase()
            return (
              account.code.toLowerCase().includes(searchTerm) ||
              account.name.toLowerCase().includes(searchTerm)
            )
          })
        : accounts,
    [accounts, appliedFilters.search],
  )

  return (
    <>
      <AccountMappingWarning context="system" />
      <GenericListPage
        title="Chart of Accounts"
        subtitle={`Manage your accounting structure and account hierarchy (${appliedFilters.search ? `${filteredAccounts.length} of ${accounts.length}` : `${accounts.length} total`})`}
        primaryAction={{
          label: 'Add Account',
          onClick: () => {
            workspace.setSelected(null)
            workspace.setFormDialogOpen(true)
          },
        }}
        secondaryAction={{ label: 'View Deleted', onClick: () => workspace.setDeletedDialogOpen(true) }}
        filterConfig={filterConfig}
        draftFilters={draftFilters}
        handlers={handlers}
        hasActiveFilters={hasActiveFilters}
        searchInputRef={workspace.searchInputRef}
        sort={{ field: 'code', sortBy: 'code', sortOrder: 'asc', onSort: () => {} }}
        error={(error as any)?.data ?? null}
        listSlot={
          <ChartOfAccountsTable
            accounts={filteredAccounts}
            loading={isLoading}
            selectedId={workspace.selected?.id ?? null}
            onSelect={workspace.setSelected}
            listRef={workspace.listRef}
          />
        }
        headerSlot={
          <ChartOfAccountContextHeader
            selected={workspace.selected}
            onEdit={() => workspace.setFormDialogOpen(true)}
            onDelete={() => workspace.selected && workspace.setDeleteTarget(workspace.selected)}
          />
        }
        workspaceSlot={
          <ChartOfAccountWorkspaceCard selected={workspace.selected} allAccounts={accounts} />
        }
        dialogs={
          <ChartOfAccountsDialogs
            formDialogOpen={workspace.formDialogOpen}
            selected={workspace.selected}
            onCloseForm={() => workspace.setFormDialogOpen(false)}
            onFormSuccess={() => {
              workspace.setFormDialogOpen(false)
              void refetch()
            }}
            deleteTarget={workspace.deleteTarget}
            onConfirmDelete={() => void workspace.handleDelete()}
            onCancelDelete={() => workspace.setDeleteTarget(null)}
            seedConfirmOpen={workspace.seedConfirmOpen}
            onConfirmSeed={() => void workspace.handleSeed()}
            onCancelSeed={() => workspace.setSeedConfirmOpen(false)}
            deletedDialogOpen={workspace.deletedDialogOpen}
            onCloseDeletedDialog={() => workspace.setDeletedDialogOpen(false)}
            onChanged={() => void refetch()}
          />
        }
      />
    </>
  )
}

export default ChartOfAccountsPage
