import { Chip, type ChipProps } from '@mui/material'
import type { ReactNode } from 'react'

import { resolveStatusConfig, toTitleCase } from './statusColors'

export interface StatusChipProps extends Omit<ChipProps, 'color' | 'label'> {
  status?: string | null
  /** Override the canonical label (color stays canonical). */
  label?: ReactNode
}

const defaultSx = { fontSize: '0.75rem', fontWeight: 600 }

export function StatusChip({ status, label, sx, ...rest }: StatusChipProps) {
  const normalized = status?.toString().trim() ?? ''
  const config = resolveStatusConfig(normalized)
  const resolvedLabel =
    label ?? config?.label ?? (normalized ? toTitleCase(normalized) : 'Unknown')

  return (
    <Chip
      size="small"
      color={config?.color ?? 'default'}
      label={resolvedLabel}
      {...rest}
      sx={[defaultSx, ...(Array.isArray(sx) ? sx : sx ? [sx] : [])]}
    />
  )
}
