import { useRef, type RefObject } from 'react'
import { Chip } from '@mui/material'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import type { ChartOfAccount } from '@/types'

import { ACCOUNT_TYPE_COLORS } from '../utils/accountTypeColors'

interface Props {
  accounts: ChartOfAccount[]
  loading: boolean
  selectedId: string | null
  onSelect: (item: ChartOfAccount) => void
  listRef?: RefObject<HTMLDivElement | null>
}

const COLUMNS: ColumnConfig<ChartOfAccount>[] = [
  { key: 'code', render: (account) => account.code },
  { key: 'name', render: (account) => account.name },
  {
    key: 'type',
    raw: true,
    render: (account) => (
      <Chip
        size="small"
        label={account.type.charAt(0) + account.type.slice(1).toLowerCase()}
        color={ACCOUNT_TYPE_COLORS[account.type]}
        variant="outlined"
      />
    ),
  },
  {
    key: 'status',
    raw: true,
    render: (account) => (
      <Chip
        size="small"
        label={account.isActive ? 'Active' : 'Inactive'}
        color={account.isActive ? 'success' : 'default'}
        variant="outlined"
      />
    ),
  },
]

export function ChartOfAccountsTable({
  accounts,
  loading,
  selectedId,
  onSelect,
  listRef,
}: Props) {
  const fallbackRef = useRef<HTMLDivElement | null>(null)
  return (
    <EntityTable
      rows={accounts}
      columns={COLUMNS}
      loading={loading}
      total={accounts.length}
      label="Accounts"
      selectedId={selectedId ?? undefined}
      focusedIndex={-1}
      onSelect={onSelect}
      listRef={listRef ?? fallbackRef}
      dataAttr="account"
    />
  )
}
