import React from 'react'
import { Typography } from '@mui/material'
import { default as GRNIcon } from '@mui/icons-material/LocalShipping'
import GenericDeletedDialog, { type ColumnDef } from '@/components/common/GenericDeletedDialog'
import { useGetDeletedGRNsQuery } from '@/store/api/purchasingApi'
import type { GoodsReceivedNote } from '@/types'
import { formatDate } from '@/utils/formatters'

type DeletedGRN = GoodsReceivedNote & { deletedAt?: string | Date }

interface DeletedGRNsDialogProps {
  open: boolean
  onClose: () => void
}

const columns: ColumnDef<DeletedGRN>[] = [
  {
    label: 'GRN Number',
    width: '30%',
    render: (grn) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {grn.grnNumber || '-'}
      </Typography>
    ),
  },
  {
    label: 'Supplier',
    width: '30%',
    render: (grn) => <Typography variant="body2">{grn.supplier?.companyName || '-'}</Typography>,
  },
  {
    label: 'GRN Date',
    width: '15%',
    hideOnMobile: true,
    render: (grn) => (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {grn.receivedDate ? formatDate(grn.receivedDate) : 'Unknown'}
      </Typography>
    ),
  },
  {
    label: 'Deleted Date',
    width: '15%',
    hideOnMobile: true,
    render: (grn) => (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {grn.deletedAt ? formatDate(grn.deletedAt) : 'Unknown'}
      </Typography>
    ),
  },
]

const DeletedGRNsDialog: React.FC<DeletedGRNsDialogProps> = ({ open, onClose }) => (
  <GenericDeletedDialog<DeletedGRN>
    open={open}
    onClose={onClose}
    title="Deleted Goods Received Notes"
    entityLabel="GRN"
    entityLabelPlural="GRNs"
    icon={<GRNIcon sx={{ color: 'error.main' }} />}
    columns={columns}
    getItemLabel={(grn) => grn.grnNumber || grn.id}
    searchPlaceholder="Search deleted GRNs..."
    filterItem={(grn, term) =>
      (grn.grnNumber?.toLowerCase().includes(term) ?? false) ||
      (grn.supplier?.companyName?.toLowerCase().includes(term) ?? false)
    }
    useGetDeletedQuery={useGetDeletedGRNsQuery}
  />
)

export default DeletedGRNsDialog
