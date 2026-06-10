import { Chip } from '@mui/material'

import type { PurchaseOrderPaymentStatus } from '@/types'

const STATUS_CONFIG: Record<
  PurchaseOrderPaymentStatus,
  { label: string; color: 'error' | 'warning' | 'success' | 'info' }
> = {
  UNPAID: { label: 'Unpaid', color: 'error' },
  PARTIAL: { label: 'Partial', color: 'warning' },
  PAID: { label: 'Paid', color: 'success' },
  OVERPAID: { label: 'Overpaid', color: 'info' },
}

interface Props {
  status: PurchaseOrderPaymentStatus
}

export default function PurchaseOrderPaymentStatusChip({ status }: Props) {
  const config = STATUS_CONFIG[status] ?? { label: status, color: 'default' as const }

  return (
    <Chip
      size="small"
      color={config.color}
      label={config.label}
      sx={{ fontSize: '0.75rem', fontWeight: 600 }}
    />
  )
}
