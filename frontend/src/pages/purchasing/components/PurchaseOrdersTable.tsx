import React from 'react'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import type { PurchaseOrder } from '@/types'

const COLUMNS: ColumnConfig<PurchaseOrder>[] = [
  { key: 'orderNumber', render: (order) => order.orderNumber },
]

interface PurchaseOrdersTableProps {
  purchaseOrders: PurchaseOrder[]
  loading: boolean
  total: number
  selectedOrderId?: string
  focusedOrderIndex: number
  onOrderSelect: (order: PurchaseOrder) => void
  orderListRef: React.RefObject<HTMLDivElement | null>
}

const PurchaseOrdersTable: React.FC<PurchaseOrdersTableProps> = ({
  purchaseOrders,
  loading,
  total,
  selectedOrderId,
  focusedOrderIndex,
  onOrderSelect,
  orderListRef,
}) => (
  <EntityTable
    rows={purchaseOrders}
    columns={COLUMNS}
    loading={loading}
    total={total}
    label="PO List"
    selectedId={selectedOrderId}
    focusedIndex={focusedOrderIndex}
    onSelect={onOrderSelect}
    listRef={orderListRef}
    dataAttr="order"
  />
)

export default PurchaseOrdersTable
