import React from 'react'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import type { FiscalPeriod } from '@/types'

const COLUMNS: ColumnConfig<FiscalPeriod>[] = [
  { key: 'code', render: (period) => period.code },
]

interface Props {
  periods: FiscalPeriod[]
  loading: boolean
  total: number
  selectedId: string | null
  focusedIndex: number
  onSelect: (period: FiscalPeriod) => void
  listRef: React.RefObject<HTMLDivElement | null>
}

export function FiscalPeriodsTable({ periods, loading, total, selectedId, focusedIndex, onSelect, listRef }: Props) {
  return (
    <EntityTable
      rows={periods}
      columns={COLUMNS}
      loading={loading}
      total={total}
      label="Fiscal Periods List"
      selectedId={selectedId ?? undefined}
      focusedIndex={focusedIndex}
      onSelect={onSelect}
      listRef={listRef}
      dataAttr="period"
    />
  )
}
