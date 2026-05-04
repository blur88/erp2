import type React from 'react'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import type { Settlement } from '@/types'

const COLUMNS: ColumnConfig<Settlement>[] = [
  { key: 'settlementNumber', render: (s) => s.settlementNumber },
]

interface Props {
  settlements: Settlement[]
  loading: boolean
  total: number
  selectedId: string | null
  focusedIndex: number
  onSelect: (item: Settlement) => void
  listRef: React.RefObject<HTMLDivElement | null>
}

export function SettlementsTable({ settlements, loading, total, selectedId, focusedIndex, onSelect, listRef }: Props) {
  return (
    <EntityTable
      rows={settlements}
      columns={COLUMNS}
      loading={loading}
      total={total}
      label="Settlements"
      selectedId={selectedId ?? undefined}
      focusedIndex={focusedIndex}
      onSelect={onSelect}
      listRef={listRef}
      dataAttr="settlement"
    />
  )
}
