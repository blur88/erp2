import React from 'react'
import { Chip, Typography } from '@mui/material'
import { default as AssessmentIcon } from '@mui/icons-material/Assessment'
import GenericDeletedDialog, { type ColumnDef } from '@/components/common/GenericDeletedDialog'
import {
  useBulkPermanentDeleteStockAdjustmentsMutation,
  useGetDeletedStockAdjustmentsQuery,
  usePermanentDeleteStockAdjustmentMutation,
  useRestoreStockAdjustmentMutation,
} from '@/store/api/inventoryApi'
import type { StockAdjustment } from '@/types'
import { formatDate } from '@/utils/formatters'

interface DeletedStockAdjustmentsDialogProps {
  open: boolean
  onClose: () => void
}

type DeletedStockAdjustment = StockAdjustment & { deletedAt?: string | Date }

const getStatusColor = (status: string): 'warning' | 'success' | 'error' => {
  switch (status.toLowerCase()) {
    case 'completed':
      return 'success'
    case 'cancelled':
      return 'error'
    default:
      return 'warning'
  }
}

const columns: ColumnDef<DeletedStockAdjustment>[] = [
  {
    label: 'Adjustment Number',
    width: '25%',
    render: (adjustment) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {adjustment.adjustmentNumber}
      </Typography>
    ),
  },
  {
    label: 'Status',
    width: '15%',
    render: (adjustment) => (
      <Chip
        label={adjustment.status}
        size="small"
        color={getStatusColor(adjustment.status)}
        variant="outlined"
        sx={{ fontSize: '0.7rem', fontWeight: 500, height: 20, textTransform: 'capitalize' }}
      />
    ),
  },
  {
    label: 'Notes',
    width: '25%',
    hideOnMobile: true,
    render: (adjustment) => (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {adjustment.notes || '-'}
      </Typography>
    ),
  },
  {
    label: 'Deleted Date',
    width: '15%',
    hideOnMobile: true,
    render: (adjustment) => (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {adjustment.deletedAt ? formatDate(adjustment.deletedAt) : 'Unknown'}
      </Typography>
    ),
  },
]

const DeletedStockAdjustmentsDialog: React.FC<DeletedStockAdjustmentsDialogProps> = ({ open, onClose }) => (
  <GenericDeletedDialog<DeletedStockAdjustment>
    open={open}
    onClose={onClose}
    title="Deleted Stock Adjustments"
    entityLabel="stock adjustment"
    entityLabelPlural="stock adjustments"
    icon={<AssessmentIcon sx={{ color: 'error.main' }} />}
    columns={columns}
    getItemLabel={(adjustment) => adjustment.adjustmentNumber}
    searchPlaceholder="Search deleted stock adjustments..."
    filterItem={(adjustment, term) =>
      adjustment.adjustmentNumber?.toLowerCase().includes(term) ||
      (adjustment.notes?.toLowerCase().includes(term) ?? false)
    }
    useGetDeletedQuery={useGetDeletedStockAdjustmentsQuery}
    useRestoreMutation={useRestoreStockAdjustmentMutation}
    usePermanentDeleteMutation={usePermanentDeleteStockAdjustmentMutation}
    useBulkPermanentDeleteMutation={useBulkPermanentDeleteStockAdjustmentsMutation}
  />
)

export default DeletedStockAdjustmentsDialog
