import React from 'react'
import { Typography } from '@mui/material'
import { default as PaymentIcon } from '@mui/icons-material/Payment'
import GenericDeletedDialog, { type ColumnDef } from '@/components/common/GenericDeletedDialog'
import {
  useBulkRestorePaymentsMutation,
  useGetDeletedPaymentsQuery,
  useRestorePaymentMutation,
} from '@/store/api/salesApi'
import type { Payment } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

type DeletedPayment = Payment & { deletedAt?: string | Date }

interface DeletedPaymentsDialogProps {
  open: boolean
  onClose: () => void
}

const columns: ColumnDef<DeletedPayment>[] = [
  {
    label: 'Payment Number',
    width: '30%',
    render: (payment) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {payment.paymentNumber || '-'}
      </Typography>
    ),
  },
  {
    label: 'Customer',
    width: '30%',
    render: (payment) => (
      <Typography variant="body2">
        {payment.customer?.name || payment.customerName || '-'}
      </Typography>
    ),
  },
  {
    label: 'Amount',
    width: '15%',
    align: 'right',
    hideOnMobile: true,
    render: (payment) => (
      <Typography variant="caption" color="primary" sx={{ fontWeight: 500 }}>
        {formatCurrency(payment.amount)}
      </Typography>
    ),
  },
  {
    label: 'Deleted Date',
    width: '15%',
    hideOnMobile: true,
    render: (payment) => (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {payment.deletedAt ? formatDate(payment.deletedAt) : 'Unknown'}
      </Typography>
    ),
  },
]

const DeletedPaymentsDialog: React.FC<DeletedPaymentsDialogProps> = ({ open, onClose }) => (
  <GenericDeletedDialog<DeletedPayment>
    open={open}
    onClose={onClose}
    title="Deleted Payments"
    entityLabel="payment"
    entityLabelPlural="payments"
    icon={<PaymentIcon sx={{ color: 'error.main' }} />}
    columns={columns}
    getItemLabel={(payment) => payment.paymentNumber || payment.id}
    searchPlaceholder="Search deleted payments..."
    filterItem={(payment, term) =>
      (payment.paymentNumber?.toLowerCase().includes(term) ?? false) ||
      (payment.customerName?.toLowerCase().includes(term) ?? false) ||
      (payment.customer?.name?.toLowerCase().includes(term) ?? false)
    }
    useGetDeletedQuery={useGetDeletedPaymentsQuery}
    useRestoreMutation={useRestorePaymentMutation}
    useBulkRestoreMutation={useBulkRestorePaymentsMutation}
  />
)

export default DeletedPaymentsDialog
