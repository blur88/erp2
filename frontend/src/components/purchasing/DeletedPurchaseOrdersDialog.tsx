import React from 'react'
import { Typography } from '@mui/material'
import { default as OrderIcon } from '@mui/icons-material/Description'
import GenericDeletedDialog, { type ColumnDef } from '@/components/common/GenericDeletedDialog'
import {
  useBulkPermanentDeletePurchaseOrdersMutation,
  useBulkRestorePurchaseOrdersMutation,
  useGetDeletedPurchaseOrdersQuery,
  usePermanentDeletePurchaseOrderMutation,
  useRestorePurchaseOrderMutation,
} from '@/store/api/purchasingApi'
import type { PurchaseOrder } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

type DeletedPurchaseOrder = PurchaseOrder & { deletedAt?: string | Date }

interface DeletedPurchaseOrdersDialogProps {
  open: boolean
  onClose: () => void
  onRefresh?: () => void
}

const columns: ColumnDef<DeletedPurchaseOrder>[] = [
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
    label: 'Supplier',
    width: '30%',
    render: (order) => <Typography variant="body2">{order.supplier?.companyName || '-'}</Typography>,
  },
  {
    label: 'Total',
    width: '15%',
    align: 'right',
    hideOnMobile: true,
    render: (order) => (
      <Typography variant="caption" color="primary" sx={{ fontWeight: 500 }}>
        {formatCurrency(order.totalAmount ?? order.total)}
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

const DeletedPurchaseOrdersDialog: React.FC<DeletedPurchaseOrdersDialogProps> = ({ open, onClose, onRefresh }) => (
  <GenericDeletedDialog<DeletedPurchaseOrder>
    open={open}
    onClose={onClose}
    title="Deleted Purchase Orders"
    entityLabel="purchase order"
    entityLabelPlural="purchase orders"
    icon={<OrderIcon sx={{ color: 'error.main' }} />}
    columns={columns}
    getItemLabel={(order) => order.orderNumber}
    searchPlaceholder="Search deleted purchase orders..."
    filterItem={(order, term) =>
      order.orderNumber?.toLowerCase().includes(term) ||
      (order.supplier?.companyName?.toLowerCase().includes(term) ?? false)
    }
    useGetDeletedQuery={useGetDeletedPurchaseOrdersQuery}
    useRestoreMutation={useRestorePurchaseOrderMutation}
    usePermanentDeleteMutation={usePermanentDeletePurchaseOrderMutation}
    useBulkRestoreMutation={useBulkRestorePurchaseOrdersMutation}
    useBulkPermanentDeleteMutation={useBulkPermanentDeletePurchaseOrdersMutation}
    onChanged={onRefresh}
  />
)

export default DeletedPurchaseOrdersDialog
