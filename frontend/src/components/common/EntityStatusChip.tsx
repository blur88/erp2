import { Chip } from '@mui/material'

interface EntityStatusChipProps {
  status: string
}

type MuiChipColor = 'default' | 'success' | 'warning' | 'error' | 'info'

interface StatusConfig {
  color: MuiChipColor
  label: string
}

const STATUS_MAP: Record<string, StatusConfig> = {
  paid: { color: 'success', label: 'Paid' },
  completed: { color: 'success', label: 'Completed' },
  posted: { color: 'success', label: 'Posted' },
  received: { color: 'success', label: 'Received' },
  partial_paid: { color: 'warning', label: 'Partial Paid' },
  pending: { color: 'warning', label: 'Pending' },
  draft: { color: 'warning', label: 'Draft' },
  cancelled: { color: 'default', label: 'Cancelled' },
  refunded: { color: 'default', label: 'Refunded' },
  reversed: { color: 'error', label: 'Reversed' },
  failed: { color: 'error', label: 'Failed' },
  overpaid: { color: 'info', label: 'Overpaid' },
}

function toTitleCase(str: string): string {
  return str
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function EntityStatusChip({ status }: EntityStatusChipProps) {
  const config = STATUS_MAP[status.toLowerCase()]
  return (
    <Chip
      size="small"
      color={config?.color ?? 'default'}
      label={config?.label ?? toTitleCase(status)}
      sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'capitalize' }}
    />
  )
}
