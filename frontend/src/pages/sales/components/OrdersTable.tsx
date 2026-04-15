import React from 'react'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import type { SalesOrder } from '@/types'

const COLUMNS: ColumnConfig<SalesOrder>[] = [
  { key: 'orderNumber', render: (order) => order.orderNumber },
]

interface OrdersTableProps {
  orders: SalesOrder[]
  loading: boolean
  total: number
  selectedOrderId?: string
  focusedOrderIndex: number
  onOrderSelect: (order: SalesOrder) => void
  orderListRef: React.RefObject<HTMLDivElement | null>
}

const OrdersTable: React.FC<OrdersTableProps> = ({
  orders,
  loading,
  total,
  selectedOrderId,
  focusedOrderIndex,
  onOrderSelect,
  orderListRef,
}) => (
  <EntityTable
    rows={orders}
    columns={COLUMNS}
    loading={loading}
    total={total}
    label="SO List"
    selectedId={selectedOrderId}
    focusedIndex={focusedOrderIndex}
    onSelect={onOrderSelect}
    listRef={orderListRef}
    dataAttr="order"
  />
)

export default OrdersTable
