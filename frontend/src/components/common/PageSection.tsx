import type { ReactNode } from 'react'
import { Box, Paper, Typography } from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'

interface PageSectionProps {
  label: string
  meta?: ReactNode
  /**
   * Stretch to fill the parent's height with an internally scrolling body.
   * Correct for a single card owning a workspace pane; leave off when stacking
   * several cards in a scrolling column, or they compete for height and each
   * grows its own scrollbar.
   */
  fill?: boolean
  children: ReactNode
}

export default function PageSection({ label, meta, fill = false, children }: PageSectionProps) {
  return (
    <Paper
      sx={fill ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } : undefined}
    >
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
      <Box sx={fill ? { flex: 1, minHeight: 0, overflow: 'auto' } : undefined}>{children}</Box>
    </Paper>
  )
}
