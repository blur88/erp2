import React from 'react'
import { Chip, Typography } from '@mui/material'
import { default as AccountIcon } from '@mui/icons-material/AccountBalance'
import GenericDeletedDialog, { type ColumnDef } from '@/components/common/GenericDeletedDialog'
import {
  useBulkPermanentDeleteChartOfAccountsMutation,
  useBulkRestoreChartOfAccountsMutation,
  useGetDeletedChartOfAccountsQuery,
  usePermanentDeleteChartOfAccountMutation,
  useRestoreChartOfAccountMutation,
} from '@/store/api/accountingApi'
import type { ChartOfAccount } from '@/types'
import { formatDate } from '@/utils/formatters'

interface DeletedAccountsDialogProps {
  open: boolean
  onClose: () => void
  onChanged?: () => void
}

const columns: ColumnDef<ChartOfAccount>[] = [
  {
    label: 'Code',
    width: '15%',
    render: (account) => (
      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
        {account.code}
      </Typography>
    ),
  },
  {
    label: 'Account Name',
    width: '35%',
    render: (account) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {account.name}
      </Typography>
    ),
  },
  {
    label: 'Type',
    width: '20%',
    render: (account) => (
      <Chip label={account.type} size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />
    ),
  },
  {
    label: 'Deleted Date',
    width: '15%',
    hideOnMobile: true,
    render: (account) => (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {account.deletedAt ? formatDate(account.deletedAt) : 'Unknown'}
      </Typography>
    ),
  },
]

const DeletedAccountsDialog: React.FC<DeletedAccountsDialogProps> = ({ open, onClose, onChanged }) => (
  <GenericDeletedDialog<ChartOfAccount>
    open={open}
    onClose={onClose}
    title="Deleted Accounts"
    entityLabel="account"
    entityLabelPlural="accounts"
    icon={<AccountIcon sx={{ color: 'error.main' }} />}
    columns={columns}
    getItemLabel={(account) => `${account.code} - ${account.name}`}
    searchPlaceholder="Search deleted accounts..."
    filterItem={(account, term) =>
      account.code?.toLowerCase().includes(term) ||
      account.name?.toLowerCase().includes(term) ||
      (account.type?.toLowerCase().includes(term) ?? false)
    }
    useGetDeletedQuery={useGetDeletedChartOfAccountsQuery}
    queryArg={{ page: 1 }}
    useRestoreMutation={useRestoreChartOfAccountMutation}
    usePermanentDeleteMutation={usePermanentDeleteChartOfAccountMutation}
    useBulkRestoreMutation={useBulkRestoreChartOfAccountsMutation}
    useBulkPermanentDeleteMutation={useBulkPermanentDeleteChartOfAccountsMutation}
    onChanged={onChanged}
  />
)

export default DeletedAccountsDialog
