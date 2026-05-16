import React from 'react'
import { Typography } from '@mui/material'
import { default as ReceiptIcon } from '@mui/icons-material/Receipt'

import GenericDeletedDialog, { type ColumnDef } from '@/components/common/GenericDeletedDialog'
import {
  useBulkPermanentDeleteExpensesMutation,
  useBulkRestoreExpensesMutation,
  useGetDeletedExpensesQuery,
  usePermanentDeleteExpenseMutation,
  useRestoreExpenseMutation,
} from '@/store/api/accountingApi'
import type { ExpenseRecord } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface Props {
  open: boolean
  onClose: () => void
  onChanged?: () => void
}

type DeletedExpense = ExpenseRecord & { deletedAt?: string | null }

const columns: ColumnDef<DeletedExpense>[] = [
  {
    label: 'Reference',
    width: '25%',
    render: (item) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {item.referenceNumber}
      </Typography>
    ),
  },
  {
    label: 'Vendor',
    width: '25%',
    render: (item) => <Typography variant="body2">{item.vendor ?? '—'}</Typography>,
  },
  {
    label: 'Amount',
    width: '20%',
    render: (item) => <Typography variant="body2">{formatCurrency(item.amount)}</Typography>,
  },
  {
    label: 'Date',
    width: '15%',
    render: (item) => <Typography variant="body2">{formatDate(item.expenseDate)}</Typography>,
  },
  {
    label: 'Deleted',
    width: '15%',
    hideOnMobile: true,
    render: (item) => (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {item.deletedAt ? formatDate(item.deletedAt) : 'Unknown'}
      </Typography>
    ),
  },
]

const DeletedExpensesDialog: React.FC<Props> = ({ open, onClose, onChanged }) => (
  <GenericDeletedDialog<DeletedExpense>
    open={open}
    onClose={onClose}
    title="Deleted Expenses"
    entityLabel="expense"
    entityLabelPlural="expenses"
    icon={<ReceiptIcon sx={{ color: 'error.main' }} />}
    columns={columns}
    getItemLabel={(item) => item.referenceNumber}
    searchPlaceholder="Search deleted expenses..."
    filterItem={(item, term) =>
      item.referenceNumber.toLowerCase().includes(term) ||
      (item.vendor?.toLowerCase().includes(term) ?? false)
    }
    useGetDeletedQuery={useGetDeletedExpensesQuery as any}
    getItems={(data) => (Array.isArray(data) ? (data as DeletedExpense[]) : [])}
    useRestoreMutation={useRestoreExpenseMutation}
    usePermanentDeleteMutation={usePermanentDeleteExpenseMutation}
    useBulkRestoreMutation={useBulkRestoreExpensesMutation as any}
    useBulkPermanentDeleteMutation={useBulkPermanentDeleteExpensesMutation as any}
    onChanged={onChanged}
  />
)

export default DeletedExpensesDialog
