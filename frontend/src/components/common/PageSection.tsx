import type { ReactNode } from 'react'
import { Box, Paper, Typography } from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'

interface PageSectionProps {
  label: string
  meta?: ReactNode
  children: ReactNode
}

export default function PageSection({ label, meta, children }: PageSectionProps) {
  return (
    <Paper sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          p: TABLE_STYLES.cell.padding.px,
          borderBottom: TABLE_STYLES.cell.border,
        }}
      >
        <Typography
          variant="tableHeader"
          sx={{
            fontWeight: 600,
            fontSize: '0.8rem',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          {label}
        </Typography>
        {meta && <Box data-testid="page-section-meta">{meta}</Box>}
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{children}</Box>
    </Paper>
  )
}
