import { Chip } from '@mui/material'

import type { PurchaseOrderStatus } from '@/types'

type ChipConfig = { label: string; color: 'warning' | 'success' | 'default' | 'info' }

const STATUS_CONFIG: Record<PurchaseOrderStatus, ChipConfig> = {
  DRAFT: { label: 'Draft', color: 'warning' },
  READY: { label: 'Ready', color: 'info' },
  RECEIVED: { label: 'Received', color: 'success' },
  CANCELLED: { label: 'Cancelled', color: 'default' },
}

interface Props {
  status: PurchaseOrderStatus
}

export default function PurchaseOrderStatusChip({ status }: Props) {
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
