import { Chip } from '@mui/material'

type OrderStatus = 'DRAFT' | 'READY' | 'FULFILLED' | 'CANCELLED'
type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERPAID'

type ChipConfig = { label: string; color: 'warning' | 'success' | 'default' | 'info' }

const STATUS_CONFIG: Record<OrderStatus, ChipConfig> = {
  DRAFT: { label: 'Draft', color: 'warning' },
  READY: { label: 'Ready', color: 'info' },
  FULFILLED: { label: 'Fulfilled', color: 'success' },
  CANCELLED: { label: 'Cancelled', color: 'default' },
}

interface Props {
  status: OrderStatus
  paymentStatus?: PaymentStatus
}

export function SalesOrderStatusChip({ status }: Props) {
  const config: ChipConfig = STATUS_CONFIG[status] ?? { label: status, color: 'default' }

  return (
    <Chip
      size="small"
      color={config.color}
      label={config.label}
      sx={{ fontSize: '0.75rem', fontWeight: 600 }}
    />
  )
}
