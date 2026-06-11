import type { ReactNode } from 'react'
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined'
import { Box, Typography } from '@mui/material'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import RowActionMenu, { type RowAction } from '@/components/common/RowActionMenu'
import type { SalesOrder } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

import { getOrderActionMetas } from '../utils/orderActions'
import { StatusChip } from '@/components/common/StatusChip'

interface SalesOrderListProps {
  orders: SalesOrder[]
  loading: boolean
  total: number
  onView: (order: SalesOrder) => void
  onEdit: (order: SalesOrder) => void
  onPay: (order: SalesOrder) => void
  onFulfill: (order: SalesOrder) => void
  onUnfulfill: (order: SalesOrder) => void
  onRefund: (order: SalesOrder) => void
  onCancel: (order: SalesOrder) => void
  onUncancel: (order: SalesOrder) => void
  onDuplicate: (order: SalesOrder) => void
  onPrint: (order: SalesOrder) => void
  paginationSlot?: ReactNode
}

function buildActions(order: SalesOrder, props: SalesOrderListProps): RowAction[] {
  const metas = getOrderActionMetas(order)

  const handlers: Record<string, () => void> = {
    pay: () => props.onPay(order),
    fulfill: () => props.onFulfill(order),
    unfulfill: () => props.onUnfulfill(order),
    refund: () => props.onRefund(order),
    edit: () => props.onEdit(order),
    cancel: () => props.onCancel(order),
    uncancel: () => props.onUncancel(order),
    duplicate: () => props.onDuplicate(order),
    print: () => props.onPrint(order),
  }

  const labels: Record<string, string> = {
    pay: 'Pay',
    fulfill: 'Fulfill',
    unfulfill: 'Unfulfill',
    refund: 'Refund',
    edit: 'Edit',
    cancel: 'Cancel',
    uncancel: 'Uncancel',
    duplicate: 'Duplicate',
    print: 'Print',
  }

  const actions: RowAction[] = [{ label: 'View', onClick: () => props.onView(order) }]

  for (const { action, disabled, tooltip } of metas) {
    actions.push({
      label: labels[action],
      onClick: handlers[action],
      disabled,
      tooltip,
    })
  }

  return actions
}

export default function SalesOrderList(props: SalesOrderListProps) {
  const { orders, loading, total, paginationSlot } = props

  const columns: ColumnConfig<SalesOrder>[] = [
    { key: 'orderNumber', width: '12%', render: (order) => order.orderNumber },
    { key: 'customerName', width: '22%', render: (order) => order.customer?.name ?? '-' },
    { key: 'orderDate', width: '13%', render: (order) => formatDate(order.orderDate) },
    { key: 'totalAmount', width: '14%', render: (order) => formatCurrency(order.totalAmount) },
    {
      key: 'status',
      width: '13%',
      raw: true,
      render: (order) => (
        <StatusChip status={order.status} />
      ),
    },
    {
      key: 'paymentStatus',
      width: '14%',
      raw: true,
      render: (order) => <StatusChip status={order.paymentStatus} />,
    },
    {
      key: 'actions',
      width: '6%',
      raw: true,
      render: (order) => <RowActionMenu actions={buildActions(order, props)} />,
    },
  ]

  if (!loading && orders.length === 0) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 8, gap: 2 }}>
        <ReceiptLongOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          No sales orders yet. Create your first sales order to get started.
        </Typography>
      </Box>
    )
  }

  return (
    <EntityTable
      rows={orders}
      columns={columns}
      loading={loading}
      total={total}
      label="Sales Orders"
      showHeader={false}
      headers={['Order #', 'Customer', 'Date', 'Total', 'Status', 'Payment', 'Actions']}
      selectedId={undefined}
      focusedIndex={-1}
      onSelect={props.onView}
      listRef={{ current: null }}
      dataAttr="order"
      paginationSlot={paginationSlot}
    />
  )
}
