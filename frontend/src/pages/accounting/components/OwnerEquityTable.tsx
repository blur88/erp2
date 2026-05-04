import type React from 'react'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import type { OwnerEquityTransaction } from '@/types'

const COLUMNS: ColumnConfig<OwnerEquityTransaction>[] = [
  { key: 'referenceNumber', render: (t) => t.referenceNumber },
]

interface Props {
  transactions: OwnerEquityTransaction[]
  loading: boolean
  total: number
  selectedId: string | null
  focusedIndex: number
  onSelect: (item: OwnerEquityTransaction) => void
  listRef: React.RefObject<HTMLDivElement | null>
}

export function OwnerEquityTable({ transactions, loading, total, selectedId, focusedIndex, onSelect, listRef }: Props) {
  return (
    <EntityTable
      rows={transactions}
      columns={COLUMNS}
      loading={loading}
      total={total}
      label="Owner Equity"
      selectedId={selectedId ?? undefined}
      focusedIndex={focusedIndex}
      onSelect={onSelect}
      listRef={listRef}
      dataAttr="owner-equity"
    />
  )
}
