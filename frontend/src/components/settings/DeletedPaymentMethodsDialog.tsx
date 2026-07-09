import React from 'react'
import { Typography } from '@mui/material'
import { default as PaymentIcon } from '@mui/icons-material/Payment'
import GenericDeletedDialog, { type ColumnDef } from '@/components/common/GenericDeletedDialog'
import {
  useGetDeletedPaymentMethodsQuery,
  usePermanentDeletePaymentMethodMutation,
  useRestorePaymentMethodMutation,
} from '@/store/api/paymentMethodsApi'
import type { PaymentMethodConfig } from '@/types'
import { formatDate } from '@/utils/formatters'

interface DeletedPaymentMethodsDialogProps {
  open: boolean
  onClose: () => void
}

const columns: ColumnDef<PaymentMethodConfig>[] = [
  {
    label: 'Code',
    width: '15%',
    render: (method) => (
      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
        {method.code}
      </Typography>
    ),
  },
  {
    label: 'Name',
    width: '35%',
    render: (method) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {method.name}
      </Typography>
    ),
  },
  {
    label: 'Deleted Date',
    width: '20%',
    hideOnMobile: true,
    render: (method) => (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {method.deletedAt ? formatDate(method.deletedAt) : 'Unknown'}
      </Typography>
    ),
  },
]

const DeletedPaymentMethodsDialog: React.FC<DeletedPaymentMethodsDialogProps> = ({ open, onClose }) => (
  <GenericDeletedDialog<PaymentMethodConfig>
    open={open}
    onClose={onClose}
    title="Deleted Payment Methods"
    entityLabel="payment method"
    entityLabelPlural="payment methods"
    icon={<PaymentIcon sx={{ color: 'error.main' }} />}
    columns={columns}
    getItemLabel={(method) => method.name}
    searchPlaceholder="Search deleted payment methods..."
    filterItem={(method, term) =>
      method.name?.toLowerCase().includes(term) ||
      method.code?.toLowerCase().includes(term)
    }
    useGetDeletedQuery={useGetDeletedPaymentMethodsQuery}
    queryArg={undefined}
    getItems={(data) => (Array.isArray(data) ? data : [])}
    useRestoreMutation={useRestorePaymentMethodMutation}
    usePermanentDeleteMutation={usePermanentDeletePaymentMethodMutation}
  />
)

export default DeletedPaymentMethodsDialog
