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

export function statusGroup(chips: ReactNode[]): ReactNode {
  return <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>{chips}</Box>
}
