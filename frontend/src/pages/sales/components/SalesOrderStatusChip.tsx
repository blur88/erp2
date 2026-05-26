import { Chip } from '@mui/material'

type OrderStatus = 'DRAFT' | 'FULFILLED' | 'CANCELLED'

const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; color: 'warning' | 'success' | 'default' }
> = {
  DRAFT: { label: 'Draft', color: 'warning' },
  FULFILLED: { label: 'Fulfill', color: 'success' },
  CANCELLED: { label: 'Cancelled', color: 'default' },
}

interface Props {
  status: OrderStatus
}

export function SalesOrderStatusChip({ status }: Props) {
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
