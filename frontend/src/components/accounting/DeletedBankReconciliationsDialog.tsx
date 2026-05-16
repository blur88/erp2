import React from 'react'
import { Typography } from '@mui/material'
import { default as AccountBalanceIcon } from '@mui/icons-material/AccountBalance'
import GenericDeletedDialog, { type ColumnDef } from '@/components/common/GenericDeletedDialog'
import {
  useBulkPermanentDeleteBankReconciliationsMutation,
  useBulkRestoreBankReconciliationsMutation,
  useGetDeletedBankReconciliationsQuery,
  usePermanentDeleteBankReconciliationMutation,
  useRestoreBankReconciliationMutation,
} from '@/store/api/accountingApi'
import type { BankReconciliation } from '@/types'
import { formatDate } from '@/utils/formatters'

type DeletedBankReconciliation = BankReconciliation & { deletedAt?: string | Date }

interface DeletedBankReconciliationsDialogProps {
  open: boolean
  onClose: () => void
  onChanged?: () => void
}

const columns: ColumnDef<DeletedBankReconciliation>[] = [
  {
    label: 'Account',
    width: '30%',
    render: (item) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {item.account ? `${item.account.code} — ${item.account.name}` : '—'}
      </Typography>
    ),
  },
  {
    label: 'Fiscal Period',
    width: '25%',
    render: (item) => <Typography variant="body2">{item.fiscalPeriod?.name ?? '-'}</Typography>,
  },
  {
    label: 'Statement Date',
    width: '20%',
    render: (item) => (
      <Typography variant="body2">{item.reconciliationDate ? formatDate(item.reconciliationDate) : '-'}</Typography>
    ),
  },
  {
    label: 'Deleted Date',
    width: '15%',
    hideOnMobile: true,
    render: (item) => (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {item.deletedAt ? formatDate(item.deletedAt) : 'Unknown'}
      </Typography>
    ),
  },
]

const DeletedBankReconciliationsDialog: React.FC<DeletedBankReconciliationsDialogProps> = ({
  open,
  onClose,
  onChanged,
}) => (
  <GenericDeletedDialog<DeletedBankReconciliation>
    open={open}
    onClose={onClose}
    title="Deleted Reconciliations"
    entityLabel="reconciliation"
    entityLabelPlural="reconciliations"
    icon={<AccountBalanceIcon sx={{ color: 'error.main' }} />}
    columns={columns}
    getItemLabel={(item) => (item.account ? `${item.account.code} — ${item.account.name}` : item.id)}
    searchPlaceholder="Search deleted reconciliations..."
    filterItem={(item, term) =>
      (item.account?.name?.toLowerCase().includes(term) ?? false) ||
      (item.account?.code?.toLowerCase().includes(term) ?? false) ||
      (item.fiscalPeriod?.name?.toLowerCase().includes(term) ?? false)
    }
    useGetDeletedQuery={useGetDeletedBankReconciliationsQuery as any}
    getItems={(data) => (Array.isArray(data) ? (data as DeletedBankReconciliation[]) : [])}
    useRestoreMutation={useRestoreBankReconciliationMutation}
    usePermanentDeleteMutation={usePermanentDeleteBankReconciliationMutation}
    useBulkRestoreMutation={useBulkRestoreBankReconciliationsMutation}
    useBulkPermanentDeleteMutation={useBulkPermanentDeleteBankReconciliationsMutation}
    onChanged={onChanged}
  />
)

export default DeletedBankReconciliationsDialog
