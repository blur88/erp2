import { useMemo, useState } from 'react'
import { Box, Typography } from '@mui/material'

import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import RowActionMenu from '@/components/common/RowActionMenu'
import { StatusChip } from '@/components/common/StatusChip'
import { useNotification } from '@/hooks/useNotification'
import { useUpdateAccountMutation } from '@/store/api/accountingApi'
import { formatCurrency } from '@/utils/currency'
import type { AccountTreeNode } from '@/types'

interface FlattenedRow {
  id: string
  account: AccountTreeNode
  depth: number
  isGroup: boolean
}

interface AccountListProps {
  tree: AccountTreeNode[]
  isFetching?: boolean
  // Sorting reorders SIBLINGS within each level, always by code (the accounting
  // convention). The rows are a flattened tree, so sorting them as a flat list
  // would tear children away from their parents.
  sortOrder?: 'asc' | 'desc'
  onAddChild: (parent: AccountTreeNode | null) => void
  onEdit: (account: AccountTreeNode) => void
  // Every row action (Add Child / Edit / Set Inactive / Reactivate) writes via
  // PATCH or POST /accounting/accounts, which stay admin-only. Non-admins can read
  // the chart of accounts (#895) but get no actions column.
  isAdmin?: boolean
}

// This does NOT merely reproduce the backend's ORDER BY code ASC. `code` is a
// free-form varchar(20), so codes of unequal digit length are legal, and the two
// collations disagree on them: Postgres orders '10000' before '9000'
// lexicographically, while numeric collation gives the accounting order,
// '9000' then '10000'. The client sort is what the user sees, so it is
// load-bearing — do not drop it as redundant with the backend.
//
// The lexical tie-break is not cosmetic. Numeric collation reports distinct codes
// with different leading zeros ('0100' vs '100') as EQUAL, and both are legal and
// unique in the DB. Without a tie-break the comparator is not antisymmetric: a
// stable sort freezes such a pair in backend order, so descending renders it
// identically to ascending and the Sort toggle looks broken on those rows.
function compareCodes(a: string, b: string): number {
  const byValue = a.localeCompare(b, undefined, { numeric: true })
  if (byValue !== 0) return byValue
  return a < b ? -1 : a > b ? 1 : 0
}

function sortSiblings(
  nodes: AccountTreeNode[],
  sortOrder: 'asc' | 'desc',
): AccountTreeNode[] {
  const dir = sortOrder === 'desc' ? -1 : 1
  return [...nodes]
    .sort((a, b) => dir * compareCodes(a.code, b.code))
    .map((n) => ({ ...n, children: sortSiblings(n.children, sortOrder) }))
}

function flattenTree(tree: AccountTreeNode[]): FlattenedRow[] {
  const result: FlattenedRow[] = []
  const walk = (nodes: AccountTreeNode[], depth: number) => {
    for (const node of nodes) {
      // Group identity is the domain flag, not children.length: a search that
      // matches a group returns it with children: [] and it is still a group.
      const isGroup = !node.isPostable
      result.push({ id: node.id, account: node, depth, isGroup })
      if (node.children.length > 0) {
        walk(node.children, depth + 1)
      }
    }
  }
  walk(tree, 0)
  return result
}

export default function AccountList({
  tree,
  isFetching = false,
  sortOrder = 'asc',
  onAddChild,
  onEdit,
  isAdmin = true,
}: AccountListProps) {
  const { showSuccess, showError } = useNotification()
  const [updateAccount, { isLoading: updating }] = useUpdateAccountMutation()
  const [pendingDeactivate, setPendingDeactivate] = useState<AccountTreeNode | null>(null)

  const rows = useMemo(
    () => flattenTree(sortSiblings(tree, sortOrder)),
    [tree, sortOrder],
  )

  const confirmDeactivate = async () => {
    if (!pendingDeactivate) return
    try {
      await updateAccount({ id: pendingDeactivate.id, data: { isActive: false } }).unwrap()
      showSuccess(`${pendingDeactivate.name} set as inactive`)
      setPendingDeactivate(null)
    } catch (e: any) {
      showError(e?.data?.message ?? `Failed to deactivate ${pendingDeactivate.name}`)
      setPendingDeactivate(null)
    }
  }

  const columns: ColumnConfig<FlattenedRow>[] = [
    {
      key: 'name',
      width: '30%',
      raw: true,
      render: (row) => (
        <Typography
          variant="body2"
          sx={{
            pl: row.depth * 3,
            fontWeight: row.isGroup ? 600 : 400,
            fontSize: '0.8rem',
            lineHeight: 1.2,
            ...(!row.account.isActive && { color: 'text.secondary' }),
          }}
        >
          {row.account.name}
        </Typography>
      ),
    },
    {
      key: 'code',
      width: '12%',
      render: (row) => row.account.code,
    },
    {
      key: 'type',
      width: '12%',
      render: (row) => row.account.type,
    },
    {
      key: 'balance',
      width: '15%',
      render: (row) => formatCurrency(row.account.balance),
    },
    {
      key: 'status',
      width: '10%',
      raw: true,
      render: (row) => <StatusChip status={row.account.isActive ? 'active' : 'inactive'} />,
    },
    ...(isAdmin
      ? [
          {
            key: 'actions',
            width: '10%',
            raw: true,
            render: (row: FlattenedRow) => (
              <RowActionMenu
                actions={
                  row.isGroup
                    ? [{ label: 'Add Child Account', onClick: () => onAddChild(row.account) }]
                    : [
                        { label: 'Edit', onClick: () => onEdit(row.account) },
                        row.account.isActive
                          ? { label: 'Set Inactive', onClick: () => handleDeactivate(row.account) }
                          : { label: 'Reactivate', onClick: () => handleReactivate(row.account) },
                      ]
                }
              />
            ),
          },
        ]
      : []),
  ]

  const handleDeactivate = async (account: AccountTreeNode) => {
    if (account.balance !== '0.0000') {
      setPendingDeactivate(account)
    } else {
      try {
        await updateAccount({ id: account.id, data: { isActive: false } }).unwrap()
        showSuccess(`${account.name} set as inactive`)
      } catch (e: any) {
        showError(e?.data?.message ?? `Failed to deactivate ${account.name}`)
      }
    }
  }

  const handleReactivate = async (account: AccountTreeNode) => {
    try {
      await updateAccount({ id: account.id, data: { isActive: true } }).unwrap()
      showSuccess(`${account.name} reactivated`)
    } catch (e: any) {
      showError(e?.data?.message ?? `Failed to reactivate ${account.name}`)
    }
  }

  return (
    <>
      <EntityTable
        rows={rows}
        columns={columns}
        loading={isFetching}
        total={rows.length}
        label="Chart of Accounts"
        showHeader
        headers={['Name', 'Code', 'Type', 'Balance', 'Status', 'Actions']}
        selectedId={undefined}
        focusedIndex={-1}
        onSelect={() => {}}
        listRef={{ current: null }}
        dataAttr="account"
        paginationSlot={<Box />}
      />
      <ConfirmationDialog
        open={pendingDeactivate !== null}
        title="Deactivate Account"
        message={`This account has a non-zero balance (${formatCurrency(pendingDeactivate?.balance ?? '0.0000')}). Set inactive anyway?`}
        confirmText="Set Inactive"
        severity="warning"
        loading={updating}
        onConfirm={confirmDeactivate}
        onCancel={() => setPendingDeactivate(null)}
      />
    </>
  )
}
