import { Chip } from '@mui/material'

interface EntityStatusChipProps {
  status?: string | null
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
  active: { color: 'success', label: 'Active' },
  partial_paid: { color: 'warning', label: 'Partial Paid' },
  pending: { color: 'warning', label: 'Pending' },
  draft: { color: 'warning', label: 'Draft' },
  cancelled: { color: 'default', label: 'Cancelled' },
  refunded: { color: 'default', label: 'Refunded' },
  inactive: { color: 'default', label: 'Inactive' },
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
  const normalizedStatus = status?.toString().trim() ?? ''
  const config = STATUS_MAP[normalizedStatus.toLowerCase()]
  return (
    <Chip
      size="small"
      color={config?.color ?? 'default'}
      label={config?.label ?? (normalizedStatus ? toTitleCase(normalizedStatus) : 'Unknown')}
      sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'capitalize' }}
    />
  )
}
