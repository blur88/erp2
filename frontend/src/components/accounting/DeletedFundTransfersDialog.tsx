import React from 'react'
import { Typography } from '@mui/material'
import { default as SyncAltIcon } from '@mui/icons-material/SyncAlt'

import GenericDeletedDialog, { type ColumnDef } from '@/components/common/GenericDeletedDialog'
import {
  useGetDeletedFundTransfersQuery,
  usePermanentDeleteFundTransferMutation,
  useRestoreFundTransferMutation,
} from '@/store/api/accountingApi'
import type { FundTransfer } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface Props {
  open: boolean
  onClose: () => void
  onChanged?: () => void
}

type DeletedFundTransfer = FundTransfer & { deletedAt?: string | null }

const columns: ColumnDef<DeletedFundTransfer>[] = [
  {
    label: 'Reference',
    width: '20%',
    render: (item) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {item.referenceNumber}
      </Typography>
    ),
  },
  {
    label: 'From Account',
    width: '22%',
    render: (item) => <Typography variant="body2">{item.sourceAccount.name}</Typography>,
  },
  {
    label: 'To Account',
    width: '22%',
    render: (item) => <Typography variant="body2">{item.destinationAccount.name}</Typography>,
  },
  {
    label: 'Amount',
    width: '16%',
    render: (item) => <Typography variant="body2">{formatCurrency(item.amount)}</Typography>,
  },
  {
    label: 'Date',
    width: '10%',
    render: (item) => <Typography variant="body2">{formatDate(item.transferDate)}</Typography>,
  },
  {
    label: 'Deleted',
    width: '10%',
    hideOnMobile: true,
    render: (item) => (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {item.deletedAt ? formatDate(item.deletedAt) : 'Unknown'}
      </Typography>
    ),
  },
]

const DeletedFundTransfersDialog: React.FC<Props> = ({ open, onClose, onChanged }) => (
  <GenericDeletedDialog<DeletedFundTransfer>
    open={open}
    onClose={onClose}
    title="Deleted Fund Transfers"
    entityLabel="fund transfer"
    entityLabelPlural="fund transfers"
    icon={<SyncAltIcon sx={{ color: 'error.main' }} />}
    columns={columns}
    getItemLabel={(item) => item.referenceNumber}
    searchPlaceholder="Search deleted fund transfers..."
    filterItem={(item, term) =>
      item.referenceNumber.toLowerCase().includes(term) ||
      item.sourceAccount.name.toLowerCase().includes(term) ||
      item.destinationAccount.name.toLowerCase().includes(term)
    }
    useGetDeletedQuery={useGetDeletedFundTransfersQuery as any}
    getItems={(data) => (Array.isArray(data) ? (data as DeletedFundTransfer[]) : [])}
    useRestoreMutation={useRestoreFundTransferMutation}
    usePermanentDeleteMutation={usePermanentDeleteFundTransferMutation}
    onChanged={onChanged}
  />
)

export default DeletedFundTransfersDialog
