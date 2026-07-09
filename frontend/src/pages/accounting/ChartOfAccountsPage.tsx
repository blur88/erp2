import React, { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import AccountMappingWarning from '@/components/accounting/AccountMappingWarning'
import ChartOfAccountFormDialog from '@/components/accounting/ChartOfAccountFormDialog'
import SimpleListPage from '@/components/common/SimpleListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useGetChartOfAccountsHierarchyQuery } from '@/store/api/accountingApi'
import type { ChartOfAccount } from '@/types'
import type { FilterBarConfig } from '@/types/filterBar.types'

import { ChartOfAccountsTable, type IndentedAccount } from './components/ChartOfAccountsTable'

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
  const navigate = useNavigate()
  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)
  const { data: hierarchyData, isLoading, isFetching, error } = useGetChartOfAccountsHierarchyQuery()
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [formOpen, setFormOpen] = useState(false)
  const [formParentId, setFormParentId] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const openCreate = (parentId: string | null) => {
    setFormParentId(parentId)
    setFormOpen(true)
  }

  const flat = useMemo(() => {
    const rows: IndentedAccount[] = []
    const walk = (nodes: ChartOfAccount[], depth: number) => {
      for (const node of nodes) {
        rows.push({ ...node, depth })
        if (node.children?.length) walk(node.children, depth + 1)
      }
    }
    walk(hierarchyData ?? [], 0)
    return rows
  }, [hierarchyData])

  const filtered = useMemo(() => {
    let result = flat
    if (appliedFilters.search) {
      const q = appliedFilters.search.toLowerCase()
      result = result.filter((a) => a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
    }
    if (appliedFilters.accountType) result = result.filter((a) => a.type === appliedFilters.accountType)
    if (appliedFilters.isActive) {
      const active = appliedFilters.isActive === 'active'
      result = result.filter((a) => a.isActive === active)
    }
    return [...result].sort((l, r) =>
      sortOrder === 'asc' ? l.code.localeCompare(r.code) : r.code.localeCompare(l.code),
    )
  }, [flat, appliedFilters, sortOrder])

  return (
    <>
      <AccountMappingWarning context="system" />
      <SimpleListPage
        title="Chart of Accounts"
        subtitle={`Manage your accounting structure (${hasActiveFilters ? `${filtered.length} of ${flat.length}` : `${flat.length} total`})`}
        primaryAction={{ label: 'Add Account', onClick: () => openCreate(null) }}
        filterConfig={filterConfig}
        draftFilters={draftFilters}
        handlers={handlers}
        hasActiveFilters={hasActiveFilters}
        searchInputRef={searchInputRef}
        sort={{
          field: 'code',
          sortBy: 'code',
          sortOrder,
          onSort: () => setSortOrder((p) => (p === 'asc' ? 'desc' : 'asc')),
        }}
        isFetching={isFetching}
        error={(error as any)?.data ?? null}
        tableSlot={
          <ChartOfAccountsTable
            accounts={filtered}
            loading={isLoading}
            onSelect={(a) => navigate(`/accounting/chart-of-accounts/${a.id}`)}
            onAddChild={(a) => openCreate(a.id)}
          />
        }
        dialogs={
          <ChartOfAccountFormDialog
            open={formOpen}
            account={null}
            parentId={formParentId}
            onClose={() => setFormOpen(false)}
            onSuccess={() => setFormOpen(false)}
          />
        }
      />
    </>
  )
}

export default ChartOfAccountsPage
