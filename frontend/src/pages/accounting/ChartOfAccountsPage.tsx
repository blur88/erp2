import React, { useMemo, useState } from 'react'

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
  accountType: string | null
  isActive: string | null
}

const filterConfig: FilterBarConfig<CoaFilters> = {
  search: { placeholder: 'Search by code or name...' },
  fields: [
    { field: 'accountType', label: 'Account Type', type: 'account-type' },
    { field: 'isActive', label: 'Status', type: 'status' },
  ],
  defaults: { search: '', accountType: null, isActive: null },
}

const ChartOfAccountsPage: React.FC = () => {
  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)
  const { data: hierarchyData, isLoading, error, refetch } = useGetChartOfAccountsHierarchyQuery()
  const workspace = useChartOfAccountsWorkspace(() => {
    void refetch()
  })
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

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

  const filteredAccounts = useMemo(() => {
    let result = accounts

    if (appliedFilters.search) {
      const searchTerm = appliedFilters.search.toLowerCase()
      result = result.filter(
        (account) =>
          account.code.toLowerCase().includes(searchTerm) ||
          account.name.toLowerCase().includes(searchTerm),
      )
    }

    if (appliedFilters.accountType) {
      result = result.filter((account) => account.type === appliedFilters.accountType)
    }

    if (appliedFilters.isActive) {
      const isActive = appliedFilters.isActive === 'active'
      result = result.filter((account) => account.isActive === isActive)
    }

    return [...result].sort((left, right) =>
      sortOrder === 'asc'
        ? left.code.localeCompare(right.code)
        : right.code.localeCompare(left.code),
    )
  }, [accounts, appliedFilters, sortOrder])

  return (
    <>
      <AccountMappingWarning context="system" />
      <GenericListPage
        title="Chart of Accounts"
        subtitle={`Manage your accounting structure and account hierarchy (${hasActiveFilters ? `${filteredAccounts.length} of ${accounts.length}` : `${accounts.length} total`})`}
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
        sort={{
          field: 'code',
          sortBy: 'code',
          sortOrder,
          onSort: () => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc')),
        }}
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
        workspaceSlot={<ChartOfAccountWorkspaceCard selected={workspace.selected} />}
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
