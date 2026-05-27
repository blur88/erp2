import { Box, Button } from '@mui/material'

import type { SalesOrder } from '@/types'

import { getOrderActionMetas } from '../utils/orderActions'

interface OrderActionBarProps {
  order: SalesOrder
  onPay: () => void
  onFulfill: () => void
  onUnfulfill: () => void
  onRefund: () => void
  onEdit: () => void
  onCancel: () => void
  onUncancel: () => void
  onDuplicate: () => void
  onPrint: () => void
}

export default function OrderActionBar({
  order,
  onPay,
  onFulfill,
  onUnfulfill,
  onRefund,
  onEdit,
  onCancel,
  onUncancel,
  onDuplicate,
  onPrint,
}: OrderActionBarProps) {
  const metas = getOrderActionMetas(order)

  const handlers: Record<string, () => void> = {
    pay: onPay,
    fulfill: onFulfill,
    unfulfill: onUnfulfill,
    refund: onRefund,
    edit: onEdit,
    cancel: onCancel,
    uncancel: onUncancel,
    duplicate: onDuplicate,
    print: onPrint,
  }

  const labels: Record<string, string> = {
    pay: 'Pay',
    fulfill: 'Fulfill',
    unfulfill: 'Unfulfill',
    refund: 'Refund',
    edit: 'Edit',
    cancel: 'Cancel',
    uncancel: 'Uncancel',
    duplicate: 'Duplicate',
    print: 'Print',
  }

  const variants: Record<string, 'contained' | 'outlined'> = {
    pay: 'contained',
    fulfill: 'contained',
    unfulfill: 'outlined',
    refund: 'outlined',
    edit: 'outlined',
    cancel: 'outlined',
    uncancel: 'outlined',
    duplicate: 'outlined',
    print: 'outlined',
  }

  return (
    <Box sx={{ display: 'flex', gap: 1, px: 3, pb: 1.5, flexWrap: 'wrap' }}>
      {metas.map(({ action, disabled, tooltip }) => (
        <Button
          key={action}
          variant={variants[action]}
          size="small"
          onClick={handlers[action]}
          disabled={disabled}
          title={tooltip}
        >
          {labels[action]}
        </Button>
      ))}
    </Box>
  )
}
