import React from 'react'
import { Typography } from '@mui/material'
import { default as OrderIcon } from '@mui/icons-material/Receipt'
import GenericDeletedDialog, { type ColumnDef } from '@/components/common/GenericDeletedDialog'
import {
  useBulkPermanentDeleteSalesOrdersMutation,
  useBulkRestoreSalesOrdersMutation,
  useGetDeletedSalesOrdersQuery,
  usePermanentDeleteSalesOrderMutation,
  useRestoreSalesOrderMutation,
} from '@/store/api/salesApi'
import type { SalesOrder } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

type DeletedSalesOrder = SalesOrder & { deletedAt?: string | Date }

interface DeletedOrdersDialogProps {
  open: boolean
  onClose: () => void
}

const columns: ColumnDef<DeletedSalesOrder>[] = [
  {
    label: 'Order Number',
    width: '25%',
    render: (order) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {order.orderNumber}
      </Typography>
    ),
  },
  {
    label: 'Customer',
    width: '25%',
    render: (order) => <Typography variant="body2">{order.customer?.name || '-'}</Typography>,
  },
  {
    label: 'Total',
    width: '15%',
    align: 'right',
    hideOnMobile: true,
    render: (order) => (
      <Typography variant="caption" color="primary" sx={{ fontWeight: 500 }}>
        {formatCurrency(order.totalAmount)}
      </Typography>
    ),
  },
  {
    label: 'Deleted Date',
    width: '15%',
    hideOnMobile: true,
    render: (order) => (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {order.deletedAt ? formatDate(order.deletedAt) : 'Unknown'}
      </Typography>
    ),
  },
]

const DeletedOrdersDialog: React.FC<DeletedOrdersDialogProps> = ({ open, onClose }) => (
  <GenericDeletedDialog<DeletedSalesOrder>
    open={open}
    onClose={onClose}
    title="Deleted Orders"
    entityLabel="order"
    entityLabelPlural="orders"
    icon={<OrderIcon sx={{ color: 'error.main' }} />}
    columns={columns}
    getItemLabel={(order) => order.orderNumber}
    searchPlaceholder="Search deleted orders..."
    filterItem={(order, term) =>
      order.orderNumber?.toLowerCase().includes(term) ||
      (order.customer?.name?.toLowerCase().includes(term) ?? false)
    }
    useGetDeletedQuery={useGetDeletedSalesOrdersQuery}
    useRestoreMutation={useRestoreSalesOrderMutation}
    usePermanentDeleteMutation={usePermanentDeleteSalesOrderMutation}
    useBulkRestoreMutation={useBulkRestoreSalesOrdersMutation}
    useBulkPermanentDeleteMutation={useBulkPermanentDeleteSalesOrdersMutation}
  />
)

export default DeletedOrdersDialog
