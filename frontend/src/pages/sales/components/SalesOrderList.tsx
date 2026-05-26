import type { ReactNode } from 'react'
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined'
import { Box, Typography } from '@mui/material'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import RowActionMenu, { type RowAction } from '@/components/common/RowActionMenu'
import type { SalesOrder } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

import { SalesOrderPaymentStatusChip } from './SalesOrderPaymentStatusChip'
import { SalesOrderStatusChip } from './SalesOrderStatusChip'

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
  onPrint: (order: SalesOrder) => void
  paginationSlot?: ReactNode
}

function buildActions(order: SalesOrder, props: SalesOrderListProps): RowAction[] {
  const { status, paymentStatus } = order
  const isPaid = paymentStatus !== 'UNPAID'
  const isFulfilled = status === 'FULFILLED'

  const editTooltip = isFulfilled
    ? 'Unfulfill and cancel payment first to edit'
    : 'Cancel payment first to edit'

  const cancelTooltip = isFulfilled
    ? 'Unfulfill and cancel payment first'
    : 'Cancel payment first'

  const actions: RowAction[] = []

  actions.push({ label: 'View', onClick: () => props.onView(order) })

  if (status !== 'CANCELLED') {
    actions.push({
      label: 'Edit',
      onClick: () => props.onEdit(order),
      disabled: isPaid || isFulfilled,
      tooltip: isPaid || isFulfilled ? editTooltip : undefined,
    })
  }

  if (status === 'DRAFT' && paymentStatus === 'UNPAID') {
    actions.push({ label: 'Pay', onClick: () => props.onPay(order) })
  }

  if (status === 'DRAFT') {
    actions.push({
      label: 'Fulfill',
      onClick: () => props.onFulfill(order),
      disabled: paymentStatus === 'UNPAID',
      tooltip: paymentStatus === 'UNPAID' ? 'Full payment required' : undefined,
    })
  }

  if (isFulfilled) {
    actions.push({ label: 'Unfulfill', onClick: () => props.onUnfulfill(order) })
  }

  if (
    (status === 'DRAFT' && (paymentStatus === 'PAID' || paymentStatus === 'OVERPAID')) ||
    isFulfilled
  ) {
    actions.push({ label: 'Refund', onClick: () => props.onRefund(order) })
  }

  if (status !== 'CANCELLED') {
    actions.push({
      label: 'Cancel',
      onClick: () => props.onCancel(order),
      disabled: isPaid || isFulfilled,
      tooltip: isPaid || isFulfilled ? cancelTooltip : undefined,
    })
  }

  actions.push({ label: 'Print', onClick: () => props.onPrint(order) })

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
      render: (order) => <SalesOrderStatusChip status={order.status} />,
    },
    {
      key: 'paymentStatus',
      width: '14%',
      raw: true,
      render: (order) => <SalesOrderPaymentStatusChip status={order.paymentStatus} />,
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
      onSelect={() => {}}
      listRef={{ current: null }}
      dataAttr="order"
      paginationSlot={paginationSlot}
    />
  )
}
