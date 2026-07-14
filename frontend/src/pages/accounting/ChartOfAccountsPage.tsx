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
  // Code ascending is the accounting convention and matches the backend's own
  // ORDER BY code ASC (#899). sortBy is kept in state for two consumers — the
  // FilterBar active-sort indicator and handleSort's direction toggle — but is
  // NOT passed to AccountList, which always sorts by code.
  const [sortBy, setSortBy] = useState('code')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<AccountTreeNode | null>(null)
  const [parentForNew, setParentForNew] = useState<AccountTreeNode | null>(null)

  const search = appliedFilters.search.trim()

  // Two cache entries on purpose. The dialog builds its parent-account options
  // from the tree it is handed, so it must always see the UNFILTERED tree — a
  // filtered one would let a user create an account under the wrong parent.
  // RTK Query keys the cache on the serialized arg, so `{}` and `{ search: '' }`
  // would be two entries firing the identical request: trim, then skip the empty
  // case, and the unfiltered tree is fetched exactly once.
  const {
    data: fullTree = [],
    isFetching: isFullTreeFetching,
    error: fullTreeError,
  } = useGetAccountTreeQuery({})

  const {
    data: filteredTree = [],
    isFetching: isSearchFetching,
    error: searchError,
  } = useGetAccountTreeQuery({ search }, { skip: search.length === 0 })

  const tree = search ? filteredTree : fullTree
  const isFetching = search ? isSearchFetching : isFullTreeFetching

  // The full tree is load-bearing even during a search (the dialog needs it), so
  // its failure is never swallowed by an active search.
  const error = fullTreeError
    ? 'Failed to load accounts.'
    : search && searchError
      ? 'Failed to search accounts.'
      : null

  // No trustworthy full tree means no parent options, and opening the form could
  // silently attach a new account to the wrong parent. Gate on the QUERY having
  // settled, not on the data being non-empty — an empty chart of accounts is a
  // valid state and must still allow creating the first account.
  const canWrite = isAdmin && !isFullTreeFetching && !fullTreeError

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
      primaryAction={canWrite ? { label: 'New Account', onClick: handleAddRoot } : undefined}
      filterConfig={filterConfig as any}
      draftFilters={draftFilters}
      handlers={handlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={searchInputRef}
      sort={{ field: 'code', sortBy, sortOrder, onSort: handleSort }}
      isFetching={isFetching}
      error={error}
      tableSlot={(
        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <AccountList
            tree={tree}
            isFetching={isFetching}
            sortOrder={sortOrder}
            onAddChild={handleAddChild}
            onEdit={handleEdit}
            isAdmin={canWrite}
          />
        </Box>
      )}
      dialogs={canWrite ? (
        <AccountFormDialog
          open={dialogOpen}
          account={editingAccount}
          parent={parentForNew}
          tree={fullTree}
          onClose={handleDialogClose}
          onSuccess={handleDialogSuccess}
        />
      ) : undefined}
    />
  )
}
