export type MuiChipColor = 'default' | 'success' | 'warning' | 'error' | 'info'

interface StatusConfig {
  color: MuiChipColor
  label: string
}

export const STATUS_MAP: Record<string, StatusConfig> = {
  draft: { color: 'warning', label: 'Draft' },
  ready: { color: 'info', label: 'Ready' },
  pending: { color: 'warning', label: 'Pending' },
  confirmed: { color: 'info', label: 'Confirmed' },
  in_progress: { color: 'info', label: 'In Progress' },
  open: { color: 'success', label: 'Open' },
  fulfilled: { color: 'success', label: 'Fulfilled' },
  received: { color: 'success', label: 'Received' },
  completed: { color: 'success', label: 'Completed' },
  posted: { color: 'success', label: 'Posted' },
  active: { color: 'success', label: 'Active' },
  paid: { color: 'success', label: 'Paid' },
  settled: { color: 'success', label: 'Settled' },
  unsettled: { color: 'warning', label: 'Unsettled' },
  healthy: { color: 'success', label: 'Healthy' },
  in_stock: { color: 'success', label: 'In Stock' },
  low_stock: { color: 'warning', label: 'Low Stock' },
  out_of_stock: { color: 'error', label: 'Out of Stock' },
  partial: { color: 'warning', label: 'Partial' },
  partial_paid: { color: 'warning', label: 'Partial Paid' },
  suspended: { color: 'warning', label: 'Suspended' },
  degraded: { color: 'warning', label: 'Degraded' },
  unfulfilled: { color: 'warning', label: 'Unfulfilled' },
  not_received: { color: 'warning', label: 'Not Received' },
  insufficient: { color: 'warning', label: 'Insufficient' },
  overpaid: { color: 'info', label: 'Overpaid' },
  unpaid: { color: 'error', label: 'Unpaid' },
  failed: { color: 'error', label: 'Failed' },
  reversed: { color: 'error', label: 'Reversed' },
  unhealthy: { color: 'error', label: 'Unhealthy' },
  closed: { color: 'default', label: 'Closed' },
  cancelled: { color: 'default', label: 'Cancelled' },
  refunded: { color: 'default', label: 'Refunded' },
  inactive: { color: 'default', label: 'Inactive' },
}

export function toTitleCase(str: string): string {
  return str
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function normalize(status?: string | null): string {
  return status?.toString().trim().toLowerCase() ?? ''
}

export function resolveStatusColor(status?: string | null): MuiChipColor {
  return STATUS_MAP[normalize(status)]?.color ?? 'default'
}

export function resolveStatusConfig(status?: string | null): StatusConfig | undefined {
  return STATUS_MAP[normalize(status)]
}
