import React from 'react'
import { Typography } from '@mui/material'
import { default as ReceiptIcon } from '@mui/icons-material/Receipt'

import GenericDeletedDialog, { type ColumnDef } from '@/components/common/GenericDeletedDialog'
import {
  useGetDeletedSettlementsQuery,
  usePermanentDeleteSettlementMutation,
  useRestoreSettlementMutation,
} from '@/store/api/accountingApi'
import type { Settlement } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface Props {
  open: boolean
  onClose: () => void
  onChanged?: () => void
}

type DeletedSettlement = Settlement & { deletedAt?: string | null }

const columns: ColumnDef<DeletedSettlement>[] = [
  {
    label: 'Settlement #',
    width: '22%',
    render: (item) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {item.settlementNumber}
      </Typography>
    ),
  },
  {
    label: 'Payment Method',
    width: '22%',
    render: (item) => <Typography variant="body2">{item.paymentMethod?.name || '-'}</Typography>,
  },
  {
    label: 'Amount',
    width: '18%',
    render: (item) => <Typography variant="body2">{formatCurrency(Number(item.totalAmount))}</Typography>,
  },
  {
    label: 'Date',
    width: '18%',
    render: (item) => <Typography variant="body2">{formatDate(item.settlementDate)}</Typography>,
  },
  {
    label: 'Deleted',
    width: '20%',
    hideOnMobile: true,
    render: (item) => (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {item.deletedAt ? formatDate(item.deletedAt) : 'Unknown'}
      </Typography>
    ),
  },
]

const DeletedSettlementsDialog: React.FC<Props> = ({ open, onClose, onChanged }) => (
  <GenericDeletedDialog<DeletedSettlement>
    open={open}
    onClose={onClose}
    title="Deleted Settlements"
    entityLabel="settlement"
    entityLabelPlural="settlements"
    icon={<ReceiptIcon sx={{ color: 'error.main' }} />}
    columns={columns}
    getItemLabel={(item) => item.settlementNumber}
    searchPlaceholder="Search deleted settlements..."
    filterItem={(item, term) =>
      item.settlementNumber.toLowerCase().includes(term) ||
      (item.paymentMethod?.name?.toLowerCase() ?? '').includes(term) ||
      (item.reference?.toLowerCase() ?? '').includes(term)
    }
    useGetDeletedQuery={useGetDeletedSettlementsQuery as any}
    getItems={(data) => (Array.isArray(data) ? (data as DeletedSettlement[]) : [])}
    useRestoreMutation={useRestoreSettlementMutation}
    usePermanentDeleteMutation={usePermanentDeleteSettlementMutation}
    onChanged={onChanged}
  />
)

export default DeletedSettlementsDialog
