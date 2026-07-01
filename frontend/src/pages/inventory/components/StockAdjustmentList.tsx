import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import RowActionMenu from '@/components/common/RowActionMenu'
import { StatusChip } from '@/components/common/StatusChip'
import { formatCurrency } from '@/utils/currency'
import { formatDate, formatNumber } from '@/utils/formatters'
import type { StockAdjustment } from '@/types'
import StockAdjustmentItemsPopover from './StockAdjustmentItemsPopover'

interface Props {
  rows: StockAdjustment[]
  total: number
  loading: boolean
  paginationSlot: ReactNode
  onComplete?: (a: StockAdjustment) => void
  onRevert?: (a: StockAdjustment) => void
}

export default function StockAdjustmentList({ rows, total, loading, paginationSlot, onComplete, onRevert }: Props) {
  const navigate = useNavigate()

  const columns: ColumnConfig<StockAdjustment>[] = [
    { key: 'adjustmentNumber', width: '30%', render: (a) => a.adjustmentNumber },
    { key: 'date', width: '16%', render: (a) => formatDate(a.adjustmentDate) },
    { key: 'status', width: '14%', raw: true, render: (a) => <StatusChip status={a.status} /> },
    { key: 'itemCount', width: '14%', raw: true, render: (a) => <StockAdjustmentItemsPopover adjustment={a} /> },
    { key: 'totalValue', width: '18%', render: (a) => formatCurrency(a.totalValue) },
    {
      key: 'actions', width: '8%', raw: true,
      render: (a) => {
        const isDraft = a.status === 'draft'
        const isCompleted = a.status === 'completed'
        const actions = [
          { label: 'View', onClick: () => navigate(`/inventory/stock-adjustments/${a.id}/view`) },
          ...(isDraft ? [{ label: 'Edit', onClick: () => navigate(`/inventory/stock-adjustments/${a.id}/edit`) }] : []),
          ...(isDraft && onComplete ? [{ label: 'Complete', onClick: () => onComplete(a) }] : []),
          ...(isCompleted && onRevert ? [{ label: 'Revert', onClick: () => onRevert(a) }] : []),
          ...(isCompleted ? [{ label: 'View Journal Entry', onClick: () => navigate(`/accounting/journal-entries?sourceType=stock_adjustment&sourceId=${a.id}`) }] : []),
        ]
        return <RowActionMenu actions={actions} />
      },
    },
  ]

  return (
    <EntityTable
      rows={rows}
      columns={columns}
      loading={loading}
      total={total}
      label="Stock Adjustments"
      headers={['Adjustment Number', 'Date', 'Status', 'Item Count', 'Total Value', 'Actions']}
      showHeader={false}
      focusedIndex={-1}
      listRef={{ current: null }}
      onSelect={(a) => navigate(`/inventory/stock-adjustments/${a.id}/view`)}
      paginationSlot={paginationSlot}
    />
  )
}
