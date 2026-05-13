import type { ReactNode } from 'react'
import { Box, Typography } from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'

interface WorkspaceCardSectionHeaderProps {
  title: string
  action?: ReactNode
}

export function WorkspaceCardSectionHeader({ title, action }: WorkspaceCardSectionHeaderProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        p: TABLE_STYLES.cell.padding.px,
        borderBottom: TABLE_STYLES.cell.border,
      }}
    >
      <Typography
        variant="tableHeader"
        sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
      >
        {title}
      </Typography>
      {action}
    </Box>
  )
}
