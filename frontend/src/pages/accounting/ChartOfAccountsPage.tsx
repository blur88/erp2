import { useMemo, useRef, useState } from 'react'
import { Box } from '@mui/material'

import SimpleListPage from '@/components/common/SimpleListPage'
import { ACCOUNT_TYPE_OPTIONS, STATUS_OPTIONS } from '@/constants/filterOptions'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useAppSelector } from '@/hooks/useRedux'
import { useListUrlState } from '@/hooks/useListUrlState'
import { useGetAccountTreeQuery, type AccountTreeParams } from '@/store/api/accountingApi'
import type { AccountTreeNode, AccountType } from '@/types'
import type { FilterBarConfig } from '@/types/filterBar.types'

import AccountFormDialog from './components/AccountFormDialog'
import AccountList from './components/AccountList'

interface COAFilters {
  search: string
  accountType: AccountType | null
  status: 'active' | 'inactive' | null
}

const filterConfig: FilterBarConfig<COAFilters> = {
  search: { placeholder: 'Search accounts by name or code...' },
  fields: [
    { field: 'accountType', label: 'Account Type', type: 'select', options: ACCOUNT_TYPE_OPTIONS },
    { field: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
  ],
  defaults: { search: '', accountType: null, status: null },
}

export default function ChartOfAccountsPage() {
  // Accounting is readable by every authenticated role (#895), but creating and
  // editing accounts stays admin-only on the backend. Hide the write controls
  // rather than let a non-admin fill in a form that will 403 on submit.
  const isAdmin = useAppSelector((state) => state.auth?.user?.role === 'admin')
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)
  // Code ascending is the accounting convention and matches the backend's own
  // ORDER BY code ASC (#899). sortBy is kept in URL state for two consumers —
  // the FilterBar active-sort indicator and setSort's direction toggle — but is
  // NOT passed to AccountList, which always sorts by code.
  const { sortBy, sortOrder, setSort } = useListUrlState({
    pagination: false,
    sort: { fields: ['code'], defaultField: 'code', defaultOrder: 'asc' },
  })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<AccountTreeNode | null>(null)
  const [parentForNew, setParentForNew] = useState<AccountTreeNode | null>(null)

  const search = appliedFilters.search.trim()
  const accountType = appliedFilters.accountType
  const status = appliedFilters.status
  const hasTreeFilters = Boolean(search) || accountType !== null || status !== null

  const filterArgs = useMemo(() => {
    const args: AccountTreeParams = {}
    if (search) args.search = search
    if (accountType) args.type = accountType
    if (status !== null) args.isActive = status === 'active'
    return args
  }, [search, accountType, status])

  // Two cache entries on purpose. The dialog builds its parent-account options
  // from the tree it is handed, so it must always see the UNFILTERED tree — a
  // filtered one would let a user create an account under the wrong parent.
  // RTK Query keys the cache on the serialized arg, and `filterArgs` omits every
  // unset filter, so an unfiltered page serializes to `{}` exactly like the call
  // below and the unfiltered tree is fetched once.
  const {
    data: fullTree = [],
    isFetching: isFullTreeFetching,
    error: fullTreeError,
  } = useGetAccountTreeQuery({})

  const {
    data: filteredTree = [],
    isFetching: isFilteredFetching,
    error: filteredError,
  } = useGetAccountTreeQuery(filterArgs, { skip: !hasTreeFilters })

  const tree = hasTreeFilters ? filteredTree : fullTree
  const isFetching = hasTreeFilters ? isFilteredFetching : isFullTreeFetching

  // The full tree is load-bearing even while a filter is active (the dialog needs
  // it), so its failure is never swallowed by an active filter.
  const error = fullTreeError
    ? 'Failed to load accounts.'
    : hasTreeFilters && filteredError
      ? 'Failed to filter accounts.'
      : null

  // No trustworthy full tree means no parent options, and opening the form could
  // silently attach a new account to the wrong parent. Gate on the QUERY having
  // settled, not on the data being non-empty — an empty chart of accounts is a
  // valid state and must still allow creating the first account.
  const canWrite = isAdmin && !isFullTreeFetching && !fullTreeError

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
      sort={{ field: 'code', sortBy, sortOrder, onSort: setSort }}
      isFetching={isFetching}
      error={error}
      tableSlot={(
        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <AccountList
            tree={tree}
            isFetching={isFetching}
            sortOrder={sortOrder}
            hasActiveFilters={hasActiveFilters}
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
