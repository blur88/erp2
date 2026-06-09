import type { ReactNode } from 'react'
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined'
import { Box, Typography } from '@mui/material'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import RowActionMenu, { type RowAction } from '@/components/common/RowActionMenu'
import type { PurchaseOrder } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

import { getPurchaseOrderActionMetas } from '../utils/purchaseOrderActions'
import PurchaseOrderPaymentStatusChip from './PurchaseOrderPaymentStatusChip'
import PurchaseOrderStatusChip from './PurchaseOrderStatusChip'

interface PurchaseOrderListProps {
  orders: PurchaseOrder[]
  loading: boolean
  total: number
  onView: (order: PurchaseOrder) => void
  onEdit: (order: PurchaseOrder) => void
  onPay: (order: PurchaseOrder) => void
  onReceive: (order: PurchaseOrder) => void
  onReturn: (order: PurchaseOrder) => void
  onCancel: (order: PurchaseOrder) => void
  onUnpay: (order: PurchaseOrder) => void
  onPrint: (order: PurchaseOrder) => void
  paginationSlot?: ReactNode
}

function buildActions(order: PurchaseOrder, props: PurchaseOrderListProps): RowAction[] {
  const metas = getPurchaseOrderActionMetas(order)

  const handlers: Record<string, () => void> = {
    pay: () => props.onPay(order),
    receive: () => props.onReceive(order),
    return: () => props.onReturn(order),
    edit: () => props.onEdit(order),
    cancel: () => props.onCancel(order),
    unpay: () => props.onUnpay(order),
    print: () => props.onPrint(order),
  }

  const labels: Record<string, string> = {
    pay: 'Pay',
    receive: 'Receive',
    return: 'Return',
    edit: 'Edit',
    cancel: 'Cancel',
    unpay: 'Unpay',
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

export default function PurchaseOrderList(props: PurchaseOrderListProps) {
  const { orders, loading, total, paginationSlot } = props

  const columns: ColumnConfig<PurchaseOrder>[] = [
    { key: 'orderNumber', width: '12%', render: (order) => order.orderNumber },
    { key: 'supplier', width: '22%', render: (order) => order.supplier?.companyName ?? '-' },
    { key: 'orderDate', width: '13%', render: (order) => formatDate(order.orderDate) },
    { key: 'totalAmount', width: '14%', render: (order) => formatCurrency(order.totalAmount ?? order.total ?? 0) },
    {
      key: 'status',
      width: '13%',
      raw: true,
      render: (order) => <PurchaseOrderStatusChip status={order.status} />,
    },
    {
      key: 'paymentStatus',
      width: '14%',
      raw: true,
      render: (order) => <PurchaseOrderPaymentStatusChip status={order.paymentStatus} />,
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
          No purchase orders yet. Create your first purchase order to get started.
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
      label="Purchase Orders"
      showHeader={false}
      headers={['PO #', 'Supplier', 'Date', 'Total', 'Status', 'Payment', 'Actions']}
      selectedId={undefined}
      focusedIndex={-1}
      onSelect={props.onView}
      listRef={{ current: null }}
      dataAttr="order"
      paginationSlot={paginationSlot}
    />
  )
}
