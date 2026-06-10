import { Box, Button } from '@mui/material'

import type { PurchaseOrder } from '@/types'

import { getPurchaseOrderActionMetas } from '../utils/purchaseOrderActions'

interface PurchaseOrderActionBarProps {
  order: PurchaseOrder
  onPay: () => void
  onReceive: () => void
  onReturn: () => void
  onEdit: () => void
  onCancel: () => void
  onUncancel: () => void
  onDuplicate: () => void
  onRefund: () => void
  onPrint: () => void
}

export default function PurchaseOrderActionBar({
  order,
  onPay,
  onReceive,
  onReturn,
  onEdit,
  onCancel,
  onUncancel,
  onDuplicate,
  onRefund,
  onPrint,
}: PurchaseOrderActionBarProps) {
  const metas = getPurchaseOrderActionMetas(order)

  const handlers: Record<string, () => void> = {
    pay: onPay,
    receive: onReceive,
    return: onReturn,
    edit: onEdit,
    cancel: onCancel,
    uncancel: onUncancel,
    duplicate: onDuplicate,
    refund: onRefund,
    print: onPrint,
  }

  const labels: Record<string, string> = {
    pay: 'Pay',
    receive: 'Receive',
    return: 'Return',
    edit: 'Edit',
    cancel: 'Cancel',
    uncancel: 'Uncancel',
    duplicate: 'Duplicate',
    refund: 'Refund',
    print: 'Print',
  }

  const variants: Record<string, 'contained' | 'outlined'> = {
    pay: 'contained',
    receive: 'contained',
    return: 'outlined',
    edit: 'outlined',
    cancel: 'outlined',
    uncancel: 'outlined',
    duplicate: 'outlined',
    refund: 'outlined',
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
