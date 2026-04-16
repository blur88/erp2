import React from 'react'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import type { StockAdjustment } from '@/types'

const COLUMNS: ColumnConfig<StockAdjustment>[] = [
  { key: 'adjustmentNumber', render: (adjustment) => adjustment.adjustmentNumber },
]

interface StockAdjustmentListProps {
  adjustments: StockAdjustment[]
  loading: boolean
  total: number
  selectedAdjustmentId?: string
  focusedAdjustmentIndex: number
  onSelect: (adjustment: StockAdjustment) => void
  adjustmentListRef: React.RefObject<HTMLDivElement | null>
}

const StockAdjustmentList: React.FC<StockAdjustmentListProps> = ({
  adjustments,
  loading,
  total,
  selectedAdjustmentId,
  focusedAdjustmentIndex,
  onSelect,
  adjustmentListRef,
}) => (
  <EntityTable
    rows={adjustments}
    columns={COLUMNS}
    loading={loading}
    total={total}
    label="Adjustments"
    selectedId={selectedAdjustmentId}
    focusedIndex={focusedAdjustmentIndex}
    onSelect={onSelect}
    listRef={adjustmentListRef}
    dataAttr="adjustment"
  />
)

export default StockAdjustmentList
