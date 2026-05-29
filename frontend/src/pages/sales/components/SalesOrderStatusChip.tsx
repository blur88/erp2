import { Chip } from '@mui/material'

type OrderStatus = 'DRAFT' | 'FULFILLED' | 'CANCELLED'
type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERPAID'

type ChipConfig = { label: string; color: 'warning' | 'success' | 'default' | 'info' }

const STATUS_CONFIG: Record<OrderStatus, ChipConfig> = {
  DRAFT: { label: 'Draft', color: 'warning' },
  FULFILLED: { label: 'Fulfilled', color: 'success' },
  CANCELLED: { label: 'Cancelled', color: 'default' },
}

const READY_CONFIG: ChipConfig = { label: 'Ready', color: 'info' }

interface Props {
  status: OrderStatus
  paymentStatus?: PaymentStatus
}

export function SalesOrderStatusChip({ status, paymentStatus }: Props) {
  const config: ChipConfig =
    status === 'DRAFT' && paymentStatus === 'PAID'
      ? READY_CONFIG
      : (STATUS_CONFIG[status] ?? { label: status, color: 'default' })

  return (
    <Chip
      size="small"
      color={config.color}
      label={config.label}
      sx={{ fontSize: '0.75rem', fontWeight: 600 }}
    />
  )
}
