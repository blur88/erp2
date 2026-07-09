import { useRef } from 'react'
import { IconButton } from '@mui/material'
import AddCircleOutlinedIcon from '@mui/icons-material/AddCircleOutlined'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import type { ChartOfAccount } from '@/types'

export type IndentedAccount = ChartOfAccount & { depth: number }

interface Props {
  accounts: IndentedAccount[]
  loading: boolean
  onSelect: (item: IndentedAccount) => void
  onAddChild?: (item: IndentedAccount) => void
}

const COLUMNS: ColumnConfig<IndentedAccount>[] = [
  {
    key: 'code',
    render: (a) => <span style={{ paddingLeft: a.depth * 16 }}>{a.code}</span>,
  },
  { key: 'name', render: (a) => a.name },
]

export function ChartOfAccountsTable({
  accounts,
  loading,
  onSelect,
  onAddChild,
}: Props) {
  const fallbackRef = useRef<HTMLDivElement | null>(null)
  const fullColumns: ColumnConfig<IndentedAccount>[] = [
    ...COLUMNS,
    ...(onAddChild ? [{
      key: 'actions' as any,
      render: (a: IndentedAccount) => (
        <IconButton
          size="small"
          onClick={(e) => { e.stopPropagation(); onAddChild(a) }}
          title="Add child account"
        >
          <AddCircleOutlinedIcon fontSize="small" />
        </IconButton>
      ),
    }] : []),
  ]

  return (
    <EntityTable
      rows={accounts}
      columns={fullColumns}
      loading={loading}
      total={accounts.length}
      label="Accounts"
      focusedIndex={-1}
      onSelect={onSelect}
      listRef={fallbackRef}
    />
  )
}
