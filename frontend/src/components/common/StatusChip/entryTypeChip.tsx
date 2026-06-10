import { Chip, type ChipProps } from '@mui/material'
import type { ReactNode } from 'react'

import { toTitleCase } from './statusColors'

export type EntryTypeColor = 'default' | 'primary' | 'secondary' | 'info' | 'warning'

interface EntryTypeConfig {
  color: EntryTypeColor
  label: string
}

export const ENTRY_TYPE_MAP: Record<string, EntryTypeConfig> = {
  manual: { color: 'primary', label: 'Manual' },
  system: { color: 'secondary', label: 'System' },
  adjustment: { color: 'warning', label: 'Adjustment' },
  closing: { color: 'info', label: 'Closing' },
  opening: { color: 'info', label: 'Opening' },
}

export interface EntityTypeChipProps extends Omit<ChipProps, 'color' | 'label'> {
  type?: string | null
  label?: ReactNode
}

const defaultSx = { fontSize: '0.75rem', fontWeight: 600 }

export function EntityTypeChip({ type, label, sx, ...rest }: EntityTypeChipProps) {
  const normalized = type?.toString().trim() ?? ''
  const config = ENTRY_TYPE_MAP[normalized.toLowerCase()]
  const resolvedLabel =
    label ?? config?.label ?? (normalized ? toTitleCase(normalized) : 'Unknown')

  return (
    <Chip
      size="small"
      variant="outlined"
      color={config?.color ?? 'default'}
      label={resolvedLabel}
      {...rest}
      sx={[defaultSx, ...(Array.isArray(sx) ? sx : sx ? [sx] : [])]}
    />
  )
}
