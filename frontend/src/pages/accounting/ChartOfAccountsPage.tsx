import { useRef, useState } from 'react'
import { Box } from '@mui/material'

import SimpleListPage from '@/components/common/SimpleListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useAppSelector } from '@/hooks/useRedux'
import { useGetAccountTreeQuery } from '@/store/api/accountingApi'
import type { AccountTreeNode } from '@/types'

import AccountFormDialog from './components/AccountFormDialog'
import AccountList from './components/AccountList'

interface COAFilters {
  search: string
}

const filterConfig = {
  search: { placeholder: 'Search accounts by name or code...' },
  fields: [],
  defaults: { search: '' },
}

export default function ChartOfAccountsPage() {
  // Accounting is readable by every authenticated role (#895), but creating and
  // editing accounts stays admin-only on the backend. Hide the write controls
  // rather than let a non-admin fill in a form that will 403 on submit.
  const isAdmin = useAppSelector((state) => state.auth?.user?.role === 'admin')
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)
  const [sortBy, setSortBy] = useState('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<AccountTreeNode | null>(null)
  const [parentForNew, setParentForNew] = useState<AccountTreeNode | null>(null)

  const { data: tree = [], isFetching, error } = useGetAccountTreeQuery()

  const handleSort = (field: string) => {
    setSortOrder((prev) => (sortBy === field && prev === 'desc' ? 'asc' : 'desc'))
    setSortBy(field)
  }

  const handleAddRoot = () => {
    setParentForNew(null)
    setEditingAccount(null)
    setDialogOpen(true)
  }

  const handleAddChild = (parent: AccountTreeNode) => {
    setParentForNew(parent)
    setEditingAccount(null)
    setDialogOpen(true)
  }

  const handleEdit = (account: AccountTreeNode) => {
    setParentForNew(null)
    setEditingAccount(account)
    setDialogOpen(true)
  }

  const handleDialogClose = () => {
    setDialogOpen(false)
    setEditingAccount(null)
    setParentForNew(null)
  }

  const handleDialogSuccess = () => {
    handleDialogClose()
  }

  return (
    <SimpleListPage
      title="Chart of Accounts"
      subtitle="Manage your chart of accounts."
      primaryAction={isAdmin ? { label: 'New Account', onClick: handleAddRoot } : undefined}
      filterConfig={filterConfig as any}
      draftFilters={draftFilters}
      handlers={handlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={searchInputRef}
      sort={{ field: 'name', sortBy, sortOrder, onSort: handleSort }}
      isFetching={isFetching}
      error={error ? 'Failed to load accounts.' : null}
      tableSlot={(
        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <AccountList
            tree={tree}
            onAddChild={handleAddChild}
            onEdit={handleEdit}
            isAdmin={isAdmin}
          />
        </Box>
      )}
      dialogs={isAdmin ? (
        <AccountFormDialog
          open={dialogOpen}
          account={editingAccount}
          tree={tree}
          onClose={handleDialogClose}
          onSuccess={handleDialogSuccess}
        />
      ) : undefined}
    />
  )
}
