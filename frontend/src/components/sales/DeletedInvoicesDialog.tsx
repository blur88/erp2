import React from 'react'
import { Typography } from '@mui/material'
import { default as InvoiceIcon } from '@mui/icons-material/ReceiptLong'
import GenericDeletedDialog, { type ColumnDef } from '@/components/common/GenericDeletedDialog'
import {
  useBulkRestoreInvoicesMutation,
  useGetDeletedInvoicesQuery,
  useRestoreInvoiceMutation,
} from '@/store/api/salesApi'
import type { Invoice } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

type DeletedInvoice = Invoice & {
  customerName?: string
  totalAmount?: number
  deletedAt?: string | Date
}

interface DeletedInvoicesDialogProps {
  open: boolean
  onClose: () => void
}

const columns: ColumnDef<DeletedInvoice>[] = [
  {
    label: 'Invoice Number',
    width: '30%',
    render: (invoice) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {invoice.invoiceNumber || '-'}
      </Typography>
    ),
  },
  {
    label: 'Customer',
    width: '30%',
    render: (invoice) => (
      <Typography variant="body2">
        {invoice.customer?.name || invoice.customerName || '-'}
      </Typography>
    ),
  },
  {
    label: 'Total',
    width: '15%',
    align: 'right',
    hideOnMobile: true,
    render: (invoice) => (
      <Typography variant="caption" color="primary" sx={{ fontWeight: 500 }}>
        {formatCurrency(invoice.totalAmount ?? invoice.total ?? 0)}
      </Typography>
    ),
  },
  {
    label: 'Deleted Date',
    width: '15%',
    hideOnMobile: true,
    render: (invoice) => (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {invoice.deletedAt ? formatDate(invoice.deletedAt) : 'Unknown'}
      </Typography>
    ),
  },
]

const DeletedInvoicesDialog: React.FC<DeletedInvoicesDialogProps> = ({ open, onClose }) => (
  <GenericDeletedDialog<DeletedInvoice>
    open={open}
    onClose={onClose}
    title="Deleted Invoices"
    entityLabel="invoice"
    entityLabelPlural="invoices"
    icon={<InvoiceIcon sx={{ color: 'error.main' }} />}
    columns={columns}
    getItemLabel={(invoice) => invoice.invoiceNumber || invoice.id}
    searchPlaceholder="Search deleted invoices..."
    filterItem={(invoice, term) =>
      (invoice.invoiceNumber?.toLowerCase().includes(term) ?? false) ||
      (invoice.customerName?.toLowerCase().includes(term) ?? false) ||
      (invoice.customer?.name?.toLowerCase().includes(term) ?? false)
    }
    useGetDeletedQuery={useGetDeletedInvoicesQuery}
    useRestoreMutation={useRestoreInvoiceMutation}
    useBulkRestoreMutation={useBulkRestoreInvoicesMutation}
  />
)

export default DeletedInvoicesDialog
