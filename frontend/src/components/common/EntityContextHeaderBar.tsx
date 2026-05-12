import type { ReactNode } from 'react'
import { Box, Typography } from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'

interface EntityContextHeaderBarProps {
  title: string
  statusChip?: ReactNode
  actions?: ReactNode
}

export function EntityContextHeaderBar({
  title,
  statusChip,
  actions,
}: EntityContextHeaderBarProps) {
  return (
    <Box
      sx={{
        p: TABLE_STYLES.cell.padding.px,
        borderBottom: TABLE_STYLES.cell.border,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Typography
          variant="tableHeader"
          sx={{
            fontWeight: 600,
            fontSize: '0.8rem',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          {title}
        </Typography>
        {statusChip}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {actions}
      </Box>
    </Box>
  )
}
