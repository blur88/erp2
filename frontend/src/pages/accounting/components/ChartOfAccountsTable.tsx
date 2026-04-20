import { useRef, type RefObject } from 'react'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import type { ChartOfAccount } from '@/types'

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
