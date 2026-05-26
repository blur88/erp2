import { Chip } from '@mui/material'

type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERPAID'

const STATUS_CONFIG: Record<
  PaymentStatus,
  { label: string; color: 'error' | 'warning' | 'success' | 'info' }
> = {
  UNPAID: { label: 'Unpaid', color: 'error' },
  PARTIAL: { label: 'Partial', color: 'warning' },
  PAID: { label: 'Paid', color: 'success' },
  OVERPAID: { label: 'Overpaid', color: 'info' },
}

interface Props {
  status: PaymentStatus
}

export function SalesOrderPaymentStatusChip({ status }: Props) {
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
