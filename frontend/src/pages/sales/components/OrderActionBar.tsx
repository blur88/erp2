import { Box, Button } from '@mui/material'

import type { SalesOrder } from '@/types'

interface OrderActionBarProps {
  order: SalesOrder
  onPay: () => void
  onFulfill: () => void
  onUnfulfill: () => void
  onRefund: () => void
  onEdit: () => void
  onCancel: () => void
  onPrint: () => void
}

export function getOrderActions(order: SalesOrder) {
  const { status, paymentStatus } = order
  const isPaid = paymentStatus === 'PAID' || paymentStatus === 'OVERPAID'

  if (status === 'CANCELLED') {
    return ['print'] as const
  }

  if (status === 'FULFILLED') {
    return ['unfulfill', 'refund', 'print'] as const
  }

  if (status === 'DRAFT' && isPaid) {
    return ['fulfill', 'refund', 'edit', 'cancel', 'print'] as const
  }

  return ['pay', 'edit', 'cancel', 'print'] as const
}

export default function OrderActionBar({
  order,
  onPay,
  onFulfill,
  onUnfulfill,
  onRefund,
  onEdit,
  onCancel,
  onPrint,
}: OrderActionBarProps) {
  const actions = getOrderActions(order)

  return (
    <Box sx={{ display: 'flex', gap: 1, px: 3, pb: 1.5, flexWrap: 'wrap' }}>
      {actions.includes('pay') && (
        <Button variant="contained" size="small" onClick={onPay}>
          Pay
        </Button>
      )}
      {actions.includes('fulfill') && (
        <Button variant="contained" size="small" onClick={onFulfill}>
          Fulfill
        </Button>
      )}
      {actions.includes('unfulfill') && (
        <Button variant="outlined" size="small" onClick={onUnfulfill}>
          Unfulfill
        </Button>
      )}
      {actions.includes('refund') && (
        <Button variant="outlined" size="small" onClick={onRefund}>
          Refund
        </Button>
      )}
      {actions.includes('edit') && (
        <Button variant="outlined" size="small" onClick={onEdit}>
          Edit
        </Button>
      )}
      {actions.includes('cancel') && (
        <Button variant="outlined" size="small" onClick={onCancel}>
          Cancel
        </Button>
      )}
      {actions.includes('print') && (
        <Button variant="outlined" size="small" onClick={onPrint}>
          Print
        </Button>
      )}
    </Box>
  )
}
