import React from 'react'
import { Typography } from '@mui/material'
import { default as PaymentIcon } from '@mui/icons-material/Payment'
import GenericDeletedDialog, { type ColumnDef } from '@/components/common/GenericDeletedDialog'
import { useGetDeletedVendorPaymentsQuery } from '@/store/api/purchasingApi'
import type { VendorPayment } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface DeletedVendorPaymentsDialogProps {
  open: boolean
  onClose: () => void
}

const columns: ColumnDef<VendorPayment>[] = [
  {
    label: 'Payment Number',
    width: '25%',
    render: (payment) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {payment.paymentNumber}
      </Typography>
    ),
  },
  {
    label: 'Supplier',
    width: '30%',
    render: (payment) => <Typography variant="body2">{payment.supplier?.companyName || '-'}</Typography>,
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
    label: 'Payment Date',
    width: '15%',
    hideOnMobile: true,
    render: (payment) => (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {payment.paymentDate ? formatDate(payment.paymentDate) : 'Unknown'}
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

const DeletedVendorPaymentsDialog: React.FC<DeletedVendorPaymentsDialogProps> = ({ open, onClose }) => (
  <GenericDeletedDialog<VendorPayment>
    open={open}
    onClose={onClose}
    title="Deleted Vendor Payments"
    entityLabel="vendor payment"
    entityLabelPlural="vendor payments"
    icon={<PaymentIcon sx={{ color: 'error.main' }} />}
    columns={columns}
    getItemLabel={(payment) => payment.paymentNumber || payment.id}
    searchPlaceholder="Search deleted vendor payments..."
    filterItem={(payment, term) =>
      (payment.paymentNumber?.toLowerCase().includes(term) ?? false) ||
      (payment.supplier?.companyName?.toLowerCase().includes(term) ?? false)
    }
    useGetDeletedQuery={useGetDeletedVendorPaymentsQuery}
  />
)

export default DeletedVendorPaymentsDialog
