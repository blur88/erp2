import type { RefObject } from 'react'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import type { FundTransfer } from '@/types'

interface Props {
  transfers: FundTransfer[]
  loading: boolean
  selectedId: string | null
  focusedIndex: number
  onSelect: (item: FundTransfer) => void
  listRef: RefObject<HTMLDivElement | null>
}

const columns: ColumnConfig<FundTransfer>[] = [
  {
    key: 'reference',
    render: (row) => row.referenceNumber,
  },
]

export function FundTransfersList({ transfers, loading, selectedId, focusedIndex, onSelect, listRef }: Props) {
  return (
    <EntityTable
      rows={transfers}
      columns={columns}
      loading={loading}
      total={transfers.length}
      label="Fund Transfers"
      selectedId={selectedId ?? undefined}
      focusedIndex={focusedIndex}
      onSelect={onSelect}
      listRef={listRef}
    />
  )
}
