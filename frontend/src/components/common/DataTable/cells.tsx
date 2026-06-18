import { Box, Button, Typography } from '@mui/material'
import type { ReactNode } from 'react'

export function bold(value: ReactNode): ReactNode {
  return (
    <Typography variant="body2" sx={{ fontWeight: 600 }}>
      {value}
    </Typography>
  )
}

export function viewAction(onClick: () => void, disabled = false): ReactNode {
  return (
    <Button size="small" variant="text" onClick={onClick} disabled={disabled}>
      View
    </Button>
  )
}

/**
 * Render multiple chips in one cell (e.g. payment + fulfillment status).
 * Chips are rendered from an array of children, so callers MUST give every
 * chip a stable `key` prop (e.g. `<StatusChip key="payment" ... />`).
 */
export function statusGroup(chips: ReactNode[]): ReactNode {
  return <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>{chips}</Box>
}
