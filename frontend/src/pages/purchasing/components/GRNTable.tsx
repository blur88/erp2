import React from 'react'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import type { GoodsReceivedNote } from '@/types'

const COLUMNS: ColumnConfig<GoodsReceivedNote>[] = [
  { key: 'grnNumber', render: (grn) => grn.grnNumber },
]

interface GRNTableProps {
  grns: GoodsReceivedNote[]
  loading: boolean
  total: number
  selectedGRNId?: string
  focusedGRNIndex: number
  onGRNSelect: (grn: GoodsReceivedNote) => void
  grnListRef: React.RefObject<HTMLDivElement | null>
}

const GRNTable: React.FC<GRNTableProps> = ({
  grns,
  loading,
  total,
  selectedGRNId,
  focusedGRNIndex,
  onGRNSelect,
  grnListRef,
}) => (
  <EntityTable
    rows={grns}
    columns={COLUMNS}
    loading={loading}
    total={total}
    label="GRN List"
    selectedId={selectedGRNId}
    focusedIndex={focusedGRNIndex}
    onSelect={onGRNSelect}
    listRef={grnListRef}
    dataAttr="grn"
  />
)

export default GRNTable
